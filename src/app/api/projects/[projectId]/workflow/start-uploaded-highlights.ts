import { NextResponse } from "next/server";

import type {
  StartProductionAction,
  WorkflowProject,
} from "./start-production-types";
import { prepareUploadedHighlightsRun } from "./uploaded-highlights-preflight";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
import {
  mediaAnalysisProfileHash,
  mediaAssetRevisionKey,
} from "@/lib/media-understanding";
import { normalizeProductionConfig } from "@/lib/production-config";
import {
  enqueuePipelineJob,
  upsertHighlight,
} from "@/lib/pipeline-store";

export async function startUploadedHighlights(
  input: StartProductionAction,
  project: WorkflowProject,
  requestedConfig: ReturnType<typeof normalizeProductionConfig>,
  requestId: string,
) {
  const prepared = await prepareUploadedHighlightsRun(
    input,
    project,
    requestedConfig,
    requestId,
  );
  if (!prepared.ok) {
    return prepared.response;
  }
  const {
    projectId,
    selectedHighlights,
    selectedOriginals,
    uploadedHighlights,
    sharedInput,
  } = prepared;
  const highlightAnalysisProfileHash =
    mediaAnalysisProfileHash({
      enableSnapshot:
        requestedConfig.characterMode ===
        "drama_character",
    });
  const backgroundAnalysisProfileHash =
    mediaAnalysisProfileHash();
  const highlightAnalysisJobs = [];
  for (const [index, asset] of selectedHighlights.entries()) {
    const uploaded = uploadedHighlights[index];
    await upsertHighlight(projectId, {
      id: uploaded.highlightId,
      arcId: "",
      mode: "uploaded",
      status: "completed",
      result: {
        duration: uploaded.duration,
        videoUrls: [asset.sourceUrl],
        variants: [
          {
            index: 0,
            duration: uploaded.duration,
            size: asset.sizeBytes,
            videoUrl: asset.sourceUrl,
            clips: [],
          },
        ],
        storyboard: [],
      },
    }, sharedInput.runId);
    const analysisJob = await enqueuePipelineJob({
      projectId,
      kind: "highlight_analysis",
      input: {
        ...sharedInput,
        sourceHighlightAssetId: asset.id,
        highlightId: uploaded.highlightId,
        sourceName: asset.name,
        videoUrl: asset.sourceUrl,
        sourceAssetIds: [asset.id],
        assetRevisionKey: mediaAssetRevisionKey(asset),
        analysisProfileHash:
          highlightAnalysisProfileHash,
      },
    });
    highlightAnalysisJobs.push(analysisJob);
    void runPipelineJobNow(analysisJob.id);
  }

  const backgroundAnalysisJobs = [];
  for (const asset of selectedOriginals) {
    const analysisJob = await enqueuePipelineJob({
      projectId,
      kind: "media_analysis",
      input: {
        ...sharedInput,
        assetId: asset.id,
        assetRevisionKey: mediaAssetRevisionKey(asset),
        analysisProfileHash:
          backgroundAnalysisProfileHash,
        sourceKind: "source",
        sourceName: asset.name,
        videoUrl: asset.sourceUrl,
        sourceAssetIds: [asset.id],
      },
    });
    backgroundAnalysisJobs.push(analysisJob);
    void runPipelineJobNow(analysisJob.id);
  }

  const contextJob = await enqueuePipelineJob({
    projectId,
    kind: "highlight_context",
    input: {
      ...sharedInput,
      analysisJobIds: highlightAnalysisJobs.map(
        (job) => job.id,
      ),
      backgroundAnalysisJobIds: backgroundAnalysisJobs.map(
        (job) => job.id,
      ),
      sourceAssetIds: selectedHighlights.map(
        (asset) => asset.id,
      ),
    },
  });
  void runPipelineJobNow(contextJob.id);

  return NextResponse.json(
    {
      data: [
        ...highlightAnalysisJobs,
        ...backgroundAnalysisJobs,
        contextJob,
      ],
      reused: [],
      storyContextSource: sharedInput.storyContextSource,
      requestId,
    },
    { status: 202 },
  );
}
