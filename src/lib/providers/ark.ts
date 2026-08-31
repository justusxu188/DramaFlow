import {
  hookTypes,
  normalizeProviderStatus,
  prerollLabels,
  prerollTypes,
  type HookType,
  type PrerollType,
} from "@/lib/domain";
import { env } from "@/lib/env";
import { compactSharedStoryContext } from "@/lib/highlight-analysis";
import {
  videoPromptSystemPromptHash,
  type HighlightVisualStyle,
  type ScriptVariant,
  type SharedStoryContext,
  type StoryArc,
  type TransitionAnchor,
  type VideoPromptPlan,
} from "@/lib/pipeline-store";
import {
  expressionTypeLabels,
  type ProductionConfig,
} from "@/lib/production-config";
import {
  defaultPrerollCreativeSystemPrompt,
  defaultPrerollScriptSystemPrompt,
  defaultVideoPromptSystemPrompt,
  defaultVideoPromptWithoutSubtitlesSystemPrompt,
} from "@/lib/preroll-prompts";
import { videoSubmissionLimiter } from "@/lib/rate-limiter";
import {
  hasGlobalLensInstructions,
  stripVideoRatioInstructions,
} from "@/lib/seedance-prompt";
import { planVideoSegments } from "@/lib/video-shot-segmentation";
import { z } from "zod";
import type {
  CreativeProvider,
  ScriptDraft,
  StoryAnalysis,
} from "./types";
import type { StorylineResult } from "./types";

type ArkVideoTask = {
  id: string;
  status: string;
  content?: { video_url?: string };
  error?: { code?: string; message?: string };
};

const transitionAnchorSchema = z.object({
  openingSummary: z.string().trim().min(1),
  firstAction: z.string().trim().min(1),
  firstDialogue: z.string(),
  characters: z.array(z.string()),
  emotion: z.string().trim().min(1),
  continuityRequirements: z.array(z.string()),
  recommendedTransition: z.string().trim().min(1),
  forbiddenConflicts: z.array(z.string()),
  visualStyle: z.object({
    visualMedium: z.string().trim().min(1),
    characterStyle: z.string().trim().min(1),
    wardrobeStyle: z.string().trim().min(1),
    propStyle: z.string().trim().min(1),
    sceneStyle: z.string().trim().min(1),
    lightingStyle: z.string().trim().min(1),
    colorStyle: z.string().trim().min(1),
    cameraStyle: z.string().trim().min(1),
    textureStyle: z.string().trim().min(1),
  }),
});

const sharedStoryContextSchema = z.object({
  summary: z.string().trim(),
  tags: z.array(z.string().trim()).default([]),
  characters: z.array(z.object({
    name: z.string().trim().min(1),
    aliases: z.array(z.string().trim()).default([]),
    role: z.string().trim().default(""),
    relationships: z.array(z.string().trim()).default([]),
  })).default([]),
  setting: z.string().trim().default(""),
  visualStyle: z.string().trim().default(""),
});

function resolveVideoModel(
  model: ProductionConfig["videoModel"],
) {
  const endpoints = {
    default: env.ARK_VIDEO_MODEL,
    seedance_2_5:
      env.ARK_VIDEO_MODEL_SEEDANCE_2_5,
    seedance_2_0:
      env.ARK_VIDEO_MODEL_SEEDANCE_2_0,
    seedance_2_0_mini:
      env.ARK_VIDEO_MODEL_SEEDANCE_2_0_MINI,
    seedance_2_0_fast:
      env.ARK_VIDEO_MODEL_SEEDANCE_2_0_FAST,
  };
  const endpoint = endpoints[model];
  if (!endpoint) {
    throw new Error(
      model === "default"
        ? "ARK_VIDEO_MODEL 未配置"
        : `所选视频模型 Endpoint 未配置：${model}`,
    );
  }
  return endpoint;
}

function normalizedNgrams(text: string, size = 3) {
  const normalized = text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
  const grams = new Set<string>();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    grams.add(normalized.slice(index, index + size));
  }
  return grams;
}

export function scriptSimilarity(left: string, right: string) {
  const leftGrams = normalizedNgrams(left);
  const rightGrams = normalizedNgrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1;
  }
  return intersection / Math.min(leftGrams.size, rightGrams.size);
}

function scriptCreativeText(script: Pick<ScriptDraft, "title" | "voiceover" | "shots">) {
  return [
    script.title,
    script.voiceover,
    ...script.shots.map((shot) => `${shot.visual} ${shot.dialogue}`),
  ].join(" ");
}

const creativeProposalSchema = z.object({
  id: z.string().trim().min(1),
  uniqueSellingPoint: z.string().trim().min(1),
  targetAudience: z.string().trim().min(1),
  emotionKeywords: z.array(z.string().trim().min(1)).min(1),
  creativeTheme: z.string().trim().min(1),
  narrativePerspective: z.string().trim().min(1),
  openingVisual: z.string().trim().min(1),
  conflictMechanism: z.string().trim().min(1),
  escalation: z.string().trim().min(1),
  suspenseBreak: z.string().trim().min(1),
  transitionStrategy: z.string().trim().min(1),
  assumptions: z.array(z.string()).default([]),
});

type CreativeProposal = z.infer<
  typeof creativeProposalSchema
>;

const v2ConceptSchema = z.object({
  concept_id: z.string().trim().min(1),
  mode: z.string().trim().min(1),
  prepatch_type: z.string().trim().min(1),
  hook_paradigm: z.string().trim().min(1),
  audience_genre: z.string().trim().min(1),
  creative_theme: z.string().trim().min(1),
  one_line_hook: z.string().trim().min(1),
  hook_stack: z.array(z.object({
    sec: z.string(),
    hook: z.string().trim().min(1),
    type: z.string(),
  })).min(2),
  spectacle_core: z.string().trim().min(1),
  opening_3s_visual: z.string().trim().min(1),
  narrative_pov: z.string().trim().min(1),
  conflict_or_stake: z.string().trim().min(1),
  escalation: z.string().trim().min(1),
  emotion_curve: z.string().trim().min(1),
  meme_adaptation: z.string().default("无"),
  suspense_cutoff: z.string().trim().min(1),
  bridge_type: z.string().trim().min(1),
  mainfilm_handoff: z.string().trim().min(1),
  suggested_duration: z.string().trim().min(1),
  ai_segment_sec: z.string().trim().min(1),
  original_footage_sec: z.string().trim().min(1),
  suggested_beat_count: z.union([
    z.string(),
    z.number().transform(String),
  ]),
  suggested_vo_tone: z.string().trim().min(1),
  hook_title_card: z.string().default("无"),
  why_it_works: z.string().trim().min(1),
});

type V2Concept = z.infer<typeof v2ConceptSchema>;

const videoPromptPlanSchema = z.object({
  sourceScriptId: z.string().trim().min(1),
  sourceRevision: z.string().trim().min(1),
  scriptVersion: z.string().default("V1"),
  conceptId: z.string().default("C1"),
  mode: z.string().default("剧情锚定模式"),
  prepatchType: z.string().default("剧情延展"),
  templateMode: z.string().default("standard"),
  targetModel: z.string().default("Seedance"),
  resolution: z.string().default("720P"),
  aspectRatio: z.string().default("9:16"),
  maxClipDurationSec: z.coerce.number().default(15),
  globalVisualStyle: z.string().trim().min(1),
  characterLock: z.string().trim().min(1),
  sceneLock: z.string().trim().min(1),
  cameraPrinciple: z.string().default(""),
  lightColor: z.string().default(""),
  voiceCards: z.string().default(""),
  musicLine: z.string().default(""),
  soundPrinciple: z.string().default(""),
  persistentText: z.string().default(""),
  subtitleStyle: z.string().default(""),
  textOverlayPrinciple: z.string().default(""),
  negativePrompt: z.string().trim().min(1),
  segments: z.array(z.object({
    index: z.coerce.number().int().nonnegative(),
    clipId: z.string().optional(),
    sourceBeats: z.array(z.string()).default([]),
    duration: z.coerce.number().int().min(2),
    referenceAssets: z.array(z.string()).default([]),
    prompt: z.string().trim().min(1),
    sound: z.string().default(""),
  })).min(1),
  missingInformation: z.array(z.string()).default([]),
  originalFootageNote: z.string().default("无"),
  mainfilmHandoffPrompt: z.string().default(""),
});

