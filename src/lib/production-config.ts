import { z } from "zod";
import { prerollTypes, type PrerollType } from "@/lib/domain";

export const expressionTypes = [
  "abnormal_dialogue",
  "supernatural_power",
  "identity_contrast",
  "life_crisis",
  "uncanny_spectacle",
  "engineering_nature_spectacle",
  "negative_impact",
  "absurd_comedy",
  "evidence_reveal",
  "result_first_flashback",
  "custom",
] as const;

export const expressionTypeLabels: Record<
  (typeof expressionTypes)[number],
  string
> = {
  abnormal_dialogue: "反常台词悬念",
  supernatural_power: "超自然异能猎奇",
  identity_contrast: "极致身份反差",
  life_crisis: "生死危机开场",
  uncanny_spectacle: "违和奇观",
  engineering_nature_spectacle: "工程或自然奇观",
  negative_impact: "负面冲击诱饵",
  absurd_comedy: "荒诞喜剧或离谱数据",
  evidence_reveal: "证据实锤前置",
  result_first_flashback: "结果前置倒叙",
  custom: "自定义",
};

export const expressionTypeDescriptions: Record<
  (typeof expressionTypes)[number],
  string
> = {
  abnormal_dialogue: "用一句违反常理的台词直接制造悬念。",
  supernatural_power: "让异能、系统、金手指或玄学异相突然显现。",
  identity_contrast: "用底层与顶层、平凡与隐藏身份的瞬间反差抓人。",
  life_crisis: "从追杀、倒计时或命悬一线的危险动作直接开场。",
  uncanny_spectacle: "在普通日常场景中突然出现超现实景象。",
  engineering_nature_spectacle: "用重型机械、极端环境、巨兽或大规模施工制造体量冲击。",
  negative_impact: "用脏污、翻车、羞辱或算计制造憋屈和愤怒。",
  absurd_comedy: "用夸张回怼、离谱数字或荒唐设定制造笑点。",
  evidence_reveal: "把录音、账单、监控等关键证据直接甩在开头。",
  result_first_flashback: "先给最爆的结果，再通过时间线回扣起因。",
  custom: "直接指定希望创作的 AI 前贴类型、钩子结构和视觉方向。",
};

export const characterModes = [
  "drama_character",
  "new_character_assets",
  "text_to_video",
] as const;

export const videoModels = [
  "default",
  "seedance_2_5",
  "seedance_2_0",
  "seedance_2_0_mini",
  "seedance_2_0_fast",
] as const;

export function videoGenerationSegmentLimit(
  model: (typeof videoModels)[number],
) {
  return model === "seedance_2_5" ? 30 : 15;
}

export function splitDurationByLimit(
  totalDuration: number,
  segmentLimit: number,
) {
  const total = Math.max(4, Math.round(totalDuration));
  const limit = Math.max(4, Math.round(segmentLimit));
  const count = Math.ceil(total / limit);
  const base = Math.floor(total / count);
  const remainder = total % count;

  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

export function videoGenerationSegmentDurations(
  totalDuration: number,
  model: (typeof videoModels)[number],
) {
  return splitDurationByLimit(
    totalDuration,
    videoGenerationSegmentLimit(model),
  );
}

export const videoModelLabels: Record<
  (typeof videoModels)[number],
  string
> = {
  default: "Seedance 2.5",
  seedance_2_5: "Seedance 2.5",
  seedance_2_0: "Seedance 2.0",
  seedance_2_0_mini: "Seedance 2.0 Mini",
  seedance_2_0_fast: "Seedance 2.0 Fast",
};

export function videoModelOptions(
  selectedModel: (typeof videoModels)[number],
) {
  return videoModels.filter((model) =>
    selectedModel === "default"
      ? model !== "seedance_2_5"
      : model !== "default",
  );
}

export const imageModels = [
  "seedream_5_0_pro",
  "seedream_5_0_lite",
] as const;

export const imageModelLabels: Record<
  (typeof imageModels)[number],
  string
> = {
  seedream_5_0_pro: "Seedream 5.0 Pro",
  seedream_5_0_lite: "Seedream 5.0 Lite",
};

export const videoResolutions = [
  "480p",
  "720p",
  "1080p",
] as const;

export function normalizeVideoResolution(
  value: unknown,
  fallback: (typeof videoResolutions)[number] = "720p",
) {
  const normalized =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "";
  return videoResolutions.includes(
    normalized as (typeof videoResolutions)[number],
  )
    ? (normalized as (typeof videoResolutions)[number])
    : fallback;
}

export const videoResolutionSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value.trim().toLowerCase()
      : value,
  z.enum(videoResolutions),
);

