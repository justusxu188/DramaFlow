import type { VideoPromptSegment } from "@/lib/pipeline-store";
import type { VideoPromptPlan } from "@/lib/pipeline-store";

const legacyNegativePrompt =
  "按每个片段 video_prompt 内的【全局限制(Negative)】执行";

const structuralMarkerPattern =
  "主体锁定|场景设定|类型与风格|摄影机参数|镜头参数|灯光|" +
  "画面描述|镜头\\d+|画面文字|字幕样式|声音|" +
  "全局限制(?:\\(Negative\\))?";

function structuralMarker() {
  return new RegExp(`【(${structuralMarkerPattern})】`, "g");
}

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[。！？.!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function usable(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed && trimmed !== "无" ? trimmed : "";
}

export function stripVideoRatioInstructions(value: string) {
  const ratio =
    "(?:9\\s*[:：]\\s*16|16\\s*[:：]\\s*9|1\\s*[:：]\\s*1|" +
    "4\\s*[:：]\\s*3|3\\s*[:：]\\s*4)";
  const withoutPlatformParameters = value
    .replace(
      /(?:适配|符合|针对)?\s*(?:短视频|抖音|快手|小红书)(?:等)?平台(?:的)?(?:观看)?(?:画幅|宽高比|纵横比|比例|规格|格式)/gi,
      "",
    )
    .replace(
      new RegExp(
        `(?:竖屏|横屏)?\\s*${ratio}\\s*(?:画幅|比例|构图)?`,
        "gi",
      ),
      "",
    )
    .replace(
      /(?:画幅|宽高比|纵横比)(?:比例)?\s*(?:为|是|[:：])?\s*/g,
      "",
    )
    .replace(/(?:竖屏|横屏)(?:画幅|比例|构图)?/g, "")
    .replace(
      /(?:分辨率|清晰度)\s*(?:为|是|[:：])?\s*\d{3,4}\s*[pP]\b/gi,
      "",
    )
    .replace(/\b\d{3,4}\s*[pP]\s*(?:分辨率|清晰度)?\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*fps\b/gi, "")
    .replace(
      /\d+(?:\.\d+)?\s*帧\s*(?:\/\s*秒|每秒)?/gi,
      "",
    )
    .replace(
      /(?:分辨率|帧率|码率|文件格式)\s*(?:为|是|[:：])?\s*/gi,
      "",
    );
  return stripGlobalLensInstructions(withoutPlatformParameters)
    .replace(/(^|【[^】]+】)\s*[，,；;]+/g, "$1")
    .replace(/[，,；;]{2,}/g, "；")
    .trim();
}

export function stripGlobalLensInstructions(value: string) {
  const sectionParts = value.split(/(【[^】]+】)/g);
  let inShotSection = false;
  return sectionParts.map((part) => {
    if (/^【[^】]+】$/.test(part)) {
      inShotSection = /^【镜头\d+】$/.test(part);
      return part;
    }
    if (inShotSection) return part;
    return part.replace(
      /(?:统一|全局)?\s*(?:采用|使用)?\s*\d{1,3}(?:\.\d+)?(?:\s*[-–~至]\s*\d{1,3}(?:\.\d+)?)?\s*(?:mm|毫米)\s*(?:焦段|定焦镜头|变焦镜头|镜头)?/gi,
      "",
    );
  }).join("");
}

export function hasGlobalLensInstructions(value: string) {
  return stripGlobalLensInstructions(value) !== value;
}

export function insertCharacterAssetMentions(
  prompt: string,
  characterNames: string[],
) {
  let result = prompt;
  const prefixes: string[] = [];
  for (const name of [...new Set(characterNames)].filter(Boolean)) {
    const escapedName = name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const unboundMention = new RegExp(
      `(?<!@)${escapedName}`,
      "g",
    );
    const updated = result.replace(
      unboundMention,
      `@${name}`,
    );
    if (updated !== result) {
      result = updated;
    } else if (!result.includes(`@${name}`)) {
      prefixes.push(`@${name}`);
    }
  }
  return prefixes.length
    ? `${prefixes.join(" ")} ${result}`
    : result;
}

export function resolveCharacterAssetMentionsForSubmission(
  prompt: string,
  bindings: Array<{
    characterName: string;
    assetIds: string[];
    useTextToVideo?: boolean;
  }>,
) {
  const imageIndexByAssetId = new Map<string, number>();
  let result = prompt;
  for (const binding of bindings) {
    if (
      binding.useTextToVideo ||
      binding.assetIds.length === 0
    ) {
      continue;
    }
    const imageLabels = [
      ...new Set(binding.assetIds),
    ].map((assetId) => {
      let imageIndex = imageIndexByAssetId.get(assetId);
      if (imageIndex === undefined) {
        imageIndex = imageIndexByAssetId.size + 1;
        imageIndexByAssetId.set(assetId, imageIndex);
      }
      return `图片${imageIndex}`;
    });
    const escapedName = binding.characterName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    result = result.replace(
      new RegExp(`@${escapedName}`, "g"),
      imageLabels.join("、"),
    );
  }
  return result;
}

function explicitlyDisables(
  prompt: string,
  kind: "audio" | "subtitle",
) {
  const compact = prompt.replace(/\s+/g, "");
  return kind === "audio"
    ? /无配音|无BGM|无背景音乐|无音效|保持静音|全程静音|禁止(?:出现|生成|添加)?(?:任何)?声音/.test(
        compact,
      )
    : /无字幕|不显示字幕|不要字幕|禁止(?:出现|生成|添加)?(?:任何)?字幕/.test(
        compact,
      );
}

function mergeSection(
  prompt: string,
  label: string,
  additions: string[],
  insertBeforeLabel?: string,
  onlyWhenEmpty = false,
) {
  const content = additions
    .map(usable)
    .filter(Boolean)
    .filter((value) => !prompt.includes(value));
  if (!content.length) return prompt;

  const markerText = `【${label}】`;
  const start = prompt.indexOf(markerText);
  const addition = content.join("；");
  if (start < 0) {
    const preferredStart = insertBeforeLabel
      ? prompt.indexOf(`【${insertBeforeLabel}】`)
      : -1;
    const negativeStart = prompt.indexOf(
      "【全局限制(Negative)】",
    );
    const insertAt =
      preferredStart >= 0
        ? preferredStart
        : negativeStart >= 0
          ? negativeStart
          : prompt.length;
    return `${prompt.slice(0, insertAt)}${markerText}${addition}` +
      prompt.slice(insertAt);
  }

  const contentStart = start + markerText.length;
  const nextMarker = structuralMarker();
  nextMarker.lastIndex = contentStart;
  const next = nextMarker.exec(prompt);
  const contentEnd = next?.index ?? prompt.length;
  const current = prompt.slice(contentStart, contentEnd).trim();
  if (onlyWhenEmpty && current) {
    return prompt;
  }
  const merged =
    !current || current === "无"
      ? addition
      : `${current}；${addition}`;
  return `${prompt.slice(0, contentStart)}${merged}` +
    prompt.slice(contentEnd);
}

export function buildSeedanceSegmentPrompt(input: {
  globalVisualStyle: string;
  characterLock: string;
  sceneLock: string;
  voiceCards?: string;
  musicLine?: string;
  soundPrinciple?: string;
  persistentText?: string;
  subtitleStyle?: string;
  negativePrompt: string;
  segment: VideoPromptSegment;
}) {
  let prompt = stripVideoRatioInstructions(
    removePromptSection(
      input.segment.prompt,
      "合规角标",
    ),
  );
  if (
    prompt.includes("【画面描述】") &&
    prompt.includes(
      "【全局限制(Negative)】",
    )
  ) {
    prompt = mergeSection(
      prompt,
      "画面文字",
      [input.persistentText ?? ""],
    );
    if (!explicitlyDisables(prompt, "audio")) {
      prompt = mergeSection(prompt, "声音", [
        input.voiceCards ?? "",
        input.musicLine ?? "",
      ], undefined, true);
    }
    if (!explicitlyDisables(prompt, "subtitle")) {
      prompt = mergeSection(
        prompt,
        "字幕样式",
        [input.subtitleStyle ?? ""],
        "声音",
        true,
      );
    }
    return prompt;
  }
  return [
    [
      sentence(
        stripVideoRatioInstructions(input.globalVisualStyle),
      ),
      input.characterLock
        ? `角色一致性：${sentence(input.characterLock)}`
        : "",
      input.sceneLock
        ? `场景一致性：${sentence(input.sceneLock)}`
        : "",
    ].join(""),
    `当前片段：${sentence(prompt)}`,
    input.segment.sound
      ? `声音：${sentence(input.segment.sound)}`
      : "",
    !explicitlyDisables(prompt, "audio") &&
      usable(input.voiceCards)
      ? `固定音色：${sentence(input.voiceCards ?? "")}`
      : "",
    !explicitlyDisables(prompt, "audio") &&
      usable(input.musicLine)
      ? `音乐：${sentence(input.musicLine ?? "")}`
      : "",
    !explicitlyDisables(prompt, "audio") &&
      usable(input.soundPrinciple)
      ? `声音原则：${sentence(input.soundPrinciple ?? "")}`
      : "",
    usable(input.persistentText)
      ? `常驻文字：${sentence(input.persistentText ?? "")}`
      : "",
    !explicitlyDisables(prompt, "subtitle") &&
      usable(input.subtitleStyle)
      ? `字幕样式：${sentence(input.subtitleStyle ?? "")}`
      : "",
    input.negativePrompt
      ? `稳定性限制：${sentence(input.negativePrompt)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function resolveSubmittedSeedancePrompt(input: {
  globalVisualStyle: string;
  characterLock: string;
  sceneLock: string;
  voiceCards?: string;
  musicLine?: string;
  soundPrinciple?: string;
  persistentText?: string;
  subtitleStyle?: string;
  negativePrompt: string;
  segment: VideoPromptSegment;
}) {
  const submitted = input.segment.submittedPrompt?.trim();
  if (submitted && !submitted.includes(legacyNegativePrompt)) {
    return stripVideoRatioInstructions(submitted);
  }
  return buildSeedanceSegmentPrompt(input);
}

export function withSubmittedSeedancePrompts(
  plan: VideoPromptPlan,
): VideoPromptPlan {
  return {
    ...plan,
    segments: plan.segments.map((segment) => ({
      ...segment,
      submittedPrompt: buildSeedanceSegmentPrompt({
        globalVisualStyle: plan.globalVisualStyle,
        characterLock: plan.characterLock,
        sceneLock: plan.sceneLock,
        voiceCards: plan.voiceCards,
        musicLine: plan.musicLine,
        soundPrinciple: plan.soundPrinciple,
        persistentText: plan.persistentText,
        subtitleStyle: plan.subtitleStyle,
        negativePrompt: plan.negativePrompt,
        segment,
      }),
    })),
  };
}

export function constrainVideoPromptPlanSegments(
  plan: VideoPromptPlan,
  targetDurations: number[],
  targetSourceBeats: string[][] = [],
): VideoPromptPlan {
  if (!targetDurations.length || !plan.segments.length) return plan;

  const sourceTotal = plan.segments.reduce(
    (total, segment) => total + Math.max(0, segment.duration),
    0,
  );
  const targetTotal = targetDurations.reduce(
    (total, duration) => total + duration,
    0,
  );
  if (sourceTotal <= 0 || targetTotal <= 0) return plan;

  const sourceRanges = plan.segments.map((segment, index) => {
    const start = plan.segments
      .slice(0, index)
      .reduce(
        (total, item) =>
          total + (Math.max(0, item.duration) / sourceTotal) * targetTotal,
        0,
      );
    const end =
      start +
      (Math.max(0, segment.duration) / sourceTotal) * targetTotal;
    return { segment, start, end };
  });

  let targetStart = 0;
  const segments = targetDurations.map((duration, index) => {
    const targetEnd = targetStart + duration;
    const overlapping = sourceRanges
      .filter(({ start, end }) => end > targetStart && start < targetEnd)
      .map(({ segment }) => segment);
    const sources = overlapping.length
      ? overlapping
      : [plan.segments[Math.min(index, plan.segments.length - 1)]];
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
    const segment = {
      index,
      clipId:
        sources.length === 1
          ? sources[0].clipId
          : `VP${index + 1}`,
      sourceBeats: unique(
        targetSourceBeats[index]?.length
          ? targetSourceBeats[index]
          : sources.flatMap(
              (source) => source.sourceBeats ?? [],
            ),
      ),
      duration,
      referenceAssets: unique(
        sources.flatMap((source) => source.referenceAssets),
      ),
      prompt: unique(sources.map((source) => source.prompt)).join("\n"),
      sound: unique(sources.map((source) => source.sound)).join("；"),
    };
    targetStart = targetEnd;
    return segment;
  });

  return { ...plan, segments };
}

export type SeedancePromptSection = {
  label: string;
  content: string;
};

export function splitSeedancePromptForDisplay(
  prompt: string,
): SeedancePromptSection[] {
  const marker = structuralMarker();
  const matches = [...prompt.matchAll(marker)];
  if (!matches.length) {
    return prompt
      .split(/\n+/)
      .map((content) => content.trim())
      .filter(Boolean)
      .map((content) => ({ label: "", content }));
  }

  const sections: SeedancePromptSection[] = [];
  const leading = prompt.slice(0, matches[0].index).trim();
  if (leading) sections.push({ label: "", content: leading });

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index
        : prompt.length;
    sections.push({
      label: match[1].replace(/\s+/g, ""),
      content: prompt.slice(start, end).trim(),
    });
  });
  return sections;
}

function removePromptSection(
  prompt: string,
  sectionName: string,
) {
  const escaped = sectionName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  return prompt
    .replace(
      new RegExp(
        `【${escaped}】[\\s\\S]*?(?=【(?:主体锁定|场景设定|类型与风格|摄影机参数|镜头参数|灯光|画面描述|镜头\\d+|画面文字|字幕样式|声音|全局限制(?:\\(Negative\\))?)】|$)`,
        "g",
      ),
      "",
    )
    .trim();
}
