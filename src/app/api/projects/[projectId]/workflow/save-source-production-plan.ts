import { NextResponse } from "next/server";

import { validateHighlightSettings } from "./helpers";
import type {
  SaveProductionPlanAction,
  WorkflowPlanProject,
} from "./production-plan-types";
import {
  normalizeProductionConfig,
  recommendHighlightSettings,
} from "@/lib/production-config";
import {
  getPipelineProject,
  saveNextProductionPlan,
} from "@/lib/pipeline-store";

export async function saveSourceProductionPlan(
  input: SaveProductionPlanAction,
  project: WorkflowPlanProject,
  productionConfig: ReturnType<typeof normalizeProductionConfig>,
  requestId: string,
) {
  const projectId = project.id;
  const pipeline = await getPipelineProject(projectId);
  const effectiveSourceAssetIds =
    input.sourceAssetIds.length > 0
      ? input.sourceAssetIds
      : pipeline?.analysisSourceAssetIds ?? [];
  const requestedSet = new Set(effectiveSourceAssetIds);
  const selectedAssets = project.assets.filter((asset) =>
    requestedSet.has(asset.id),
  );
  if (selectedAssets.length !== effectiveSourceAssetIds.length) {
    return NextResponse.json(
      { error: "所选源视频不存在或不属于当前项目", requestId },
      { status: 400 },
    );
  }
  if (selectedAssets.length === 0) {
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
      [],
    );
    return NextResponse.json({ data, requestId });
  }
  if (selectedAssets.some((asset) => !asset.durationMs)) {
    return NextResponse.json(
      {
        error: "所选素材时长尚未读取完成，请稍后再保存方案",
        requestId,
      },
      { status: 409 },
    );
  }
  const sourceDuration =
    selectedAssets.reduce(
      (total, asset) => total + (asset.durationMs ?? 0),
      0,
    ) / 1000;
  const validationError = validateHighlightSettings(
    sourceDuration,
    productionConfig,
  );
  if (validationError) {
    return NextResponse.json(
      { error: validationError, requestId },
      { status: 400 },
    );
  }
  const data = await saveNextProductionPlan(
    projectId,
    productionConfig,
    recommendHighlightSettings(sourceDuration, productionConfig),
    input.prerollType,
    effectiveSourceAssetIds,
  );
  return NextResponse.json({ data, requestId });
}