export const videoRatios = [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
] as const;

export const characterModeLabels: Record<(typeof characterModes)[number], string> = {
  drama_character: "使用剧中人物",
  new_character_assets: "新创人物资产",
  text_to_video: "纯文生视频",
};

export const highlightTargetModes = ["duration", "count"] as const;
export const productionEntries = [
  "full_drama",
  "uploaded_highlights",
  "batch_highlights",
] as const;
export const executionModes = ["manual", "agent"] as const;
export const highlightCutModes = ["Mixed", "Sequential"] as const;
export const highlightContentTypes = ["animation", "live_action"] as const;
export const highlightContentTypeLabels: Record<
  (typeof highlightContentTypes)[number],
  string
> = {
  animation: "AI 漫剧 / 仿真人剧",
  live_action: "真人短剧",
};
export const subtitleFontTypes = [
  "sy_black",
  "pm_zhengdao",
  "zhanku_kuaile",
] as const;

export const subtitleFontTypeLabels: Record<
  (typeof subtitleFontTypes)[number],
  string
> = {
  sy_black: "思源黑体",
  pm_zhengdao: "庞门正道",
  zhanku_kuaile: "站酷快乐体",
};

export const subtitlePositions = [
  "bottom_center",
  "top_center",
  "center",
  "lower_third",
] as const;

export const subtitlePositionLabels: Record<
  (typeof subtitlePositions)[number],
  string
> = {
  bottom_center: "底部居中",
  top_center: "顶部居中",
  center: "画面居中",
  lower_third: "下方三分之一",
};

export const highlightTemplates = [
  "none",
  "热门短剧1",
  "热门短剧2",
  "热门短剧3",
  "热门短剧4",
  "热门短剧5",
] as const;

export const highlightTemplateLabels: Record<
  (typeof highlightTemplates)[number],
  string
> = {
  none: "无",
  热门短剧1: "热门短剧1",
  热门短剧2: "热门短剧2",
  热门短剧3: "热门短剧3",
  热门短剧4: "热门短剧4",
  热门短剧5: "热门短剧5",
};

export type ProductionConfig = {
  productionEntry: (typeof productionEntries)[number];
  executionMode: (typeof executionModes)[number];
  selectedHighlightAssetIds: string[];
  sellingPointCount: number;
  scriptCount: number;
  scriptDurationMin: number;
  scriptDurationMax: number;
  expressionType: (typeof expressionTypes)[number];
  expressionTypes: Array<(typeof expressionTypes)[number]>;
  customExpressionType: string;
  prerollTypes: PrerollType[];
  characterMode: (typeof characterModes)[number];
  imageModel: (typeof imageModels)[number];
  videoModel: (typeof videoModels)[number];
  generateSubtitles: boolean;
  subtitleFontType: (typeof subtitleFontTypes)[number];
  subtitleFontSize: number;
  subtitleFontColor: string;
  subtitlePosition: (typeof subtitlePositions)[number];
  videoResolution: (typeof videoResolutions)[number];
  videoRatio: (typeof videoRatios)[number];
  highlightContentType: (typeof highlightContentTypes)[number];
  highlightTargetMode: (typeof highlightTargetModes)[number];
  highlightTargetDuration: number;
  highlightTargetCount: number;
  highlightMinDuration: number;
  highlightMaxDuration: number;
  highlightCutMode: (typeof highlightCutModes)[number];
  highlightSegmentPrompt: string;
  highlightStartPrompt: string;
  highlightEndingPrompt: string;
  enableOpeningHook: boolean;
  openingHookMinDuration: number;
  openingHookMaxDuration: number;
  openingHookMinScore: number;
  highlightTemplate: (typeof highlightTemplates)[number];
  highlightHint: string;
};

