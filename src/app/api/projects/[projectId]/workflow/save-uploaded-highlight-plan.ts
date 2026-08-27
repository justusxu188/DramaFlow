import { NextResponse } from "next/server";

import type { SaveProductionPlanAction } from "./production-plan-types";
import { listHighlightAssets } from "@/lib/project-store";
import {
  normalizeProductionConfig,
  recommendHighlightSettings,
} from "@/lib/production-config";
import {
  getPipelineProject,
  saveNextProductionPlan,
} from "@/lib/pipeline-store";

export async function saveUploadedHighlightPlan(
  input: SaveProductionPlanAction,
  projectId: string,
  productionConfig: ReturnType<typeof normalizeProductionConfig>,
  requestId: string,
) {
  const pipeline = await getPipelineProject(projectId);
  const highlightAssets = await listHighlightAssets(projectId);
  const selectedIds = new Set(
    productionConfig.selectedHighlightAssetIds,
  );
  const selectedHighlights = highlightAssets.filter((asset) =>
    selectedIds.has(asset.id),
  );
  if (selectedHighlights.length !== selectedIds.size) {
    return NextResponse.json(
      { error: "所选高光视频不存在或不属于当前项目", requestId },
      { status: 400 },
    );
  }
  if (selectedHighlights.length === 0) {
    const data = await saveNextProductionPlan(
      projectId,
      productionConfig,
      pipeline?.highlightRecommendation ??
        recommendHighlightSettings(
          Math.max(
            1,
            productionConfig.highlightTargetDuration *
              productionConfig.highlightTargetCount,
          ),
          productionConfig,
        ),
      input.prerollType,
      pipeline?.analysisSourceAssetIds ?? [],
    );
    return NextResponse.json({ data, requestId });
  }
  const sourceDuration =
    selectedHighlights.reduce(
      (total, asset) => total + (asset.durationMs ?? 60_000),
      0,
    ) / 1000;
  const data = await saveNextProductionPlan(
    projectId,
    productionConfig,
    recommendHighlightSettings(
      Math.max(1, sourceDuration),
      productionConfig,
    ),
    input.prerollType,
    [],
  );
  return NextResponse.json({ data, requestId });
}
