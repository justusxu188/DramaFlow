import { NextResponse } from "next/server";

import { videoPromptSnapshot } from "./helpers";
import type {
  StartProductionAction,
  WorkflowProject,
} from "./start-production-types";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import { listHighlightAssets } from "@/lib/project-store";
import {
  normalizeProductionConfig,
  recommendHighlightSettings,
} from "@/lib/production-config";
import {
  confirmProductionPlan,
  saveProductionPlan,
  startPipelineRun,
} from "@/lib/pipeline-store";

export async function prepareUploadedHighlightsRun(
  input: StartProductionAction,
  project: WorkflowProject,
  requestedConfig: ReturnType<typeof normalizeProductionConfig>,
  requestId: string,
) {
  const projectId = project.id;
  const selectedIds = new Set(
    requestedConfig.selectedHighlightAssetIds,
  );
  const selectedHighlights = (
    await listHighlightAssets(projectId)
  ).filter((asset) => selectedIds.has(asset.id));
  if (
    selectedHighlights.length !== selectedIds.size ||
    selectedHighlights.length === 0
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "请至少选择一个属于当前项目的高光视频", requestId },
        { status: 400 },
      ),
    };
  }
  const creativeSettings = await getCreativeSettings();
  const runId = `run-${crypto.randomUUID()}`;
  const duration =
    selectedHighlights.reduce(
      (total, asset) => total + (asset.durationMs ?? 60_000),
      0,
    ) / 1000;
  const productionConfig = normalizeProductionConfig(requestedConfig);
  const originalContextIds = new Set(
    productionConfig.storyContextMode ===
      "highlights_with_originals"
      ? productionConfig.selectedOriginalContextAssetIds
      : [],
  );
  const selectedOriginals = project.assets.filter((asset) =>
    originalContextIds.has(asset.id),
  );
  if (
    productionConfig.storyContextMode ===
      "highlights_with_originals" &&
    (
      selectedOriginals.length === 0 ||
      selectedOriginals.length !== originalContextIds.size
    )
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "请选择至少一个属于当前项目的原视频作为剧情背景",
          requestId,
        },
        { status: 400 },
      ),
    };
  }
  const uploadedHighlights = selectedHighlights.map((asset) => ({
    assetId: asset.id,
    highlightId: `highlight-upload-${asset.id}`,
    name: asset.name,
    videoUrl: asset.sourceUrl,
    duration: Math.max(1, (asset.durationMs ?? 60_000) / 1000),
    sizeBytes: asset.sizeBytes,
    sourceRunId: asset.metadata.sourceRunId,
    sourceHighlightId: asset.metadata.sourceHighlightId,
  }));
  const evidenceSourceIds = selectedHighlights.map(
    (asset) => asset.id,
  );
  await startPipelineRun(projectId, runId, evidenceSourceIds);
  await saveProductionPlan(
    projectId,
    productionConfig,
    recommendHighlightSettings(
      Math.max(1, duration),
      productionConfig,
    ),
    input.prerollType,
    evidenceSourceIds,
    runId,
  );
  await confirmProductionPlan(projectId, runId);

  return {
    ok: true as const,
    projectId,
    selectedHighlights,
    selectedOriginals,
    uploadedHighlights,
    sharedInput: {
      runId,
      autoRun: true,
      prerollType: input.prerollType,
      uploadedHighlights,
      storyContextSource:
        selectedOriginals.length > 0
          ? "selected_highlights_with_originals"
          : "selected_highlights",
      evidenceAssetIds: evidenceSourceIds,
      backgroundAssetIds: selectedOriginals.map(
        (asset) => asset.id,
      ),
      prerollCreativeSystemPrompt:
        creativeSettings.prerollCreativeSystemPrompt,
      prerollScriptSystemPrompt:
        creativeSettings.prerollScriptSystemPrompt,
      videoPromptSystemPrompt: videoPromptSnapshot(
        creativeSettings,
        productionConfig.generateSubtitles,
      ),
      ...productionConfig,
    },
  };
}
