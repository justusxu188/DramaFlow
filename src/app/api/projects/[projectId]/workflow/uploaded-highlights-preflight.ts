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
  getPipelineWorkspaceSnapshot,
  saveProductionPlan,
  startPipelineRun,
  startPipelineRunFromSharedArtifacts,
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
  const originalSourceIds = project.assets
    .slice(0, 30)
    .map((asset) => asset.id);
  const sharedWorkspace =
    originalSourceIds.length > 0
      ? (
          await getPipelineWorkspaceSnapshot(projectId, "full_drama")
        ).project
      : null;
  const reusableSourceIds = sharedWorkspace?.analysis
    ? sharedWorkspace.analysisSourceAssetIds ?? []
    : [];
  const reusesProjectStory =
    reusableSourceIds.length > 0 && Boolean(sharedWorkspace?.analysis);

  if (reusesProjectStory) {
    await startPipelineRunFromSharedArtifacts(
      projectId,
      runId,
      reusableSourceIds,
    );
  } else {
    await startPipelineRun(
      projectId,
      runId,
      originalSourceIds.length > 0
        ? originalSourceIds
        : selectedHighlights.map((asset) => asset.id),
    );
  }
  await saveProductionPlan(
    projectId,
    productionConfig,
    recommendHighlightSettings(
      Math.max(1, duration),
      productionConfig,
    ),
    input.prerollType,
    reusesProjectStory
      ? reusableSourceIds
      : originalSourceIds.length > 0
        ? originalSourceIds
        : selectedHighlights.map((asset) => asset.id),
    runId,
  );
  await confirmProductionPlan(projectId, runId);

  return {
    ok: true as const,
    projectId,
    selectedHighlights,
    sharedWorkspace,
    reusesProjectStory,
    originalSourceIds,
    uploadedHighlights,
    sharedInput: {
      runId,
      autoRun: true,
      prerollType: input.prerollType,
      uploadedHighlights,
      storyContextSource:
        originalSourceIds.length > 0
          ? "project_sources"
          : "selected_highlights",
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
