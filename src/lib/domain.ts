import { z } from "zod";

export const pipelineStages = [
  "source",
  "analysis",
  "strategy",
  "script",
  "preroll",
  "highlight",
  "compose",
] as const;

export const stageLabels: Record<(typeof pipelineStages)[number], string> = {
  source: "正片素材",
  analysis: "剧情理解",
  strategy: "钩子策略",
  script: "前贴脚本",
  preroll: "前贴生成",
  highlight: "高光智剪",
  compose: "合成导出",
};

export const hookTypes = [
  "abnormal_line",
  "supernatural",
  "identity_gap",
  "life_crisis",
] as const;

export const hookLabels: Record<(typeof hookTypes)[number], string> = {
  abnormal_line: "反常台词",
  supernatural: "超自然猎奇",
  identity_gap: "身份反差",
  life_crisis: "生死危机",
};

export const prerollTypes = [
  "story_linked",
  "story_extended",
  "strong_acquisition",
  "strong_acquisition_extended",
  "network_replica",
] as const;

export const prerollLabels: Record<(typeof prerollTypes)[number], string> = {
  story_linked: "剧情强关联",
  story_extended: "剧情延展",
  strong_acquisition: "强引流性质",
  strong_acquisition_extended: "强引流+剧情延展",
  network_replica: "网络热点复刻",
};

export const highlightModes = ["montage", "text", "voiceover"] as const;

export const highlightLabels: Record<(typeof highlightModes)[number], string> = {
  montage: "高光混剪",
  text: "文字解说",
  voiceover: "旁白解说",
};

export const jobStatuses = [
  "draft",
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
  "canceled",
] as const;

export const projectInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  genre: z.string().trim().min(1).max(32),
  episodeCount: z.number().int().min(0).max(500).default(0),
});

export const sourceUploadModes = ["episodes", "full"] as const;

export const sourceAssetInputSchema = z.object({
  uploadMode: z.enum(sourceUploadModes),
  name: z.string().trim().min(1).max(180),
  objectKey: z.string().trim().min(1).max(1024),
  sourceUrl: z.string().url(),
  mimeType: z.enum(["video/mp4", "video/quicktime"]),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024),
  durationMs: z.number().int().positive().max(6 * 60 * 60 * 1000),
  episodeNumber: z.number().int().min(1).max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.uploadMode === "episodes" && value.episodeNumber == null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["episodeNumber"],
      message: "分集上传必须提供集数",
    });
  }
  if (value.uploadMode === "full" && value.episodeNumber != null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["episodeNumber"],
      message: "整剧上传不能设置集数",
    });
  }
});

export const pipelineInputSchema = z.object({
  stage: z.enum(pipelineStages),
  hookType: z.enum(hookTypes).optional(),
  prerollType: z.enum(prerollTypes).optional(),
  highlightMode: z.enum(highlightModes).optional(),
  duration: z.number().int().min(3).max(180).optional(),
  prompt: z.string().trim().max(2000).optional(),
  videoUrls: z.array(z.string().url()).min(1).max(100).optional(),
  transitions: z.array(z.string().trim().min(1).max(32)).max(99).optional(),
});

export type PipelineStage = (typeof pipelineStages)[number];
export type HookType = (typeof hookTypes)[number];
export type PrerollType = (typeof prerollTypes)[number];
export type HighlightMode = (typeof highlightModes)[number];
export type JobStatus = (typeof jobStatuses)[number];

export const imageSizes = {
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2848x1600",
    "9:16": "1600x2848",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3136x1344",
  },
  "4K": {
    "1:1": "4096x4096",
    "4:3": "4704x3520",
    "3:4": "3520x4704",
    "16:9": "5504x3040",
    "9:16": "3040x5504",
    "3:2": "4992x3328",
    "2:3": "3328x4992",
    "21:9": "6240x2656",
  },
} as const;

export function normalizeProviderStatus(status: string): JobStatus {
  if (status === "succeeded" || status === "completed") return "completed";
  if (status === "queued" || status === "pending") return "queued";
  if (status === "running" || status === "processing") return "running";
  if (status === "canceled" || status === "cancelled") return "canceled";
  return "failed";
}
