import type {
  ScriptDraft,
  VideoScriptSegment,
} from "@/lib/providers/types";
import { splitDurationByLimit } from "@/lib/production-config";

const minimumSegmentDuration = 4;

function parseTimePoint(value: string) {
  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function parseShotDuration(time: string) {
  const match = time.match(
    /(\d+(?::\d{1,2}(?:\.\d+)?)?)\s*(?:秒|s)?\s*[-–—~～至到]\s*(\d+(?::\d{1,2}(?:\.\d+)?)?)/i,
  );
  if (!match) return null;
  const start = parseTimePoint(match[1]);
  const end = parseTimePoint(match[2]);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

function allocateShotDurations(
  sourceDurations: number[],
  total: number,
) {
  const remaining = total - sourceDurations.length;
  if (remaining <= 0) {
    return sourceDurations.map(() => 1);
  }
  const sourceTotal = sourceDurations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const scale = sourceTotal > 0 ? total / sourceTotal : 1;
  const preferredDurations = sourceDurations.map(
    (duration) => duration * scale,
  );
  const extraWeights = preferredDurations.map(
    (duration) => Math.max(0, duration - 1),
  );
  const extraWeightTotal = extraWeights.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const exactExtras = extraWeights.map((weight) =>
    extraWeightTotal > 0
      ? weight * remaining / extraWeightTotal
      : remaining / sourceDurations.length,
  );
  const extras = exactExtras.map(Math.floor);
  let undistributed =
    remaining - extras.reduce((sum, duration) => sum + duration, 0);
  const allocationOrder = exactExtras
    .map((duration, index) => ({
      index,
      remainder: duration - Math.floor(duration),
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder ||
        left.index - right.index,
    );
  for (let index = 0; undistributed > 0; index += 1) {
    extras[allocationOrder[index % allocationOrder.length].index] += 1;
    undistributed -= 1;
  }
  return extras.map((duration) => duration + 1);
}

function hasSemanticBoundary(
  shot: ScriptDraft["shots"][number],
) {
  const description = [
    shot.visual,
    shot.dialogue,
    shot.editingRhythm,
    shot.purpose,
  ]
    .filter(Boolean)
    .join(" ");
  return /切到|切入|转场|闪白|场景(?:变化|切换)|硬切|跳切|镜头切换/.test(
    description,
  );
}

export function planVideoSegments(
  shots: ScriptDraft["shots"],
  totalDuration: number,
  segmentLimit: number,
): VideoScriptSegment[] {
  const total = Math.max(
    minimumSegmentDuration,
    Math.round(totalDuration),
  );
  const limit = Math.max(
    minimumSegmentDuration,
    Math.round(segmentLimit),
  );
  if (!shots.length) {
    return splitDurationByLimit(total, limit).map(
      (duration, index) => ({
        index,
        duration,
        shotIndexes: [],
        shotDurations: [],
        shots: [],
      }),
    );
  }
  if (total < shots.length) {
    throw new Error(
      `目标总时长 ${total} 秒不足以容纳 ${shots.length} 个完整镜头，请减少镜头或增加时长`,
    );
  }

  const parsedDurations = shots.map((shot) =>
    parseShotDuration(shot.time),
  );
  const allTimesValid = parsedDurations.every(
    (duration): duration is number => duration !== null,
  );
  const sourceDurations = allTimesValid
    ? parsedDurations
    : shots.map(() => total / shots.length);
  const shotDurations = allocateShotDurations(
    sourceDurations,
    total,
  );

  shotDurations.forEach((duration, shotIndex) => {
    if (duration <= 0) {
      throw new Error(
        `第 ${shotIndex + 1} 个镜头没有可用时长，请增加目标总时长`,
      );
    }
    if (duration > limit) {
      throw new Error(
        `第 ${shotIndex + 1} 个单镜头时长 ${duration} 秒，超过当前模型单次 ${limit} 秒上限，请先拆分该镜头`,
      );
    }
  });

  if (total <= limit) {
    return [{
      index: 0,
      duration: total,
      shotIndexes: shots.map((_, index) => index),
      shotDurations,
      shots,
    }];
  }

  type SegmentGroup = {
    duration: number;
    shotIndexes: number[];
  };
  type SegmentPlan = {
    crossedBoundaries: number;
    groups: SegmentGroup[];
  };
  const plans: Array<SegmentPlan | undefined> =
    Array(shots.length + 1);
  plans[shots.length] = {
    crossedBoundaries: 0,
    groups: [],
  };

  for (let start = shots.length - 1; start >= 0; start -= 1) {
    let duration = 0;
    let crossedBoundaries = 0;
    for (let end = start; end < shots.length; end += 1) {
      duration += shotDurations[end];
      if (end > start && hasSemanticBoundary(shots[end])) {
        crossedBoundaries += 1;
      }
      if (duration > limit) break;
      if (duration < minimumSegmentDuration || !plans[end + 1]) {
        continue;
      }
      const tail = plans[end + 1]!;
      const candidate: SegmentPlan = {
        crossedBoundaries:
          crossedBoundaries + tail.crossedBoundaries,
        groups: [{
          duration,
          shotIndexes: Array.from(
            { length: end - start + 1 },
            (_, offset) => start + offset,
          ),
        }, ...tail.groups],
      };
      const current = plans[start];
      if (
        !current ||
        candidate.crossedBoundaries <
          current.crossedBoundaries ||
        (
          candidate.crossedBoundaries ===
            current.crossedBoundaries &&
          candidate.groups.length < current.groups.length
        )
      ) {
        plans[start] = candidate;
      }
    }
  }

  const groups = plans[0]?.groups;
  if (!groups) {
    throw new Error(
      `镜头组合无法满足每段 ${minimumSegmentDuration}-${limit} 秒，请调整脚本镜头时长`,
    );
  }

  return groups.map((group, index) => ({
    index,
    duration: group.duration,
    shotIndexes: group.shotIndexes,
    shotDurations: group.shotIndexes.map(
      (shotIndex) => shotDurations[shotIndex],
    ),
    shots: group.shotIndexes.map(
      (shotIndex) => shots[shotIndex],
    ),
  }));
}
