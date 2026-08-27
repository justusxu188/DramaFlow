import {
  getCreativeSettings,
  selectVideoPromptSystemPrompt,
} from "@/lib/creative-settings-store";
import {
  listCuratedVideoAssets,
  listHighlightAssets,
  listImageAssets,
} from "@/lib/project-store";
import { isUsableCharacterImageAsset } from "@/lib/character-image-assets";
import {
  normalizeProductionConfig,
  type ProductionConfig,
} from "@/lib/production-config";
import {
  getPipelineWorkspaceSnapshot,
  videoPromptMatchesScript,
  videoPromptSystemPromptHash,
} from "@/lib/pipeline-store";

export async function getWorkflowWorkspace(
  projectId: string,
  productionEntry?: ProductionConfig["productionEntry"],
) {
  const [
    snapshot,
    imageAssets,
    settings,
    featuredHighlights,
    featuredPrerolls,
    featuredFinals,
  ] = await Promise.all([
    getPipelineWorkspaceSnapshot(projectId, productionEntry),
    listImageAssets(projectId),
    getCreativeSettings(),
    listHighlightAssets(projectId),
    listCuratedVideoAssets(projectId, "preroll_video"),
    listCuratedVideoAssets(projectId, "final_video"),
  ]);
  const { project: data, jobs } = snapshot;
  const generateSubtitles =
    data?.productionConfig?.generateSubtitles ?? false;
  const currentVideoPromptHash = videoPromptSystemPromptHash(
    selectVideoPromptSystemPrompt(settings, generateSubtitles),
  );
  const nextProductionPlan = productionEntry
    ? data?.productionPlans?.[productionEntry]
    : undefined;
  const availableRuns = (data?.runs ?? [])
    .filter(
      (run) =>
        !productionEntry ||
        run.productionConfig?.productionEntry === productionEntry,
    )
    .sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    )
    .map((run) => ({
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      sourceAssetCount: run.sourceAssetIds.length,
    }));

  return {
    data: data
      ? {
          ...data,
          runs: availableRuns,
          scripts: data.scripts.map((script) =>
            script.videoPromptStatus === "ready" &&
            !videoPromptMatchesScript(
              script,
              generateSubtitles,
              currentVideoPromptHash,
            )
              ? {
                  ...script,
                  videoPromptStatus: "stale" as const,
                }
              : script,
          ),
          nextProductionPlan,
          productionConfig: data.productionConfig
            ? normalizeProductionConfig(data.productionConfig)
            : undefined,
        }
      : null,
    imageAssets: imageAssets.filter(
      isUsableCharacterImageAsset,
    ),
    featuredAssets: [
      ...featuredHighlights.flatMap((asset) =>
        asset.metadata.sourceArtifactId
          ? [
              {
                id: asset.id,
                kind: asset.kind,
                sourceArtifactId: asset.metadata.sourceArtifactId,
              },
            ]
          : [],
      ),
      ...featuredPrerolls.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        sourceArtifactId: asset.metadata.sourceArtifactId,
      })),
      ...featuredFinals.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        sourceArtifactId: asset.metadata.sourceArtifactId,
      })),
    ],
    jobs,
    settings,
  };
}
