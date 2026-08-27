import type { SubtitleVerificationEvidence } from "@/lib/subtitle-video-verification";
import {
  subtitleFontTypes,
  subtitlePositions,
  type ProductionConfig,
} from "@/lib/production-config";

// Shared, client-safe subtitle helpers used by both the preroll review
// controls and the video post-production workspace. This module MUST NOT
// import any node-only dependency (the `SubtitleVerificationEvidence`
// import above is type-only and erased at build time), so it can run in
// the browser bundle.

export type SubtitleDraft = {
  id: string;
  subtitleText: string;
  startTime: number;
  endTime: number;
  speaker?: string;
};

export type SubtitleTimeRange = {
  startTime: number;
  endTime: number;
};

export function normalizeTimeRanges(
  ranges: SubtitleTimeRange[],
  duration: number,
) {
  const normalized = ranges
    .flatMap((range) => {
      const startTime = Math.max(
        0,
        Math.min(duration, range.startTime),
      );
      const endTime = Math.max(
        0,
        Math.min(duration, range.endTime),
      );
      return Number.isFinite(startTime) &&
        Number.isFinite(endTime) &&
        endTime > startTime
        ? [{
            startTime: Number(startTime.toFixed(3)),
            endTime: Number(endTime.toFixed(3)),
          }]
        : [];
    })
    .sort((left, right) => left.startTime - right.startTime);

  return normalized.reduce<SubtitleTimeRange[]>(
    (result, range) => {
      const previous = result.at(-1);
      if (previous && range.startTime <= previous.endTime) {
        previous.endTime = Math.max(
          previous.endTime,
          range.endTime,
        );
        return result;
      }
      result.push({ ...range });
      return result;
    },
    [],
  );
}

export function complementTimeRanges(
  ranges: SubtitleTimeRange[],
  duration: number,
) {
  const normalized = normalizeTimeRanges(ranges, duration);
  const result: SubtitleTimeRange[] = [];
  let cursor = 0;
  for (const range of normalized) {
    if (range.startTime > cursor) {
      result.push({
        startTime: cursor,
        endTime: range.startTime,
      });
    }
    cursor = range.endTime;
  }
  if (cursor < duration) {
    result.push({ startTime: cursor, endTime: duration });
  }
  return result;
}

export function clipSubtitlesToRanges(
  subtitles: SubtitleDraft[],
  ranges: SubtitleTimeRange[],
) {
  return subtitles.flatMap((subtitle) =>
    ranges.flatMap((range, rangeIndex) => {
      const startTime = Math.max(
        subtitle.startTime,
        range.startTime,
      );
      const endTime = Math.min(
        subtitle.endTime,
        range.endTime,
      );
      return endTime > startTime
        ? [{
            ...subtitle,
            id: `${subtitle.id}-range-${rangeIndex + 1}`,
            startTime: Number(startTime.toFixed(3)),
            endTime: Number(endTime.toFixed(3)),
          }]
        : [];
    }),
  );
}

// A single source of truth for how burned subtitles look. Both entry
// points must use these constants so a caption that passes visual
// verification in one place renders identically in the other. Previously
// the workspace used fontSize 48 while the preroll used 58, which caused
// subtle drift between the two flows.
export type SubtitleBurnStyle = {
  fontType: ProductionConfig["subtitleFontType"];
  fontSize: number;
  fontColor: string;
  position: ProductionConfig["subtitlePosition"];
};

export const SUBTITLE_BURN_DEFAULTS: SubtitleBurnStyle = {
  fontType: "sy_black",
  fontSize: 58,
  fontColor: "#FFFFFFFF",
  position: "center",
};

export function subtitleBurnStyleFromProductionConfig(
  style?: Pick<
    ProductionConfig,
    | "subtitleFontType"
    | "subtitleFontSize"
    | "subtitleFontColor"
    | "subtitlePosition"
  >,
): SubtitleBurnStyle {
  return style
    ? {
        fontType: style.subtitleFontType,
        fontSize: style.subtitleFontSize,
        fontColor: style.subtitleFontColor,
        position: style.subtitlePosition,
      }
    : { ...SUBTITLE_BURN_DEFAULTS };
}