export function normalizeVideoPromptPlan(
  value: unknown,
  sourceIdentity?: {
    scriptId: string;
    revision: string;
    globalVisualStyle?: string;
    characterLock?: string;
    sceneLock?: string;
  },
) {
  const root = objectValue(value);
  const source = objectValue(
    root.video_prompt_plan ??
      root["videoPromptPlan"] ??
      value,
  );
  const rawSegments =
    source.segments ??
    source.clips ??
    source["分镜视频提示词列表"] ??
    source["视频提示词列表"];
  const segments = Array.isArray(rawSegments)
    ? rawSegments.map((segment, index) => {
        const item = objectValue(segment);
        return {
          index: firstNumber(
            item,
            [
              "index",
              "segmentIndex",
              "镜头号",
              "分段号",
            ],
            index,
          ),
          clipId: firstText(item, [
            "clipId",
            "clip_id",
          ]) || undefined,
          sourceBeats: Array.isArray(
            item.sourceBeats ?? item.source_beats,
          )
            ? (item.sourceBeats ??
                item.source_beats) as string[]
            : [],
          duration: firstNumber(
            item,
            ["duration", "duration_sec", "时长秒数"],
            0,
          ),
          referenceAssets: Array.isArray(
            item.referenceAssets ??
              item["参考素材"],
          )
            ? (item.referenceAssets ??
                item["参考素材"]) as string[]
            : [],
          prompt: firstText(item, [
            "prompt",
            "video_prompt",
            "生视频提示词",
          ]),
          sound: firstText(item, [
            "sound",
            "声音",
          ]),
        };
      })
    : [];
  const segmentNegativePrompt = segments
    .map((segment) => {
      const match = segment.prompt.match(
        /【全局限制(?:\(Negative\))?】([\s\S]*?)(?=【[^】]+】|$)/,
      );
      return match?.[1]?.trim() ?? "";
    })
    .find(Boolean);
  return videoPromptPlanSchema.safeParse({
    sourceScriptId: firstText(source, [
      "sourceScriptId",
      "源脚本ID",
    ]) || sourceIdentity?.scriptId || "legacy-script",
    sourceRevision: firstText(source, [
      "sourceRevision",
      "源脚本版本",
    ]) || sourceIdentity?.revision || "legacy-revision",
    scriptVersion: firstText(source, [
      "scriptVersion",
      "script_version",
    ]) || "V1",
    conceptId: firstText(source, [
      "conceptId",
      "concept_id",
    ]) || "C1",
    mode: firstText(source, ["mode"]) || "剧情锚定模式",
    prepatchType: firstText(source, [
      "prepatchType",
      "prepatch_type",
    ]) || "剧情延展",
    templateMode: firstText(source, [
      "templateMode",
      "template_mode",
    ]) || "standard",
    targetModel: firstText(source, [
      "targetModel",
      "target_model",
    ]) || "Seedance",
    resolution: firstText(source, ["resolution"]) || "720P",
    aspectRatio: firstText(source, [
      "aspectRatio",
      "aspect_ratio",
    ]) || "9:16",
    maxClipDurationSec: firstNumber(
      source,
      ["maxClipDurationSec", "max_clip_duration_sec"],
      15,
    ),
    globalVisualStyle: firstText(source, [
      "globalVisualStyle",
      "global_visual_style",
      "全局视觉风格",
    ]) || sourceIdentity?.globalVisualStyle,
    characterLock: firstText(source, [
      "characterLock",
      "character_constraints",
      "主体锁定",
      "角色锁定",
    ]) || sourceIdentity?.characterLock,
    sceneLock: firstText(source, [
      "sceneLock",
      "scene_prop_constraints",
      "场景锁定",
    ]) || sourceIdentity?.sceneLock,
    cameraPrinciple: firstText(source, [
      "cameraPrinciple",
      "camera_principle",
    ]),
    lightColor: firstText(source, [
      "lightColor",
      "light_color",
    ]),
    voiceCards: firstText(source, [
      "voiceCards",
      "voice_cards",
    ]),
    musicLine: firstText(source, [
      "musicLine",
      "music_line",
    ]),
    soundPrinciple: firstText(source, [
      "soundPrinciple",
      "sound_principle",
    ]),
    persistentText: firstText(source, [
      "persistentText",
      "persistent_text",
    ]),
    subtitleStyle: firstText(source, [
      "subtitleStyle",
      "subtitle_style",
    ]),
    textOverlayPrinciple: firstText(source, [
      "textOverlayPrinciple",
      "text_overlay_principle",
    ]),
    negativePrompt: firstText(source, [
      "negativePrompt",
      "全局限制(Negative)",
      "全局限制",
      "负向约束",
    ]) || segmentNegativePrompt ||
      "人物变形、主体漂移、关键道具错误、穿模、闪变、跳帧、运镜失控",
    segments,
    missingInformation:
      (source.missingInformation ??
        source["缺失信息"] ??
        []) as string[],
    originalFootageNote: firstText(source, [
      "originalFootageNote",
      "original_footage_note",
    ]) || "无",
    mainfilmHandoffPrompt: firstText(source, [
      "mainfilmHandoffPrompt",
      "mainfilm_handoff_prompt",
    ]),
  });
}

export function validateVideoPromptPlanRules(
  plan: VideoPromptPlan,
  generateSubtitles?: boolean,
) {
  const platformParameterPattern =
    /(?:\d{3,4}\s*[pP]|分辨率|码率|帧率|fps|文件格式|(?:9\s*[:：]\s*16|16\s*[:：]\s*9|1\s*[:：]\s*1|4\s*[:：]\s*3|3\s*[:：]\s*4)|画幅|宽高比|纵横比|竖屏|横屏|(?:短视频|抖音|快手|小红书)(?:等)?平台(?:的)?(?:观看)?(?:比例|规格|格式))/i;
  const issues: string[] = [];
  for (const [label, value] of [
    ["global_visual_style", plan.globalVisualStyle],
    ["camera_principle", plan.cameraPrinciple ?? ""],
  ] as const) {
    if (platformParameterPattern.test(value)) {
      issues.push(`${label} 包含生成平台参数`);
    }
    if (hasGlobalLensInstructions(value)) {
      issues.push(`${label} 包含只能写在具体镜头内的焦段参数`);
    }
  }
  issues.push(...plan.segments.flatMap((segment, index) => {
    const prompt = segment.prompt;
    const segmentIssues: string[] = [];
    const prefix = `第 ${index + 1} 个片段`;
    for (const label of [
      "【画面描述】",
      "【镜头1】",
      "【全局限制(Negative)】",
    ]) {
      if (!prompt.includes(label)) {
        segmentIssues.push(`${prefix}缺少${label}`);
      }
    }
    if (platformParameterPattern.test(prompt)) {
      segmentIssues.push(`${prefix}正文包含生成平台参数`);
    }
    if (hasGlobalLensInstructions(prompt)) {
      segmentIssues.push(
        `${prefix}的焦段参数只能写在具体【镜头N】内`,
      );
    }
    if (
      /\d+(?:\.\d+)?\s*倍速|\d+(?:\.\d+)?\s*[-–~至]\s*\d+(?:\.\d+)?\s*字\s*\/?\s*秒/.test(
        prompt,
      )
    ) {
      segmentIssues.push(`${prefix}正文包含语速数值`);
    }
    const negative = prompt.match(
      /【全局限制\(Negative\)】([\s\S]*)$/,
    )?.[1] ?? "";
    if (
      negative &&
      (
        !negative.includes("生成缺陷类") ||
        !negative.includes("内容合规类")
      )
    ) {
      segmentIssues.push(
        `${prefix}的【全局限制(Negative)】未分为生成缺陷类和内容合规类`,
      );
    }
    if (generateSubtitles === false) {
      if (/字幕【/.test(prompt)) {
        segmentIssues.push(`${prefix}的无字幕提示词仍包含字幕指令`);
      }
      if (!/【画面文字】\s*无(?:\s|$|。)/.test(prompt)) {
        segmentIssues.push(`${prefix}的【画面文字】在无字幕模式下必须为“无”`);
      }
      for (const forbiddenText of [
        "字幕",
        "花字",
        "标题",
        "水印",
        "任何可见文字",
      ]) {
        if (!negative.includes(forbiddenText)) {
          segmentIssues.push(
            `${prefix}的无字幕负向约束缺少“${forbiddenText}”`,
          );
        }
      }
    }
    return segmentIssues;
  }));
  return issues;
}

export function validateVideoPromptTargetSegments(
  plan: VideoPromptPlan,
  targetDurations: number[],
  targetSourceBeats: string[][],
) {
  const issues: string[] = [];
  if (plan.segments.length !== targetDurations.length) {
    issues.push(
      `片段数量应为 ${targetDurations.length}，实际为 ${plan.segments.length}`,
    );
  }
  const comparableCount = Math.min(
    plan.segments.length,
    targetDurations.length,
  );
  for (let index = 0; index < comparableCount; index += 1) {
    const segment = plan.segments[index];
    if (segment.duration !== targetDurations[index]) {
      issues.push(
        `第 ${index + 1} 个片段时长应为 ${targetDurations[index]} 秒，实际为 ${segment.duration} 秒`,
      );
    }
    const expectedBeats = targetSourceBeats[index] ?? [];
    const actualBeats = segment.sourceBeats ?? [];
    if (
      expectedBeats.length > 0 &&
      (
        actualBeats.length !== expectedBeats.length ||
        actualBeats.some(
          (beat, beatIndex) => beat !== expectedBeats[beatIndex],
        )
      )
    ) {
      issues.push(
        `第 ${index + 1} 个片段必须且只能包含镜头 ${expectedBeats.join("、")}`,
      );
    }
  }
  if (plan.segments.length > 1) {
    const promptCounts = new Map<string, number>();
    for (const segment of plan.segments) {
      const fingerprint = segment.prompt
        .replace(/\s+/g, "")
        .trim();
      promptCounts.set(
        fingerprint,
        (promptCounts.get(fingerprint) ?? 0) + 1,
      );
    }
    if ([...promptCounts.values()].some((count) => count > 1)) {
      issues.push("不同片段不得返回完全相同的提示词正文");
    }
  }
  return issues;
}