export const defaultProductionConfig: ProductionConfig = {
  productionEntry: "full_drama",
  executionMode: "manual",
  selectedHighlightAssetIds: [],
  sellingPointCount: 3,
  scriptCount: 3,
  scriptDurationMin: 12,
  scriptDurationMax: 18,
  expressionType: "identity_contrast",
  expressionTypes: ["identity_contrast"],
  customExpressionType: "",
  prerollTypes: ["story_extended"],
  characterMode: "drama_character",
  imageModel: "seedream_5_0_pro",
  videoModel: "seedance_2_5",
  generateSubtitles: false,
  subtitleFontType: "sy_black",
  subtitleFontSize: 58,
  subtitleFontColor: "#FFFFFFFF",
  subtitlePosition: "center",
  videoResolution: "720p",
  videoRatio: "9:16",
  highlightContentType: "live_action",
  highlightTargetMode: "count",
  highlightTargetDuration: 120,
  highlightTargetCount: 3,
  highlightMinDuration: 60,
  highlightMaxDuration: 180,
  highlightCutMode: "Mixed",
  highlightSegmentPrompt:
    "优先选择剧情关键转折、身份揭露、强情绪对峙和高信息密度台词；规避空镜、重复回顾和低信息闲聊。",
  highlightStartPrompt:
    "目标：极短时间制造明确钩子。优先选择强冲突、强情绪或身份反转，并从完整台词或明确动作开始。",
  highlightEndingPrompt:
    "目标：阶段性闭合后留下强悬念。优先落在关键证据、身份暴露或更大冲突出现的完整事件点。",
  enableOpeningHook: true,
  openingHookMinDuration: 5,
  openingHookMaxDuration: 10,
  openingHookMinScore: 3.5,
  highlightTemplate: "热门短剧1",
  highlightHint: "点击下方看完整版",
};

export const productionConfigObjectSchema = z.object({
  productionEntry: z.enum(productionEntries).default("full_drama"),
  executionMode: z.enum(executionModes).default("manual"),
  selectedHighlightAssetIds: z.array(z.string().min(1)).max(100).default([]),
  sellingPointCount: z.number().int().min(1).max(6),
  scriptCount: z.number().int().min(1).max(6),
  scriptDurationMin: z.number().int().min(3),
  scriptDurationMax: z.number().int().min(3),
  expressionType: z.enum(expressionTypes).default(
    defaultProductionConfig.expressionType,
  ),
  expressionTypes: z
    .array(z.enum(expressionTypes))
    .min(1)
    .max(expressionTypes.length)
    .optional(),
  customExpressionType:
    z.string().trim().max(500).default(""),
  prerollTypes: z
    .array(z.enum(prerollTypes))
    .min(1)
    .max(prerollTypes.length)
    .optional(),
  characterMode: z.enum(characterModes),
  imageModel: z.enum(imageModels).default("seedream_5_0_pro"),
  videoModel: z.enum(videoModels).default("default"),
  generateSubtitles: z.boolean().default(false),
  subtitleFontType: z.enum(subtitleFontTypes).default("sy_black"),
  subtitleFontSize: z.number().int().min(12).max(160).default(58),
  subtitleFontColor: z.string().default("#FFFFFFFF"),
  subtitlePosition: z.enum(subtitlePositions).default("center"),
  videoResolution: videoResolutionSchema.default("720p"),
  videoRatio: z.enum(videoRatios).default("9:16"),
  highlightContentType: z.enum(highlightContentTypes),
  highlightTargetMode: z.enum(highlightTargetModes),
  highlightTargetDuration: z.number().int().min(1).max(6 * 60 * 60),
  highlightTargetCount: z.number().int().min(1).max(10000),
  highlightMinDuration: z.number().int().min(1).max(6 * 60 * 60),
  highlightMaxDuration: z.number().int().min(1).max(6 * 60 * 60),
  highlightCutMode: z.enum(highlightCutModes),
  highlightSegmentPrompt: z.string().trim().max(2000),
  highlightStartPrompt: z.string().trim().max(2000),
  highlightEndingPrompt: z.string().trim().max(2000),
  enableOpeningHook: z.boolean(),
  openingHookMinDuration: z.number().min(1).max(15),
  openingHookMaxDuration: z.number().min(1).max(15),
  openingHookMinScore: z.number().min(1).max(5),
  highlightTemplate: z.enum(highlightTemplates),
  highlightHint: z.string().trim().max(20),
});