export function isSubtitleBurnStyleValid(
  style: SubtitleBurnStyle,
) {
  return (
    subtitleFontTypes.includes(style.fontType) &&
    Number.isInteger(style.fontSize) &&
    style.fontSize >= 12 &&
    style.fontSize <= 160 &&
    /^#[0-9A-Fa-f]{8}$/.test(style.fontColor) &&
    subtitlePositions.includes(style.position)
  );
}

// Normalize ASR / edited subtitles before burning:
// - convert millisecond timestamps to seconds when the values are
//   obviously in ms (either they exceed the known duration by 10x, or no
//   duration is known yet and the values are >= 1000);
// - clamp captions to the video duration;
// - drop empty and out-of-range captions.
export function normalizeSubtitles(
  subtitles: SubtitleDraft[],
  duration: number,
) {
  const maxEnd = Math.max(
    0,
    ...subtitles.map((subtitle) => subtitle.endTime),
  );
  const scale =
    (
      duration > 0 &&
      maxEnd > duration * 10 &&
      maxEnd / 1000 <= duration + 1
    ) ||
    (
      duration <= 0 &&
      maxEnd >= 1000
    )
      ? 1000
      : 1;
  return subtitles.flatMap((subtitle, index) => {
    const startTime = Math.max(
      0,
      subtitle.startTime / scale,
    );
    const endTime =
      duration > 0
        ? Math.min(duration, subtitle.endTime / scale)
        : subtitle.endTime / scale;
    const subtitleText = subtitle.subtitleText.trim();
    if (
      !subtitleText ||
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      endTime <= startTime
    ) {
      return [];
    }
    return [{
      id: subtitle.id || `subtitle-${index + 1}`,
      subtitleText,
      startTime: Number(startTime.toFixed(3)),
      endTime: Number(endTime.toFixed(3)),
    }];
  });
}

export type SubtitleTaskResult = {
  status?: string;
  progress?: number;
  videoUrl?: string;
  subtitles?: SubtitleDraft[];
  subtitleVerification?: SubtitleVerificationEvidence;
};

// A lightweight poller for subtitle-related MediaKit tasks. It starts the
// task, then polls until completion, forwarding the `sourceVideoUrl` /
// `subtitles` context required for server-side visual verification on
// `add_subtitles`. The post-production workspace keeps its own richer
// poller because it also persists task state to localStorage for
// resume-after-refresh; this helper serves the simpler preroll controls
// and any caller that does not need persistence.
export async function runSubtitleTask(
  projectId: string,
  operation:
    | "erase_subtitles"
    | "asr"
    | "add_subtitles"
    | "enhance",
  input: Record<string, unknown>,
  options: {
    attempts?: number;
    intervalMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<SubtitleTaskResult> {
  const attempts = options.attempts ?? 120;
  const intervalMs = options.intervalMs ?? 1500;
  const doFetch = options.fetchImpl ?? fetch;
  const startResponse = await doFetch(
    `/api/projects/${projectId}/post-production`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        operation,
        ...input,
      }),
    },
  );
  const startPayload = (await startResponse.json()) as {
    data?: { id?: string };
    error?: string;
  };
  if (!startResponse.ok || !startPayload.data?.id) {
    throw new Error(startPayload.error ?? "任务启动失败");
  }
  const taskId = startPayload.data.id;
  const statusContext =
    operation === "add_subtitles"
      ? {
          sourceVideoUrl: input.videoUrl,
          subtitles: input.subtitles,
        }
      : {};
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const statusResponse = await doFetch(
      `/api/projects/${projectId}/post-production`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          operation,
          taskId,
          ...statusContext,
        }),
      },
    );
    const statusPayload = (await statusResponse.json()) as {
      data?: SubtitleTaskResult;
      error?: string;
    };
    if (!statusResponse.ok && statusResponse.status !== 202) {
      throw new Error(statusPayload.error ?? "任务处理失败");
    }
    if (statusPayload.data?.status === "completed") {
      return statusPayload.data;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("处理时间过长，请稍后重试");
}