export function buildFallbackVideoPromptPlan(input: {
  script: ScriptVariant;
  sourceRevision: string;
  characterMode: ProductionConfig["characterMode"];
  videoModel: ProductionConfig["videoModel"];
  resolution: ProductionConfig["videoResolution"];
  ratio: string;
  referenceUrls: string[];
  maxClipDurationSec: number;
  generateSubtitles: boolean;
  systemPrompt?: string;
  highlightStyle?: HighlightVisualStyle;
}): VideoPromptPlan {
  const aiShots = input.script.shots.filter(
    (shot) => shot.segmentType !== "original_footage",
  );
  const characterNames = [
    ...new Set(
      aiShots.flatMap((shot) => shot.characters ?? []),
    ),
  ];
  const sceneNames = [
    ...new Set(
      aiShots
        .map((shot) => shot.scene)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const subtitleRule = input.generateSubtitles
    ? "按脚本逐句生成字幕，字幕与人声同步。"
    : "无字幕、无花字、无标题、无角标、无Logo、无水印、无任何可见文字。";
  const style = input.highlightStyle;
  const duration = Math.max(
    4,
    input.script.aiSegmentSec ?? input.script.duration,
  );
  const targetSegments = planVideoSegments(
    aiShots,
    duration,
    input.maxClipDurationSec,
  );
  const buildSegmentPrompt = (
    targetSegment: (typeof targetSegments)[number],
  ) => {
    const segmentShots = targetSegment.shots;
    const segmentCharacterNames = [
      ...new Set(
        segmentShots.flatMap((shot) => shot.characters ?? []),
      ),
    ];
    const segmentSceneNames = [
      ...new Set(
        segmentShots
          .map((shot) => shot.scene)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    let localStart = 0;
    return stripVideoRatioInstructions([
      `【主体锁定】${
        segmentCharacterNames.length
          ? `${segmentCharacterNames.join("、")}的外观、服装和身份特征保持一致。`
          : "本片段所有人物的外观、服装和身份特征保持一致。"
      }${style
        ? `人物造型遵循高光视频风格：${style.characterStyle}；服装遵循：${style.wardrobeStyle}。`
        : ""}`,
      `【场景设定】${
        segmentSceneNames.length
          ? `${segmentSceneNames.join("、")}的空间结构、道具和光线保持一致。`
          : "本片段场景的空间结构、道具和光线保持一致。"
      }${style
        ? `场景遵循：${style.sceneStyle}；道具遵循：${style.propStyle}。`
        : ""}`,
      `【类型与风格】${
        style
          ? `${style.visualMedium}；${style.textureStyle}`
          : "写实短剧，快节奏投流影像，电影级画面质感"
      }。`,
      "【摄影机参数】稳定器拍摄，运动流畅自然。",
      `【镜头参数】${
        style?.cameraStyle ??
        "统一使用电影镜头质感，景深随景别自然变化"
      }。`,
      `【灯光】${
        style
          ? `${style.lightingStyle}；${style.colorStyle}`
          : "保持场景主光方向、色温和明暗关系连续稳定"
      }。`,
      `【画面描述】首帧：${segmentShots[0]?.startState || segmentShots[0]?.visual || "按本片段首镜头构图"}；` +
        `空间层次：${segmentSceneNames.join("、") || "按本片段场景建立前景、中景和背景"}；` +
        `末帧：${segmentShots.at(-1)?.endState || segmentShots.at(-1)?.visual || "停在本片段动作落点"}。`,
      ...segmentShots.map((shot, index) => {
        const shotDuration =
          targetSegment.shotDurations[index] ?? 1;
        const localEnd = localStart + shotDuration;
        const timeRange = `${localStart}-${localEnd}秒`;
        localStart = localEnd;
        const speech = [
          shot.voiceover
            ? `旁白{${shot.voiceover}}`
            : "",
          shot.dialogue
            ? `${shot.dialogueSpeaker || "人物"}说道{${shot.dialogue}}`
            : "",
          input.generateSubtitles && shot.subtitle
            ? `字幕【${shot.subtitle}】`
            : "",
        ].filter(Boolean).join("；");
        return `【镜头${index + 1}】（${timeRange}，${
          shot.shotSize || shot.framing || "中景"
        }，35mm，${shot.cameraMove || "固定机位"}）${
          shot.visual
        }${speech ? `；${speech}` : ""}${
          shot.sound ? `；<${shot.sound}>` : ""
        }`;
      }),
      ...(input.generateSubtitles
        ? ["【字幕样式】底部逐句同步字幕，清晰可读、不错字、不变形，随句出现并在句末消失。"]
        : []),
      "【画面文字】无",
      "【声音】保留本片段脚本中的旁白、对白、音乐和音效。",
      "【全局限制(Negative)】" +
        "1.生成缺陷类：人物面部漂移、五官不稳定、手指畸形、肢体变形、服装变化、主体忽隐忽现、关键道具结构错误、穿模、瞬移、动作断裂、背景闪变、运镜失控、主体丢失、画面过糊。" +
        `2.内容合规类：血腥画面、真实品牌名、真实价格文字、版权作品元素；${subtitleRule}`,
    ].join("\n"));
  };
  const basePlan: VideoPromptPlan = {
    sourceScriptId: input.script.id,
    sourceRevision: input.sourceRevision,
    systemPromptHash: videoPromptSystemPromptHash(
      input.systemPrompt?.trim() ||
        (
          input.generateSubtitles
            ? defaultVideoPromptSystemPrompt
            : defaultVideoPromptWithoutSubtitlesSystemPrompt
        ),
    ),
    generateSubtitles: input.generateSubtitles,
    scriptVersion: input.script.scriptVersion ?? "V1",
    conceptId:
      input.script.conceptId ??
      input.script.proposalId ??
      "C1",
    mode: input.script.mode ?? "剧情锚定模式",
    prepatchType:
      input.script.prepatchType ??
      prerollLabels[input.script.prerollType],
    templateMode: "standard",
    targetModel: input.videoModel,
    resolution: input.resolution.toUpperCase(),
    aspectRatio: input.ratio,
    maxClipDurationSec: input.maxClipDurationSec,
    globalVisualStyle: stripVideoRatioInstructions(
      style
        ? `${style.visualMedium}；${style.textureStyle}；${style.colorStyle}`
        : "写实短剧，快节奏投流影像",
    ),
    characterLock:
      `${characterNames.length
        ? `${characterNames.join("、")}的外观、服装和身份特征保持一致`
        : "脚本中所有人物保持一致"}${
        style
          ? `；人物风格：${style.characterStyle}；服装风格：${style.wardrobeStyle}`
          : ""
      }`,
    sceneLock:
      `${sceneNames.length
        ? `${sceneNames.join("、")}的空间、道具和光线保持一致`
        : "脚本中所有场景保持一致"}${
        style
          ? `；场景风格：${style.sceneStyle}；道具风格：${style.propStyle}`
          : ""
      }`,
    cameraPrinciple: stripVideoRatioInstructions(
      style?.cameraStyle ??
      "按脚本镜头顺序执行，单镜头只使用一种主要运镜",
    ),
    lightColor:
      style
        ? `${style.lightingStyle}；${style.colorStyle}`
        : "保持场景光线与色调连续",
    voiceCards: "",
    musicLine: "",
    soundPrinciple: "对白、旁白、音乐和音效与画面动作同步",
    persistentText: input.generateSubtitles ? "按脚本要求" : "",
    subtitleStyle: input.generateSubtitles ? "逐句同步字幕" : "",
    textOverlayPrinciple: subtitleRule,
    negativePrompt:
      "人物变形、主体漂移、道具错误、穿模、闪变、跳帧、运镜失控、画面过糊" +
      (input.generateSubtitles
        ? ""
        : "、字幕、花字、标题、角标、Logo、水印、任何可见文字"),
    segments: targetSegments.map((segment, index) => ({
      index,
      clipId: `VP${index + 1}`,
      sourceBeats: segment.shotIndexes.map(
        (shotIndex) =>
          aiShots[shotIndex]?.beatId ??
          `S${shotIndex + 1}`,
      ),
      duration: segment.duration,
      referenceAssets: input.referenceUrls,
      prompt: buildSegmentPrompt(segment),
      sound: "保留本片段脚本中的旁白、对白、音乐和音效",
    })),
    missingInformation: [],
    originalFootageNote:
      input.script.originalFootageSec
        ? `原片段时长 ${input.script.originalFootageSec} 秒`
        : "无",
    mainfilmHandoffPrompt:
      input.script.mainfilmEntry ??
      input.script.transition,
  };
  return basePlan;
}

export function normalizeCreativeProposal(
  value: unknown,
  index: number,
) {
  const source = objectValue(value);
  return creativeProposalSchema.safeParse({
    id:
      firstText(source, ["id", "提案ID", "编号"]) ||
      `proposal-${index + 1}`,
    uniqueSellingPoint: firstText(source, [
      "uniqueSellingPoint",
      "唯一卖点",
      "前贴唯一卖点",
    ]) || firstText(source, [
      "creativeTheme",
      "创意母题",
      "创意主题",
    ]),
    targetAudience: firstText(source, [
      "targetAudience",
      "目标受众",
      "适配方向",
    ]) || "短剧投流目标用户",
    emotionKeywords: Array.isArray(
      source.emotionKeywords ??
        source["情绪关键词"],
    )
      ? (source.emotionKeywords ??
          source["情绪关键词"]) as string[]
      : [firstText(source, [
          "conflictMechanism",
          "冲突机制",
          "核心冲突",
        ]) || "悬念"],
    creativeTheme: firstText(source, [
      "creativeTheme",
      "创意母题",
      "创意主题",
    ]),
    narrativePerspective: firstText(source, [
      "narrativePerspective",
      "叙事视角",
      "视角",
    ]),
    openingVisual: firstText(source, [
      "openingVisual",
      "首帧画面",
      "前三秒画面",
      "开场画面",
    ]),
    conflictMechanism: firstText(source, [
      "conflictMechanism",
      "冲突机制",
      "核心冲突",
    ]),
    escalation: firstText(source, [
      "escalation",
      "冲突升级",
      "升级方式",
    ]),
    suspenseBreak: firstText(source, [
      "suspenseBreak",
      "悬念断点",
      "结尾悬念",
    ]),
    transitionStrategy: firstText(source, [
      "transitionStrategy",
      "衔接方式",
      "转场策略",
      "正片衔接",
    ]),
    assumptions: Array.isArray(
      source.assumptions ??
        source["创作假设"],
    )
      ? (source.assumptions ??
          source["创作假设"]) as string[]
      : [],
  });
}

const modelScriptDraftSchema = z.object({
  id: z.string().trim().min(1).optional(),
  proposalId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  fitDirection: z.string().trim().min(1).optional(),
  coreHook: z.string().trim().min(1).optional(),
  assumptions: z.array(z.string()).default([]),
  hookType: z.unknown().optional(),
  prerollType: z.unknown().optional(),
  duration: z.coerce.number().finite(),
  voiceover: z.string().trim().min(1),
  transition: z.string().trim().min(1),
  shots: z.array(z.object({
    time: z.string().trim().min(1),
    framing: z.string().trim().min(1),
    visual: z.string().trim().min(1),
    dialogue: z.string(),
    subtitle: z.string().default(""),
    sound: z.string().default(""),
    editingRhythm: z.string().default(""),
    purpose: z.string().default(""),
  })).min(1),
});

function normalizedHookType(value: string): HookType {
  return (hookTypes as readonly string[]).includes(value)
    ? value as HookType
    : "identity_gap";
}

function normalizedPrerollType(value: string): PrerollType {
  return (prerollTypes as readonly string[]).includes(value)
    ? value as PrerollType
    : "story_extended";
}

function objectValue(value: unknown) {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function firstText(
  source: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function firstNumber(
  source: Record<string, unknown>,
  keys: string[],
  fallback: number,
) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const matched = value.match(/\d+(?:\.\d+)?/);
      if (matched) return Number(matched[0]);
    }
  }
  return fallback;
}

export function normalizePrerollScriptDraft(
  value: unknown,
  options: {
    index: number;
    durationMax: number;
    fallbackTransition: string;
    fallbackProposalId?: string;
  },
) {
  const source = objectValue(value);
  const duration = firstNumber(
    source,
    ["duration", "建议时长", "视频时长", "时长"],
    options.durationMax,
  );
  const rawShots =
    source.shots ??
    source.storyboard ??
    source.videoScript ??
    source["视频脚本"] ??
    source["分镜脚本"];
  const shotValues = Array.isArray(rawShots)
    ? rawShots
    : typeof rawShots === "string" && rawShots.trim()
      ? [{
          time: `0-${duration}秒`,
          framing: "动态分镜",
          visual: rawShots,
        }]
      : [];
  const shots = shotValues.map((shot, shotIndex) => {
    const item = objectValue(shot);
    return {
      time:
        firstText(item, [
          "time",
          "timeRange",
          "时间段",
          "时间",
        ]) || `${shotIndex * 2}-${Math.min(
          duration,
          shotIndex * 2 + 2,
        )}秒`,
      framing:
        firstText(item, [
          "framing",
          "shotType",
          "景别",
          "镜头类型",
        ]) || "动态分镜",
      visual:
        firstText(item, [
          "visual",
          "scene",
          "画面/镜头",
          "画面",
          "镜头",
        ]) || firstText(item, ["字幕", "subtitle"]),
      voiceover: firstText(item, [
        "voiceover",
        "口播",
        "旁白",
      ]),
      dialogueSpeaker: firstText(item, [
        "dialogue_speaker",
        "speaker",
        "说话人",
      ]),
      dialogue: firstText(item, [
        "dialogue",
        "voiceover",
        "口播",
        "台词",
        "字幕",
      ]),
      subtitle: firstText(item, [
        "subtitle",
        "字幕",
      ]),
      sound: firstText(item, [
        "sound",
        "音效/音乐",
        "音效",
        "声音",
      ]),
      editingRhythm: firstText(item, [
        "editingRhythm",
        "剪辑节奏",
      ]),
      purpose: firstText(item, [
        "purpose",
        "目的",
        "镜头目的",
      ]),
    };
  });
  const voiceover =
    firstText(source, [
      "voiceover",
      "narration",
      "口播",
      "口播文案",
    ]) ||
    shots
      .map((shot) => shot.dialogue)
      .filter(Boolean)
      .join(" ");

  return {
    id: firstText(source, ["id"]) || undefined,
    proposalId:
      firstText(source, [
        "proposalId",
        "创意提案ID",
      ]) ||
      options.fallbackProposalId ||
      `proposal-${options.index + 1}`,
    title:
      firstText(source, [
        "title",
        "前贴标题",
        "标题",
      ]) || `AI 前贴脚本 ${options.index + 1}`,
    fitDirection:
      firstText(source, [
        "fitDirection",
        "适配方向",
      ]) || "短剧投流",
    coreHook:
      firstText(source, [
        "coreHook",
        "核心钩子",
      ]) || shots[0]?.visual || voiceover,
    assumptions: Array.isArray(
      source.assumptions ??
        source["创作假设"],
    )
      ? (source.assumptions ??
          source["创作假设"]) as string[]
      : [],
    hookType: source.hookType,
    prerollType: source.prerollType,
    duration,
    voiceover,
    transition:
      firstText(source, [
        "transition",
        "endingTransition",
        "结尾卡点",
        "转场",
      ]) || options.fallbackTransition,
    shots,
  };
}

function meaningful(value: unknown) {
  return typeof value === "string" &&
    value.trim() &&
    value.trim() !== "无"
    ? value.trim()
    : "";
}

function stableSelectionOffset(seed: string, length: number) {
  if (!seed || length <= 1) return 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function spokenWordcountRequirement(
  durationMin: number,
  durationMax: number,
) {
  const firstDuration = Math.ceil(durationMin);
  const lastDuration = Math.floor(durationMax);
  const durations =
    lastDuration - firstDuration <= 20
      ? Array.from(
          { length: lastDuration - firstDuration + 1 },
          (_, index) => firstDuration + index,
        )
      : [firstDuration, lastDuration];
  const ranges = durations
    .map((duration) =>
      `${duration}秒：${Math.ceil(duration * 4)}-${Math.floor(duration * 9)}字`)
    .join("；");
  return (
    "必须先确定 total_duration_sec，再按 4-9 字/秒计算口播字数。" +
    "统计所有 beats 中 voiceover 与 dialogue 的中文、字母和数字字符总数，" +
    "必须落在 total_duration_sec×4 到 total_duration_sec×9 之间；" +
    `当前候选时长对应范围：${ranges}。` +
    "输出前先自行统计并压缩超出的文字，vo_wordcount 必须填写实际统计值，" +
    "不得依赖结果返回后的校验修正。"
  );
}

function normalizeV2ScriptDraft(
  value: unknown,
  concept: V2Concept,
  assumptions: string[],
  index: number,
): ScriptDraft {
  const root = objectValue(value);
  const source = objectValue(root.script ?? value);
  const rawBeats = Array.isArray(source.beats)
    ? source.beats
    : [];
  const shots = rawBeats.map((beat, beatIndex) => {
    const item = objectValue(beat);
    const shotSize =
      firstText(item, ["shot_size"]) || "中景";
    const cameraMove =
      firstText(item, ["camera_move"]) || "固定";
    const visual = firstText(item, ["visual"]);
    const dynamicChange = firstText(item, [
      "dynamic_change",
    ]);
    const characterAction = firstText(item, [
      "character_action",
    ]);
    return {
      beatId:
        firstText(item, ["beat_id"]) ||
        `S${beatIndex + 1}`,
      time:
        firstText(item, ["time_range"]) ||
        `${beatIndex * 2}-${beatIndex * 2 + 2}`,
      segmentType:
        firstText(item, ["segment_type"]) ===
        "original_footage"
          ? "original_footage" as const
          : "ai_generated" as const,
      beatRole: firstText(item, ["beat_role"]),
      hookRef: firstText(item, ["hook_ref"]),
      framing: `${shotSize}，${cameraMove}`,
      visual: [
        visual,
        dynamicChange &&
          `动态变化：${dynamicChange}`,
        characterAction &&
          `人物动作：${characterAction}`,
      ].filter(Boolean).join("；"),
      dynamicChange,
      visualContrast: firstText(item, [
        "visual_contrast",
      ]),
      characterAction,
      shotSize,
      cameraMove,
      voiceover: meaningful(item.voiceover),
      dialogueSpeaker:
        meaningful(firstText(item, ["dialogue_speaker"])) ||
        (
          meaningful(item.dialogue) &&
          Array.isArray(item.characters) &&
          item.characters.length === 1
            ? String(item.characters[0])
            : ""
        ),
      dialogue: meaningful(item.dialogue),
      subtitle: meaningful(item.subtitle),
      sceneCaption: meaningful(item.scene_caption),
      sound: meaningful(item.sound),
      startState: firstText(item, ["start_state"]),
      endState: firstText(item, ["end_state"]),
      cutToNext: firstText(item, ["cut_to_next"]),
      characters: Array.isArray(item.characters)
        ? item.characters as string[]
        : [],
      scene: firstText(item, ["scene"]),
      keyProps: Array.isArray(item.key_props)
        ? item.key_props as string[]
        : [],
      editingRhythm: firstText(item, ["cut_to_next"]),
      purpose: firstText(item, ["beat_role"]),
    };
  });
  const duration = firstNumber(
    source,
    ["total_duration_sec"],
    15,
  );
  const voiceover = rawBeats
    .map((beat) => meaningful(objectValue(beat).voiceover))
    .filter(Boolean)
    .join(" ");

  return {
    id: `script-${crypto.randomUUID()}`,
    proposalId: concept.concept_id,
    scriptVersion:
      firstText(source, ["script_version"]) || "V1",
    conceptId:
      firstText(source, ["concept_id"]) ||
      concept.concept_id,
    mode: firstText(source, ["mode"]) || concept.mode,
    hookParadigm: concept.hook_paradigm,
    prepatchType: concept.prepatch_type,
    audienceGenre:
      firstText(source, ["audience_genre"]) ||
      concept.audience_genre,
    title:
      firstText(source, ["title"]) ||
      `AI 前贴脚本 ${index + 1}`,
    fitDirection:
      firstText(source, ["audience_genre"]) ||
      concept.audience_genre,
    coreHook:
      firstText(source, ["watch_motivation"]) ||
      concept.one_line_hook,
    assumptions,
    hookType: "identity_gap",
    prerollType: "story_extended",
    duration,
    aiSegmentSec: firstNumber(
      source,
      ["ai_segment_sec"],
      duration,
    ),
    originalFootageSec: firstNumber(
      source,
      ["original_footage_sec"],
      0,
    ),
    creativeTheme:
      firstText(source, ["creative_theme"]) ||
      concept.creative_theme,
    watchMotivation: firstText(source, [
      "watch_motivation",
    ]),
    voTone: firstText(source, ["vo_tone"]),
    voSpeed: firstText(source, ["vo_speed"]),
    voWordcount: firstNumber(
      source,
      ["vo_wordcount"],
      voiceover.length,
    ),
    hookTitleCard:
      firstText(source, ["hook_title_card"]) || "无",
    bridgeBeatId:
      firstText(source, ["bridge_beat_id"]) || "无",
    bridgeType:
      firstText(source, ["bridge_type"]) ||
      concept.bridge_type,
    endingCutoff: firstText(source, [
      "ending_cutoff",
    ]),
    mainfilmEntry:
      firstText(source, ["mainfilm_entry"]) ||
      concept.mainfilm_handoff,
    selfCheck: Array.isArray(source.self_check)
      ? source.self_check as string[]
      : [],
    voiceover: voiceover || concept.one_line_hook,
    transition:
      firstText(source, ["mainfilm_entry"]) ||
      concept.mainfilm_handoff,
    shots,
  };
}

type PrerollChatMessage = {
  role: "system" | "user";
  content: string;
};

export function buildPrerollChatMessages(
  configuredSystemPrompt: string | undefined,
  userPayload: Record<string, unknown>,
  fallbackSystemPrompt = defaultPrerollScriptSystemPrompt,
): PrerollChatMessage[] {
  return [
    {
      role: "system",
      content:
        configuredSystemPrompt?.trim() ||
        fallbackSystemPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(userPayload),
    },
  ];
}

function creativeProposalText(
  proposal: CreativeProposal,
) {
  return [
    proposal.creativeTheme,
    proposal.narrativePerspective,
    proposal.openingVisual,
    proposal.conflictMechanism,
    proposal.escalation,
    proposal.suspenseBreak,
  ].join(" ");
}

function compactStoryArc(arc: StoryArc) {
  return {
    title: arc.title,
    pitch: arc.pitch,
    audience: arc.audience,
    payoffType: arc.payoffType,
    conflict: arc.conflict,
    hookType: arc.hookType,
    prerollType: arc.prerollType,
  };
}

function compactTransitionAnchor(
  anchor: TransitionAnchor,
) {
  return {
    openingSummary: anchor.openingSummary,
    firstAction: anchor.firstAction,
    firstDialogue: anchor.firstDialogue,
    characters: anchor.characters,
    emotion: anchor.emotion,
    continuityRequirements:
      anchor.continuityRequirements,
    recommendedTransition:
      anchor.recommendedTransition,
    forbiddenConflicts: anchor.forbiddenConflicts,
  };
}

function looseScriptCreativeText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const script = value as Record<string, unknown>;
  const shots = Array.isArray(script.shots)
    ? script.shots.flatMap((shot) => {
        if (!shot || typeof shot !== "object") return [];
        const item = shot as Record<string, unknown>;
        return [
          `${typeof item.visual === "string" ? item.visual : ""} ${
            typeof item.dialogue === "string" ? item.dialogue : ""
          }`,
        ];
      })
    : [];
  return [
    typeof script.title === "string" ? script.title : "",
    typeof script.voiceover === "string" ? script.voiceover : "",
    ...shots,
  ].join(" ");
}

export function findPrerollScriptIssues(input: {
  scripts: unknown[];
  expectedCount: number;
  durationMin: number;
  durationMax: number;
  comparisonTexts: string[];
}) {
  const issues: string[] = [];
  if (input.scripts.length !== input.expectedCount) {
    issues.push(
      `脚本数量应为 ${input.expectedCount}，实际为 ${input.scripts.length}`,
    );
  }

  const earlierTexts: string[] = [];
  input.scripts.forEach((script, index) => {
    const parsed = modelScriptDraftSchema.safeParse(script);
    if (!parsed.success) {
      issues.push(`第 ${index + 1} 条脚本字段不完整或格式错误`);
    } else if (
      parsed.data.duration < input.durationMin ||
      parsed.data.duration > input.durationMax
    ) {
      issues.push(
        `第 ${index + 1} 条脚本时长应在 ${input.durationMin}-${input.durationMax} 秒`,
      );
    }

    const text = looseScriptCreativeText(script);
    if (
      text &&
      [...input.comparisonTexts, ...earlierTexts].some(
        (comparison) =>
          scriptSimilarity(text, comparison) >= 0.45,
      )
    ) {
      issues.push(`第 ${index + 1} 条脚本与原剧情或历史脚本相似度过高`);
    }
    if (text) earlierTexts.push(text);
  });

  return issues;
}

function beatTimeRange(time: string) {
  const values = time.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!values?.length) return null;
  const start = values[0];
  const end = values.length > 1
    ? values[1]
    : start + 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return { start, end };
}

function spokenCharacterCount(script: ScriptDraft) {
  return script.shots.reduce((total, shot) => {
    const spoken = [shot.voiceover, shot.dialogue]
      .map((value) => meaningful(value) ?? "")
      .join("");
    return total +
      (spoken.match(/[\p{L}\p{N}]/gu)?.length ?? 0);
  }, 0);
}

export function validateV2ScriptDraft(
  script: ScriptDraft,
) {
  const issues: string[] = [];
  if (script.shots.length < 5 || script.shots.length > 12) {
    issues.push(
      `节拍数量应为 5-12 个，实际为 ${script.shots.length} 个`,
    );
  }

  let expectedStart = 0;
  let finalEnd = 0;
  script.shots.forEach((shot, index) => {
    const range = beatTimeRange(shot.time);
    if (!range || range.end <= range.start) {
      issues.push(`第 ${index + 1} 个节拍时间格式无效`);
      return;
    }
    if (Math.abs(range.start - expectedStart) > 0.01) {
      issues.push(
        `第 ${index + 1} 个节拍应从 ${expectedStart} 秒开始，实际为 ${range.start} 秒`,
      );
    }
    expectedStart = range.end;
    finalEnd = range.end;
    if (
      (shot.segmentType ?? "ai_generated") ===
        "ai_generated" &&
      !meaningful(shot.dynamicChange)
    ) {
      issues.push(
        `第 ${index + 1} 个 AI 节拍缺少动态变化`,
      );
    }
  });

  if (Math.abs(finalEnd - script.duration) > 0.01) {
    issues.push(
      `时间轴结束于 ${finalEnd} 秒，与总时长 ${script.duration} 秒不一致`,
    );
  }

  const hookCount = script.shots.filter((shot) => {
    const range = beatTimeRange(shot.time);
    return Boolean(
      range &&
        range.start < 5 &&
        meaningful(shot.hookRef),
    );
  }).length;
  if (hookCount < 2) {
    issues.push(
      `前 5 秒至少需要 2 个有效钩子，实际为 ${hookCount} 个`,
    );
  }

  if (script.mode?.includes("猎奇")) {
    const bridgeBeats = script.shots.filter((shot) =>
      shot.beatRole?.includes("桥接")
    );
    if (bridgeBeats.length !== 1) {
      issues.push(
        "猎奇吸睛模式必须且只能有 1 个桥接回正片节拍，" +
          `实际为 ${bridgeBeats.length} 个`,
      );
    } else if (
      meaningful(script.bridgeBeatId) &&
      bridgeBeats[0].beatId !== script.bridgeBeatId
    ) {
      issues.push(
        `桥接节拍应为 ${script.bridgeBeatId}，实际为 ${bridgeBeats[0].beatId ?? "未标记"}`,
      );
    }
  }

  const spokenCount = spokenCharacterCount(script);
  const minimum = Math.ceil(script.duration * 4);
  const maximum = Math.floor(script.duration * 9);
  if (spokenCount < minimum || spokenCount > maximum) {
    issues.push(
      `${script.duration} 秒口播共 ${spokenCount} 字，应为 ${minimum}-${maximum} 字`,
    );
  }
  return issues;
}

export class ArkCreativeProvider
  implements Pick<
    CreativeProvider,
    | "analyzeStory"
    | "generateScripts"
    | "generateImage"
    | "createPreroll"
    | "getPrerollTask"
  >
{
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!env.ARK_API_KEY) throw new Error("ARK_API_KEY 未配置");
    const controller = new AbortController();
    const timeoutMs = env.ARK_TEXT_TIMEOUT_MS ?? 300000;
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );
    let response: Response;
    try {
      response = await fetch(`${env.ARK_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.ARK_API_KEY}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Ark 请求超时（${Math.round(timeoutMs / 1000)} 秒）`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? "unknown";
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      const detail = payload?.error?.message ? `: ${payload.error.message}` : "";
      throw new Error(`Ark 请求失败 (${response.status}, request: ${requestId})${detail}`);
    }
    return (await response.json()) as T;
  }

  private parseChatJson<T>(content: string): T {
    const trimmed = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      return JSON.parse(trimmed) as T;
    } catch (initialError) {
      const objectStart = trimmed.indexOf("{");
      const arrayStart = trimmed.indexOf("[");
      const starts = [objectStart, arrayStart].filter(
        (value) => value >= 0,
      );
      const start = starts.length ? Math.min(...starts) : -1;
      const end = Math.max(
        trimmed.lastIndexOf("}"),
        trimmed.lastIndexOf("]"),
      );
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      }
      throw initialError;
    }
  }

  private async chatJson<T>(
    messages: unknown[],
    temperature = 0.7,
    reasoningEffort?: "low" | "medium" | "high",
  ): Promise<T> {
    if (!env.ARK_TEXT_MODEL_SEED_2_1_PRO) {
      throw new Error("ARK_TEXT_MODEL_SEED_2_1_PRO 未配置");
    }
    const complete = async (
      requestMessages: unknown[],
      requestTemperature: number,
    ) => {
      const data = await this.request<{
        choices: Array<{
          finish_reason?: string;
          message: { content: string };
        }>;
      }>("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: env.ARK_TEXT_MODEL_SEED_2_1_PRO,
          messages: requestMessages,
          response_format: { type: "json_object" },
          stream: false,
          max_tokens: 12000,
          temperature: requestTemperature,
          ...(reasoningEffort
            ? { reasoning_effort: reasoningEffort }
            : {}),
        }),
      });
      const choice = data.choices[0];
      if (choice?.finish_reason === "length") {
        throw new Error(
          "Ark 输出达到 max_tokens 上限，JSON 未完整返回",
        );
      }
      return choice?.message.content;
    };
    const content = await complete(messages, temperature);
    if (!content) throw new Error("Ark 未返回结构化内容");
    try {
      return this.parseChatJson<T>(content);
    } catch {
      const repaired = await complete([
        ...messages,
        { role: "assistant", content },
        {
          role: "user",
          content:
            "上一条输出不是合法 JSON。只修正 JSON 语法，保持字段和值的含义不变，输出修正后的合法 JSON，不要解释。",
        },
      ], 0.1);
      if (!repaired) throw new Error("Ark 未返回 JSON 修正结果");
      try {
        return this.parseChatJson<T>(repaired);
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "未知语法错误";
        throw new Error(`Ark 返回的 JSON 格式无效：${detail}`);
      }
    }
  }

  analyzeStory(input: { videoUrl: string }) {
    return this.chatJson<StoryAnalysis>([
      {
        role: "system",
        content:
          "你是短剧投流分析师。仅输出 JSON，字段为 synopsis、characters、conflict、emotionCurve、highlights。",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "分析该短剧正片，识别人物、冲突、情绪曲线和高光候选。" },
          { type: "video_url", video_url: { url: input.videoUrl } },
        ],
      },
    ]);
  }

  async generateScripts(input: {
    analysis: StoryAnalysis;
    hookType: HookType;
    prerollType: PrerollType;
    count: number;
  }) {
    const result = await this.chatJson<
      ScriptDraft[] | { scripts: ScriptDraft[] }
    >([
      {
        role: "system",
        content:
          "你是短剧投流编剧。仅输出 JSON 对象，顶层字段为 scripts。scripts 数组每项包含 id、title、hookType、prerollType、duration、voiceover、transition、shots。前3秒必须有冲突，镜头1-2秒切换。",
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ]);
    return Array.isArray(result) ? result : result.scripts;
  }

  async synthesizeSharedStoryContext(
    analyses: Array<{
      sourceHighlightAssetId: string;
      highlightId: string;
      sourceName: string;
      analysis: StorylineResult;
    }>,
  ) {
    const result = await this.chatJson<unknown>([
      {
        role: "system",
        content:
          "你负责归纳同一部短剧多个独立高光片段的共享背景。只输出 JSON，字段为 summary、tags、characters、setting、visualStyle。characters 每项包含 name、aliases、role、relationships。仅提取跨片段稳定的人物身份、称呼、关系、世界观和视觉风格；不得推断片段先后顺序，不得把只在单个片段出现的具体事件、对白、因果或结局写成共享事实。不确定内容应省略。",
      },
      {
        role: "user",
        content: JSON.stringify({
          highlights: analyses.map((entry) => ({
            sourceHighlightAssetId:
              entry.sourceHighlightAssetId,
            highlightId: entry.highlightId,
            sourceName: entry.sourceName,
            sourceVideoInfo:
              entry.analysis.sourceVideoInfo,
            clips: entry.analysis.clips.map((clip) => ({
              title: clip.title,
              summary: clip.summary,
              dialogue: clip.dialogue,
            })),
          })),
        }),
      },
    ], 0.1, "medium");
    return sharedStoryContextSchema.parse(result);
  }

  async mineStoryArcs(input: {
    analysis: StorylineResult;
    sharedStoryContext?: SharedStoryContext;
    genre: string;
    count?: number;
  }) {
    const result = await this.chatJson<{ arcs: StoryArc[] }>(
      [
        {
          role: "system",
          content:
            "你是短剧投流策略专家。只输出 JSON 对象，顶层字段 arcs。每项必须包含 id、title、pitch、audience(male|female|general)、payoffType、conflict、hookType、prerollType、evidenceClipIndexes、highlightPrompt、scores(relevance,visuality,novelty,risk，均0-100)。共享剧集上下文只用于识别人物、关系、世界观和视觉风格，不是剧情证据。只能引用输入 clips 中存在的 clip_index；任何事件、对白、因果和结果必须由当前高光 clips 直接证明，不得从其他高光补入。优先提炼强冲突、身份反差、金手指、打脸、复仇、生死危机等适合投流的差异化故事线。",
        },
        {
          role: "user",
          content: JSON.stringify({
            genre: input.genre,
            targetCount: input.count ?? 3,
            sharedStoryContext:
              compactSharedStoryContext(
                input.sharedStoryContext,
              ),
            sourceVideoInfo: input.analysis.sourceVideoInfo,
            clips: input.analysis.clips,
            providerHighlights: input.analysis.highlights,
          }),
        },
      ],
      0.7,
      "medium",
    );
    const validClipIndexes = new Set(input.analysis.clips.map((clip) => clip.index));
    const candidates = result.arcs
      .slice(0, input.count ?? 3)
      .map((arc, index) => ({
        ...arc,
        id: arc.id ? String(arc.id) : `arc-${crypto.randomUUID()}`,
        title: arc.title || `爽点故事线 ${index + 1}`,
        evidenceClipIndexes: arc.evidenceClipIndexes.filter((clipIndex) =>
          validClipIndexes.has(clipIndex),
        ),
      }))
      .filter((arc) => arc.evidenceClipIndexes.length > 0);

    const grounded = await this.chatJson<{ arcs: StoryArc[] }>(
      [
        {
          role: "system",
          content:
            "你是剧情事实审校员。只输出 JSON 对象，顶层字段 arcs。逐条审校候选故事线，保留原结构和差异化角度，但删除或改写证据片段没有明确出现的身份、动机、因果、结果、数字和人物关系。title、pitch、conflict、highlightPrompt 中的每个剧情事实都必须能从 evidenceClips 直接验证；不得把可能发生、常见套路或创意延展写成原剧情事实。scores.risk 应反映剩余事实风险。",
        },
        {
          role: "user",
          content: JSON.stringify({
            evidenceClips: input.analysis.clips,
            candidates,
          }),
        },
      ],
      0.1,
      "medium",
    );

    return grounded.arcs
      .slice(0, input.count ?? 3)
      .map((arc, index) => ({
        ...arc,
        id: String(candidates[index]?.id ?? arc.id ?? `arc-${crypto.randomUUID()}`),
        evidenceClipIndexes: arc.evidenceClipIndexes.filter((clipIndex) =>
          validClipIndexes.has(clipIndex),
        ),
      }))
      .filter((arc) => arc.evidenceClipIndexes.length > 0);
  }

  async analyzeTransition(input: {
    videoUrl: string;
    seconds?: number;
    storylineContext: string;
  }) {
    const result = await this.chatJson<TransitionAnchor>([
      {
        role: "system",
        content:
          "你是短剧视频衔接与视觉风格分析师。仅分析输入视频开头指定秒数，并只输出 JSON：" +
          "openingSummary、firstAction、firstDialogue、characters(string[])、emotion、" +
          "continuityRequirements(string[])、recommendedTransition、forbiddenConflicts(string[])、visualStyle。" +
          "visualStyle 必须包含 visualMedium、characterStyle、wardrobeStyle、propStyle、sceneStyle、" +
          "lightingStyle、colorStyle、cameraStyle、textureStyle，所有字段均用可直接写入生视频提示词的中文描述。" +
          "必须具体描述人物年龄感、脸部与发型表现、服装材质与年代、关键道具、场景空间、主光方向、色温、" +
          "饱和度、镜头焦段与运动、画面材质；不得只写“写实”“电影感”等空泛词。" +
          "重点保证文生视频人物、道具和场景与高光视频属于同一视觉世界，并描述前贴结尾如何衔接高光首帧、首个动作和首句台词。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `分析前 ${input.seconds ?? 8} 秒。故事线背景：${input.storylineContext}`,
          },
          { type: "video_url", video_url: { url: input.videoUrl } },
        ],
      },
    ]);
    return transitionAnchorSchema.parse(result);
  }

  async generatePrerollScripts(input: {
    arc: StoryArc;
    relatedArcs?: StoryArc[];
    anchor: TransitionAnchor;
    analysis: StorylineResult;
    sharedStoryContext?: SharedStoryContext;
    count?: number;
    durationMin?: number;
    durationMax?: number;
    creativeSystemPrompt?: string;
    scriptSystemPrompt?: string;
    expressionType?: ProductionConfig["expressionType"];
    expressionTypes?: ProductionConfig["expressionTypes"];
    customExpressionType?: string;
    prerollTypes?: PrerollType[];
    selectionSeed?: string;
    previousScripts?: Array<
      Pick<ScriptDraft, "title" | "voiceover" | "shots">
    >;
    onProgress?: (
      progress: number,
      message: string,
    ) => void | Promise<void>;
    onScriptComplete?: (
      script: ScriptDraft,
      index: number,
    ) => void | Promise<void>;
  }) {
    const storyArcs = [
      input.arc,
      ...(input.relatedArcs ?? []),
    ].filter(
      (arc, index, values) =>
        values.findIndex(
          (candidate) => candidate.id === arc.id,
        ) === index,
    );
    const evidenceIndexes = new Set(
      storyArcs.flatMap(
        (arc) => arc.evidenceClipIndexes,
      ),
    );
    const evidence = input.analysis.clips.filter((clip) =>
      evidenceIndexes.has(clip.index),
    );
    const expectedCount = input.count ?? 3;
    const durationMin = Math.max(3, input.durationMin ?? 12);
    const durationMax = Math.max(
      durationMin,
      input.durationMax ?? 18,
    );
    const expressionTypes = input.expressionTypes?.length
      ? input.expressionTypes
      : [input.expressionType ?? "identity_contrast"];
    const selectedPrerollTypes = input.prerollTypes?.length
      ? input.prerollTypes
      : [normalizedPrerollType(input.arc.prerollType)];
    const candidatePairs = selectedPrerollTypes.flatMap(
      (_, relationOffset) =>
        expressionTypes.map((expressionType, expressionIndex) => ({
          expressionType,
          prerollType:
            selectedPrerollTypes[
              (expressionIndex + relationOffset) %
                selectedPrerollTypes.length
            ],
        })),
    );
    const pairOffset = stableSelectionOffset(
      input.selectionSeed ?? "",
      candidatePairs.length,
    );
    const selectedPair = (index: number) =>
      candidatePairs[
        (pairOffset + index) % candidatePairs.length
      ];
    const expressionLabel = (
      value: ProductionConfig["expressionType"],
    ) =>
      value === "custom"
        ? input.customExpressionType?.trim() ||
          "由模型根据剧情选择最合适的钩子范式"
        : expressionTypeLabels[value];
    const relevantEvidence = evidence.map((clip) => ({
      title: clip.title,
      summary: clip.summary,
      dialogue: clip.dialogue,
    }));
    const fingerprints = (input.previousScripts ?? [])
      .map(scriptCreativeText);
    const indexes = Array.from(
      { length: expectedCount },
      (_, index) => index,
    );
    let completedCount = 0;
    const combinedSystemPrompt = [
      "你是短剧投流前贴的一体化创意与脚本助手。一次请求内先完成创意策划，再生成可审核、可直接进入生视频阶段的完整脚本。",
      "【创意策划规则】",
      input.creativeSystemPrompt?.trim() ||
        defaultPrerollCreativeSystemPrompt,
      "【脚本编写规则】",
      input.scriptSystemPrompt?.trim() ||
        defaultPrerollScriptSystemPrompt,
      "【最高优先级合并输出协议】",
      "以上规则中的分阶段输出要求在本次任务中合并执行。只输出一个合法 JSON 对象，顶层必须同时包含 concept、script、creative_assumptions；不得输出 Markdown 或解释。concept 与 script 必须使用同一个 concept_id，且只能生成当前指定组合的一条结果。",
      "共享剧集上下文只用于统一人物身份、关系、世界观和视觉风格。所有剧情事件、对白、因果和结局必须来自当前高光的正片证据，禁止从其他高光补剧情。",
      `本次 script.total_duration_sec 必须在 ${durationMin}-${durationMax} 秒内，beats 时间轴末尾必须等于 total_duration_sec；不得沿用示例中的 14 秒或 15 秒。`,
    ].join("\n\n");

    const results = await Promise.allSettled(
      indexes.map(async (index) => {
          const pair = selectedPair(index);
          const scriptMessages = buildPrerollChatMessages(
            combinedSystemPrompt,
            {
              原始内容: compactStoryArc(input.arc),
              共享剧集上下文:
                compactSharedStoryContext(
                  input.sharedStoryContext,
                ),
              项目爽点故事线:
                storyArcs.map(compactStoryArc),
              正片高光片段: relevantEvidence,
              正片开头衔接要求:
                compactTransitionAnchor(input.anchor),
              本条指定表达类型:
                expressionLabel(pair.expressionType),
              本条指定前贴类型:
                prerollLabels[pair.prerollType],
              目标受众: input.arc.audience,
              目标时长: `${durationMin}-${durationMax}秒`,
              口播字数硬性要求:
                spokenWordcountRequirement(
                  durationMin,
                  durationMax,
                ),
              当前批次已有创意指纹: fingerprints,
              本批次位置: `第 ${index + 1}/${expectedCount} 条`,
              差异化要求:
                "与同批次其他脚本在开场动作、叙事视角、视觉奇观核和悬念卡点中至少两项明显不同。",
              固定标识:
                `concept_id 使用 C${index + 1}，script_version 使用 V1。`,
            },
            combinedSystemPrompt,
          );
          const normalize = (result: unknown) => {
            const root = objectValue(result);
            const parsedConcept = v2ConceptSchema.safeParse(
              root.concept,
            );
            if (!parsedConcept.success) {
              return {
                issues: [
                  `第 ${index + 1} 条 concept 字段不完整`,
                ],
              };
            }
            const concept: V2Concept = {
              ...parsedConcept.data,
              concept_id: `C${index + 1}`,
              hook_paradigm:
                expressionLabel(pair.expressionType),
              prepatch_type:
                prerollLabels[pair.prerollType],
            };
            const assumptions = Array.isArray(
              root.creative_assumptions,
            )
              ? root.creative_assumptions as string[]
              : [];
            const script = normalizeV2ScriptDraft(
              result,
              concept,
              assumptions,
              index,
            );
            return {
              concept,
              script,
              issues: [
                ...(!script.shots.length
                  ? ["缺少 beats"]
                  : []),
                ...(
                  script.duration < durationMin ||
                  script.duration > durationMax
                    ? [
                        `脚本总时长 ${script.duration} 秒不在要求的 ${durationMin}-${durationMax} 秒范围内`,
                      ]
                    : []
                ),
                ...validateV2ScriptDraft(script),
              ],
            };
          };
          let scriptResult = await this.chatJson<unknown>(
            scriptMessages,
            0.8,
            "medium",
          );
          let normalized = normalize(scriptResult);
          if (normalized.issues.length) {
            scriptResult = await this.chatJson<unknown>([
              ...scriptMessages,
              {
                role: "assistant",
                content: JSON.stringify(scriptResult),
              },
              {
                role: "user",
                content:
                  "当前结果未通过硬指标检查。只修正当前这一条，" +
                  "保持指定表达类型、前贴类型、concept_id、创意方向和关键情节不变，" +
                  "重新输出包含 concept、script、creative_assumptions 的完整合法 JSON。" +
                  `问题：${normalized.issues.join("；")}`,
              },
            ], 0.2, "medium");
            normalized = normalize(scriptResult);
          }
          if (!normalized.script || normalized.issues.length) {
            throw new Error(
              `第 ${index + 1} 条脚本未通过检查：` +
                normalized.issues.join("；"),
            );
          }
          normalized.script.hookType = normalizedHookType(
            input.arc.hookType,
          );
          normalized.script.prerollType = pair.prerollType;
          await input.onScriptComplete?.(
            normalized.script,
            index,
          );
          completedCount += 1;
          await input.onProgress?.(
            Math.round(90 * completedCount / expectedCount),
            `已完成 ${completedCount}/${expectedCount} 条脚本`,
          );
          return normalized.script;
      }),
    );

    const scripts = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            `第 ${index + 1} 条：${
              result.reason instanceof Error
                ? result.reason.message
                : "生成失败"
            }`,
          ]
        : [],
    );
    if (failures.length > 0) {
      throw new Error(
        `部分脚本生成失败（成功 ${scripts.length}/${expectedCount}）：${failures.join("；")}`,
      );
    }
    return scripts;
  }

  async compileVideoPrompt(input: {
    script: ScriptVariant;
    sourceRevision: string;
    anchor?: TransitionAnchor;
    systemPrompt?: string;
    characterMode: ProductionConfig["characterMode"];
    videoModel: ProductionConfig["videoModel"];
    resolution: ProductionConfig["videoResolution"];
    ratio: string;
    referenceUrls: string[];
    maxClipDurationSec: number;
    generateSubtitles: boolean;
    highlightStyle?: HighlightVisualStyle;
  }): Promise<VideoPromptPlan> {
    if (input.script.conceptId) {
      const validationIssues =
        validateV2ScriptDraft(input.script);
      if (validationIssues.length) {
        throw new Error(
          "脚本未通过生视频检查：" +
            validationIssues.join("；"),
        );
      }
    }
    const beats = input.script.shots.map((shot, index) => ({
      beat_id: shot.beatId ?? `S${index + 1}`,
      time_range: shot.time,
      segment_type:
        shot.segmentType ?? "ai_generated",
      beat_role: shot.beatRole ?? shot.purpose ?? "",
      hook_ref: shot.hookRef ?? "无",
      visual: shot.visual,
      dynamic_change: shot.dynamicChange ?? "",
      visual_contrast: shot.visualContrast ?? "无",
      character_action: shot.characterAction ?? "",
      shot_size: shot.shotSize ?? shot.framing,
      camera_move: shot.cameraMove ?? "固定",
      voiceover: shot.voiceover || "无",
      dialogue_speaker: shot.dialogueSpeaker || "无",
      dialogue: shot.dialogue || "无",
      subtitle: shot.subtitle || "无",
      scene_caption: shot.sceneCaption || "无",
      sound: shot.sound || "无",
      start_state: shot.startState ?? "",
      end_state: shot.endState ?? "",
      cut_to_next:
        shot.cutToNext ??
        shot.editingRhythm ??
        "硬切",
      characters: shot.characters ?? [],
      scene: shot.scene ?? "",
      key_props: shot.keyProps ?? [],
    }));
    const aiShots = input.script.shots.filter(
      (shot) => shot.segmentType !== "original_footage",
    );
    const targetSegments = planVideoSegments(
      aiShots,
      input.script.aiSegmentSec ?? input.script.duration,
      input.maxClipDurationSec,
    );
    const targetDurations = targetSegments.map(
      (segment) => segment.duration,
    );
    const targetSourceBeats = targetSegments.map(
      (segment) =>
        segment.shotIndexes.map(
          (shotIndex) =>
            aiShots[shotIndex]?.beatId ??
            `S${shotIndex + 1}`,
        ),
    );
    const characterNames = [
      ...new Set(
        input.script.shots.flatMap(
          (shot) => shot.characters ?? [],
        ),
      ),
    ];
    const sceneNames = [
      ...new Set(
        input.script.shots
          .map((shot) => shot.scene)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const normalizationFallback = {
      scriptId: input.script.id,
      revision: input.sourceRevision,
      globalVisualStyle:
        input.highlightStyle
          ? `${input.highlightStyle.visualMedium}；${input.highlightStyle.textureStyle}；${input.highlightStyle.colorStyle}`
          : "写实短剧，快节奏投流影像",
      characterLock: `${characterNames.length
        ? `${characterNames.join("、")}的外观、服装和身份特征保持一致`
        : "脚本中所有人物的外观、服装和身份特征保持一致"}${
        input.highlightStyle
          ? `；人物风格：${input.highlightStyle.characterStyle}；服装风格：${input.highlightStyle.wardrobeStyle}`
          : ""
      }`,
      sceneLock: `${sceneNames.length
        ? `${sceneNames.join("、")}的空间结构、道具和光线保持一致`
        : "脚本中所有场景的空间结构、道具和光线保持一致"}${
        input.highlightStyle
          ? `；场景风格：${input.highlightStyle.sceneStyle}；道具风格：${input.highlightStyle.propStyle}`
          : ""
      }`,
    };
    const resolvedSystemPrompt =
      input.systemPrompt?.trim() ||
      (
        input.generateSubtitles
          ? defaultVideoPromptSystemPrompt
          : defaultVideoPromptWithoutSubtitlesSystemPrompt
      );
    const currentSystemPromptHash =
      videoPromptSystemPromptHash(resolvedSystemPrompt);
    const subtitleModeContract = input.generateSubtitles
      ? `
## 当前字幕模式（优先级最高，不可覆盖）
本次为有字幕模式。按脚本中的旁白、对白和字幕字段生成逐句同步字幕；字幕要求必须写入对应【镜头N】，不得集中到【画面文字】。`
      : `
## 当前字幕模式（优先级最高，不可覆盖）
本次为无字幕模式。保留旁白、对白、音乐和音效，但禁止字幕、花字、标题、角标、Logo、水印、UI 和任何可见文字。
每个【镜头N】不得包含“字幕【】”或其他可见文字指令；【画面文字】必须为“无”；每段【全局限制(Negative)】必须明确包含上述全部可见文字类型。`;
    const structuredSystemPrompt = `${resolvedSystemPrompt}

## 平台结构化输出契约（优先级最高，不可覆盖）
无论上文要求 Plain Text、Markdown 或其他格式，最终都只输出合法 JSON，不输出解释或代码块。
顶层结构必须为 {"video_prompt_plan": {...}}。
video_prompt_plan 必须包含 clips 数组且至少有 1 项；每项必须包含 clip_id、source_beats、duration_sec、reference_assets、video_prompt、sound。
clips 数量和 duration_sec 必须严格对应输入中的“目标提交分段时长”。
每个 clip 的 source_beats 必须严格对应同位置的“目标提交分段镜头”，不得多带或漏掉镜头。
需要多段时，每段 video_prompt 只能描述本段 source_beats，不得复制完整脚本或其他片段内容；每段内部时间轴都从 0 秒开始，到该段 duration_sec 结束。
## 生成参数隔离（优先级最高，不可覆盖）
画幅、宽高比、横屏、竖屏、分辨率、帧率、码率和文件格式均由生成平台参数控制。
除结构化元数据字段外，不得在 global_visual_style、camera_principle、video_prompt 或其他自然语言提示词字段中回显或描述这些参数。
不得写 1080P、720P、480P、“短视频平台比例”“适配短视频平台观看比例”或任何同义的平台参数、平台适配描述。
global_visual_style、camera_principle、【摄影机参数】【镜头参数】及其他全局区域，只能描述整体镜头语言、运镜原则、稳定方式和景深连续性，不得写 35mm、50mm、85mm 或其他焦段数值。
焦段参数只能写在对应的【镜头N】内部，并且必须服务于该镜头的景别和叙事目的。
${subtitleModeContract}
${
  input.highlightStyle
    ? `
## 高光视频视觉风格强约束（优先级最高，不可覆盖）
这是文生视频与关联高光保持视觉连续性的必要条件。
global_visual_style、character_constraints、scene_prop_constraints 及每个 clip 的 video_prompt，
必须明确执行输入中的“高光视频视觉风格”，覆盖人物年龄感、脸部与发型表现、服装材质、关键道具、
场景空间、光线色温、色彩、镜头语言和画面材质。不得改成其他画风，不得用“写实”“电影感”等空泛词替代具体特征。`
    : ""
}`;
    const messages = buildPrerollChatMessages(
        structuredSystemPrompt,
        {
          最终确认版脚本: {
            script_version:
              input.script.scriptVersion ?? "V1",
            concept_id:
              input.script.conceptId ??
              input.script.proposalId ??
              "C1",
            mode:
              input.script.mode ?? "剧情锚定模式",
            prepatch_type:
              input.script.prepatchType ??
              prerollLabels[input.script.prerollType],
            audience_genre:
              input.script.audienceGenre ?? "",
            title: input.script.title,
            total_duration_sec: input.script.duration,
            ai_segment_sec:
              input.script.aiSegmentSec ??
              input.script.duration,
            original_footage_sec:
              input.script.originalFootageSec ?? 0,
            creative_theme:
              input.script.creativeTheme ?? "",
            watch_motivation:
              input.script.watchMotivation ??
              input.script.coreHook ??
              "",
            vo_tone: input.script.voTone ?? "",
            vo_speed: "1-1.8倍速，约4-9字每秒",
            vo_wordcount:
              input.script.voWordcount ??
              input.script.voiceover.length,
            hook_title_card:
              input.script.hookTitleCard ?? "无",
            beats,
            bridge_beat_id:
              input.script.bridgeBeatId ?? "无",
            bridge_type:
              input.script.bridgeType ?? "无需桥接",
            ending_cutoff:
              input.script.endingCutoff ??
              input.script.transition,
            mainfilm_entry:
              input.script.mainfilmEntry ??
              input.anchor?.recommendedTransition ??
              input.script.transition,
          },
          参考素材与生成参数: {
            人物方式: input.characterMode,
            目标模型: input.videoModel,
            分辨率: input.resolution,
            画幅: input.ratio,
            单次最大稳定生成时长: input.maxClipDurationSec,
            目标提交分段时长: targetDurations,
            目标提交分段镜头: targetSourceBeats,
            参考素材: input.referenceUrls,
            生成字幕: input.generateSubtitles,
            高光视频视觉风格: input.highlightStyle ?? "未提供",
          },
          用户补充要求:
            "严格按“目标提交分段时长”输出对应数量的片段；" +
            "总时长不超过单次上限时只输出一个片段。" +
            "同时执行 System Prompt 的筛选、合并和片段内部快切规则。" +
            (input.highlightStyle
              ? "高光视频视觉风格是强约束：文生视频的人物年龄感、脸部与发型表现、服装材质、关键道具、" +
                "场景空间、光线色温、色彩、镜头语言和画面材质必须与高光一致；不得自行切换为其他画风。"
              : ""),
        },
        resolvedSystemPrompt,
      );
    let result = await this.chatJson<unknown>(
      messages,
      0.35,
      "medium",
    );
    let parsed = normalizeVideoPromptPlan(
      result,
      normalizationFallback,
    );
    let ruleIssues = parsed.success
      ? [
          ...validateVideoPromptPlanRules(
            parsed.data,
            input.generateSubtitles,
          ),
          ...validateVideoPromptTargetSegments(
            parsed.data,
            targetDurations,
            targetSourceBeats,
          ),
        ]
      : [];
    if (!parsed.success || ruleIssues.length) {
      const issues = parsed.success
        ? ruleIssues
        : parsed.error.issues.map((issue) =>
            `${issue.path.join(".") || "root"}：${issue.message}`);
      result = await this.chatJson<unknown>(
        [
          ...messages,
          {
            role: "assistant",
            content: JSON.stringify(result),
          },
          {
            role: "user",
            content:
              "当前生视频提示词未通过结构检查。只修正当前 JSON，" +
              "保持创意、脚本内容、片段顺序和已有有效字段不变，" +
              "严格按目标段数、目标时长和目标镜头重新划分；每段只描述自己的 source_beats，" +
              "不得把同一份完整脚本提示词复制到多个片段；每段时间轴从 0 秒开始。" +
              "补齐或修正以下字段后输出完整合法 JSON，不要解释：" +
              issues.join("；"),
          },
        ],
        0.1,
        "medium",
      );
      parsed = normalizeVideoPromptPlan(
        result,
        normalizationFallback,
      );
      ruleIssues = parsed.success
        ? [
            ...validateVideoPromptPlanRules(
              parsed.data,
              input.generateSubtitles,
            ),
            ...validateVideoPromptTargetSegments(
              parsed.data,
              targetDurations,
              targetSourceBeats,
            ),
          ]
        : [];
    }
    if (!parsed.success || ruleIssues.length) {
      if (parsed.success) {
        return buildFallbackVideoPromptPlan(input);
      }
      const issues = parsed.error.issues.map((issue) =>
        `${issue.path.join(".") || "root"}：${issue.message}`);
      const onlySegmentsMissing =
        parsed.error.issues.length > 0 &&
        parsed.error.issues.every(
          (issue) => issue.path[0] === "segments",
        );
      if (onlySegmentsMissing) {
        return buildFallbackVideoPromptPlan(input);
      }
      throw new Error(
        "Seedance 生视频提示词字段不完整：" +
          issues.join("；"),
      );
    }
    const plan: VideoPromptPlan = {
      ...parsed.data,
      sourceScriptId: input.script.id,
      sourceRevision: input.sourceRevision,
      systemPromptHash: currentSystemPromptHash,
      generateSubtitles: input.generateSubtitles,
      maxClipDurationSec: input.maxClipDurationSec,
      segments: parsed.data.segments.map(
        (segment, index) => ({
          ...segment,
          index,
          duration: targetDurations[index],
          sourceBeats: targetSourceBeats[index],
          sound:
            segment.sound ||
            parsed.data.soundPrinciple,
        }),
      ),
    };
    return {
      ...plan,
      globalVisualStyle: stripVideoRatioInstructions(
        plan.globalVisualStyle,
      ),
      cameraPrinciple: stripVideoRatioInstructions(
        plan.cameraPrinciple ?? "",
      ),
      segments: plan.segments.map((segment) => ({
        ...segment,
        prompt: stripVideoRatioInstructions(segment.prompt),
      })),
    };
  }

  async generateImage(input: {
    prompt: string;
    size: string;
    referenceUrls?: string[];
    model?: "seedream_5_0_lite" | "seedream_5_0_pro";
  }) {
    const model =
      input.model === "seedream_5_0_lite"
        ? env.ARK_IMAGE_MODEL_SEEDREAM_5_0_LITE ??
          "doubao-seedream-5-0-260128"
        : input.model === "seedream_5_0_pro"
          ? env.ARK_IMAGE_MODEL_SEEDREAM_5_0_PRO ??
            "doubao-seedream-5-0-pro-260628"
          : env.ARK_IMAGE_MODEL;
    if (!model) throw new Error("ARK_IMAGE_MODEL 未配置");
    const requestBody = {
      model,
      prompt: input.prompt,
      image: input.referenceUrls,
      size: input.size,
      response_format: "url",
      output_format: "jpeg",
      watermark: false,
      ...(input.model === "seedream_5_0_lite"
        ? {
            sequential_image_generation:
              "disabled",
          }
        : {}),
    };
    const data = await this.request<{
      data: Array<{ url?: string; size?: string; error?: { message?: string } }>;
    }>("/images/generations", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    const urls = data.data.flatMap((item) => (item.url ? [item.url] : []));
    if (urls.length === 0) throw new Error("Seedream 未返回可用图片");
    return { urls, size: data.data[0]?.size ?? input.size };
  }

  async createPreroll(input: {
    prompt: string;
    duration: number;
    ratio: string;
    referenceUrls?: string[];
    model: ProductionConfig["videoModel"];
    resolution: ProductionConfig["videoResolution"];
  }) {
    const model = resolveVideoModel(input.model);
    const content: unknown[] = [{ type: "text", text: input.prompt }];
    for (const url of input.referenceUrls ?? []) {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      });
    }
    const data = await videoSubmissionLimiter.schedule(() =>
      this.request<ArkVideoTask>(
        "/contents/generations/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            model,
            content,
            duration: input.duration,
            ratio: input.ratio,
            resolution: input.resolution,
            generate_audio: true,
            return_last_frame: true,
          }),
        },
      ),
    );
    return { id: data.id, status: normalizeProviderStatus(data.status), progress: 2 };
  }

  async getPrerollTask(id: string) {
    const data = await this.request<ArkVideoTask>(
      `/contents/generations/tasks/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    const status = normalizeProviderStatus(data.status);
    return {
      id: data.id,
      status,
      progress: status === "completed" ? 100 : status === "running" ? 58 : 8,
      videoUrl: data.content?.video_url,
      error: data.error?.message,
    };
  }
}