export const productionConfigSchema = productionConfigObjectSchema
  .superRefine((value, context) => {
    if (value.scriptDurationMin > value.scriptDurationMax) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scriptDurationMax"],
        message: "脚本最大时长不能小于最小时长",
      });
    }
    if (value.openingHookMinDuration > value.openingHookMaxDuration) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["openingHookMaxDuration"],
        message: "开场钩子最大时长不能小于最小时长",
      });
    }
    if (value.highlightMinDuration > value.highlightMaxDuration) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["highlightMaxDuration"],
        message: "高光最大时长不能小于最小时长",
      });
    }
  });

function numberInRange(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
) {
  return typeof value === "string" && options.includes(value)
    ? (value as T[number])
    : fallback;
}

export function normalizeProductionConfig(
  input: Partial<ProductionConfig> | undefined,
): ProductionConfig {
  const source = input ?? {};
  const legacyExpressionType = enumValue(
    source.expressionType,
    expressionTypes,
    defaultProductionConfig.expressionType,
  );
  const candidateExpressionTypes = Array.isArray(source.expressionTypes)
    ? [...new Set(source.expressionTypes)].filter(
        (value): value is ProductionConfig["expressionType"] =>
          expressionTypes.includes(value),
      )
    : [];
  const normalizedExpressionTypes =
    candidateExpressionTypes.includes(legacyExpressionType)
      ? candidateExpressionTypes
      : [legacyExpressionType];
  const normalizedPrerollTypes = Array.isArray(source.prerollTypes)
    ? [...new Set(source.prerollTypes)].filter(
        (value): value is PrerollType => prerollTypes.includes(value),
      )
    : [];
  return {
    productionEntry: enumValue(
      source.productionEntry,
      productionEntries,
      defaultProductionConfig.productionEntry,
    ),
    executionMode: enumValue(
      source.executionMode,
      executionModes,
      defaultProductionConfig.executionMode,
    ),
    selectedHighlightAssetIds: Array.isArray(
      source.selectedHighlightAssetIds,
    )
      ? [...new Set(source.selectedHighlightAssetIds)]
          .filter((value): value is string => typeof value === "string")
          .slice(0, 100)
      : [],
    sellingPointCount: Math.round(
      numberInRange(source.sellingPointCount, 3, 1, 6),
    ),
    scriptCount: Math.round(numberInRange(source.scriptCount, 3, 1, 6)),
    scriptDurationMin: Math.max(
      3,
      Math.round(
        typeof source.scriptDurationMin === "number" &&
        Number.isFinite(source.scriptDurationMin)
          ? source.scriptDurationMin
          : defaultProductionConfig.scriptDurationMin,
      ),
    ),
    scriptDurationMax: Math.max(
      Math.max(
        3,
        Math.round(
          typeof source.scriptDurationMin === "number" &&
          Number.isFinite(source.scriptDurationMin)
            ? source.scriptDurationMin
            : defaultProductionConfig.scriptDurationMin,
        ),
      ),
      Math.round(
        typeof source.scriptDurationMax === "number" &&
        Number.isFinite(source.scriptDurationMax)
          ? source.scriptDurationMax
          : defaultProductionConfig.scriptDurationMax,
      ),
    ),
    expressionType:
      normalizedExpressionTypes[0] ?? legacyExpressionType,
    expressionTypes: normalizedExpressionTypes,
    customExpressionType:
      source.customExpressionType?.trim().slice(0, 500) ?? "",
    prerollTypes: normalizedPrerollTypes.length
      ? normalizedPrerollTypes
      : defaultProductionConfig.prerollTypes,
    characterMode: enumValue(
      source.characterMode,
      characterModes,
      defaultProductionConfig.characterMode,
    ),
    imageModel: enumValue(
      source.imageModel,
      imageModels,
      defaultProductionConfig.imageModel,
    ),
    videoModel: enumValue(
      source.videoModel,
      videoModels,
      defaultProductionConfig.videoModel,
    ),
    generateSubtitles:
      typeof source.generateSubtitles === "boolean"
        ? source.generateSubtitles
        : defaultProductionConfig.generateSubtitles,
    subtitleFontType: enumValue(
      source.subtitleFontType,
      subtitleFontTypes,
      defaultProductionConfig.subtitleFontType,
    ),
    subtitleFontSize: Math.round(
      numberInRange(source.subtitleFontSize, 58, 12, 160),
    ),
    subtitleFontColor:
      typeof source.subtitleFontColor === "string" &&
      /^#[0-9A-Fa-f]{8}$/.test(source.subtitleFontColor)
        ? source.subtitleFontColor
        : defaultProductionConfig.subtitleFontColor,
    subtitlePosition: enumValue(
      source.subtitlePosition,
      subtitlePositions,
      defaultProductionConfig.subtitlePosition,
    ),
    videoResolution: normalizeVideoResolution(
      source.videoResolution,
      defaultProductionConfig.videoResolution,
    ),
    videoRatio: enumValue(
      source.videoRatio,
      videoRatios,
      defaultProductionConfig.videoRatio,
    ),
    highlightContentType: enumValue(
      source.highlightContentType,
      highlightContentTypes,
      defaultProductionConfig.highlightContentType,
    ),
    highlightTargetMode: enumValue(
      source.highlightTargetMode,
      highlightTargetModes,
      defaultProductionConfig.highlightTargetMode,
    ),
    highlightTargetDuration: Math.round(
      numberInRange(source.highlightTargetDuration, 120, 1, 6 * 60 * 60),
    ),
    highlightTargetCount: Math.round(
      numberInRange(source.highlightTargetCount, 3, 1, 10000),
    ),
    highlightMinDuration: Math.round(
      numberInRange(source.highlightMinDuration, 60, 1, 6 * 60 * 60),
    ),
    highlightMaxDuration: Math.round(
      numberInRange(source.highlightMaxDuration, 180, 1, 6 * 60 * 60),
    ),
    highlightCutMode: enumValue(
      source.highlightCutMode,
      highlightCutModes,
      defaultProductionConfig.highlightCutMode,
    ),
    highlightSegmentPrompt:
      source.highlightSegmentPrompt?.trim() ||
      defaultProductionConfig.highlightSegmentPrompt,
    highlightStartPrompt:
      source.highlightStartPrompt?.trim() ||
      defaultProductionConfig.highlightStartPrompt,
    highlightEndingPrompt:
      source.highlightEndingPrompt?.trim() ||
      defaultProductionConfig.highlightEndingPrompt,
    enableOpeningHook:
      source.highlightCutMode === "Sequential"
        ? false
        : typeof source.enableOpeningHook === "boolean"
        ? source.enableOpeningHook
        : defaultProductionConfig.enableOpeningHook,
    openingHookMinDuration: numberInRange(
      source.openingHookMinDuration,
      5,
      1,
      15,
    ),
    openingHookMaxDuration: numberInRange(
      source.openingHookMaxDuration,
      10,
      1,
      15,
    ),
    openingHookMinScore: numberInRange(
      source.openingHookMinScore,
      3.5,
      1,
      5,
    ),
    highlightTemplate: enumValue(
      source.highlightTemplate,
      highlightTemplates,
      defaultProductionConfig.highlightTemplate,
    ),
    highlightHint:
      typeof source.highlightHint === "string"
        ? source.highlightHint.trim() === "无"
          ? ""
          : source.highlightHint.trim().slice(0, 20)
        : defaultProductionConfig.highlightHint,
  };
}

