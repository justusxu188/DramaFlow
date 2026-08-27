import type { ProductionConfig } from "@/lib/production-config";

export const creativeWorkTypeIds = [
  "full-chain",
  "highlight-preroll",
  "batch-highlights",
  "post-production",
] as const;

export type CreativeWorkTypeId =
  (typeof creativeWorkTypeIds)[number];

export type ProductionWorkspaceStage =
  | "plan"
  | "analysis"
  | "arcs"
  | "highlights"
  | "scripts"
  | "prerolls"
  | "outputs";

export type CreativeWorkType = {
  id: CreativeWorkTypeId;
  label: string;
  shortDescription: string;
  description: string;
  productionEntry?: ProductionConfig["productionEntry"];
  stages: ProductionWorkspaceStage[];
  supportsExecutionMode: boolean;
};

export const creativeWorkTypes: CreativeWorkType[] = [
  {
    id: "full-chain",
    label: "全链路素材创作",
    shortDescription: "从原剧到最终广告成片",
    description:
      "完成剧情理解、爽点提炼、高光剪辑、AI 前贴创作与最终合成。",
    productionEntry: "full_drama",
    stages: [
      "plan",
      "analysis",
      "arcs",
      "highlights",
      "scripts",
      "prerolls",
      "outputs",
    ],
    supportsExecutionMode: true,
  },
  {
    id: "highlight-preroll",
    label: "高光前贴创作",
    shortDescription: "已有高光，制作前贴并合成",
    description:
      "从素材库选择高光，完成内容理解、脚本创作、前贴生成与广告合成。",
    productionEntry: "uploaded_highlights",
    stages: [
      "plan",
      "analysis",
      "arcs",
      "scripts",
      "prerolls",
      "outputs",
    ],
    supportsExecutionMode: true,
  },
  {
    id: "batch-highlights",
    label: "批量高光剪辑",
    shortDescription: "批量生产可复用高光素材",
    description:
      "选择原始剧集并批量剪出高光，结果保存到素材库后结束。",
    productionEntry: "batch_highlights",
    stages: ["plan", "highlights"],
    supportsExecutionMode: false,
  },
  {
    id: "post-production",
    label: "视频后期剪辑",
    shortDescription: "字幕、花字、擦除与转场",
    description:
      "对已有视频进行字幕擦除、字幕与花字添加、转场和导出处理。",
    stages: [],
    supportsExecutionMode: false,
  },
];

export function parseCreativeWorkType(
  value: string | null | undefined,
) {
  return (
    creativeWorkTypes.find((item) => item.id === value) ??
    creativeWorkTypes[0]
  );
}

export function workTypeFromProductionEntry(
  entry: ProductionConfig["productionEntry"],
) {
  return (
    creativeWorkTypes.find(
      (item) => item.productionEntry === entry,
    ) ?? creativeWorkTypes[0]
  );
}