export function recommendHighlightSettings(
  sourceDuration: number,
  config: ProductionConfig,
) {
  const total = Number.isFinite(sourceDuration)
    ? Math.max(1, Math.floor(sourceDuration))
    : 1;
  const isAnimation = config.highlightContentType === "animation";
  const minDuration = isAnimation ? 30 : 60;
  const maxDuration = isAnimation ? 300 : 720;
  const maximumSelectableCount = Math.max(
    1,
    Math.floor(total),
  );
  const requestedDuration = Math.min(
    total,
    Math.max(1, config.highlightTargetDuration),
  );
  const requestedCount = Math.min(10000, Math.max(1, config.highlightTargetCount));
  const durationUpperLimit = Math.max(
    1,
    Math.floor(total / requestedCount),
  );
  const recommendedDuration = Math.max(
    1,
    Math.min(
      durationUpperLimit,
      Math.floor((total * 0.75) / requestedCount),
    ),
  );
  const targetDuration = requestedDuration;
  const targetDurationCountLimit = Math.max(
    1,
    Math.floor(total / targetDuration),
  );
  const upperLimit = Math.min(
    maximumSelectableCount,
    targetDurationCountLimit,
  );
  const recommendedNumber = Math.max(
    1,
    Math.min(
        upperLimit,
      Math.ceil((total * 0.75) / targetDuration),
    ),
  );
  const maxNumber = requestedCount;
  const cutMode = "Mixed" as const;
  const enableOpeningHook = true;

  return {
    minDuration,
    maxDuration,
    maxNumber,
    targetDuration,
    recommendedNumber,
    upperLimit,
    recommendedDuration,
    durationUpperLimit,
    maximumSelectableCount,
    sourceDuration: Math.round(total),
    cutMode,
    enableOpeningHook,
    rationale:
      `目标时长上限 = ⌊${Math.round(total)} ÷ ${requestedCount}⌋ = ${durationUpperLimit} 秒；输出视频数上限 = ⌊${Math.round(total)} ÷ ${targetDuration}⌋ = ${upperLimit} 个`,
  };
}

export function highlightDurationRange(
  config: ProductionConfig,
) {
  const maxDuration = Math.max(
    1,
    Math.round(config.highlightTargetDuration),
  );
  const contentMinimum =
    config.highlightContentType === "animation"
      ? 30
      : 60;
  const minDuration = Math.min(
    maxDuration,
    Math.max(
      contentMinimum,
      Math.round(maxDuration * 0.6),
    ),
  );

  return { minDuration, maxDuration };
}

export function allocateHighlightOutputs(total: number, arcCount: number) {
  const safeTotal = Math.max(1, Math.round(total));
  const activeCount = Math.min(safeTotal, Math.max(1, Math.round(arcCount)));
  const baseCount = Math.floor(safeTotal / activeCount);
  const remainder = safeTotal % activeCount;
  return Array.from(
    { length: activeCount },
    (_, index) => baseCount + (index < remainder ? 1 : 0),
  );
}
