import { NextResponse } from "next/server";

import type {
  StartProductionAction,
  WorkflowProject,
} from "./start-production-types";
import { prepareUploadedHighlightsRun } from "./uploaded-highlights-preflight";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
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
    sharedWorkspace,
    reusesProjectStory,
    originalSourceIds,
    uploadedHighlights,
    sharedInput,
  } = prepared;
  const sharedArcs = sharedWorkspace?.arcs ?? [];

  if (!reusesProjectStory && originalSourceIds.length === 0) {
    const analysisJobs = [];
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
          variants: [{
            index: 0,
            duration: uploaded.duration,
            size: asset.sizeBytes,
            videoUrl: asset.sourceUrl,
            clips: [],
          }],
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
        },
      });
      analysisJobs.push(analysisJob);
      void runPipelineJobNow(analysisJob.id);
    }
    const contextJob = await enqueuePipelineJob({
      projectId,
      kind: "highlight_context",
      input: {
        ...sharedInput,
        analysisJobIds: analysisJobs.map((job) => job.id),
        sourceAssetIds: selectedHighlights.map((asset) => asset.id),
      },
    });
    void runPipelineJobNow(contextJob.id);
    return NextResponse.json(
      {
        data: [...analysisJobs, contextJob],
        reused: [],
        storyContextSource: "selected_highlights",
        requestId,
      },
      { status: 202 },
    );
  }

  if (!reusesProjectStory || sharedArcs.length === 0) {
    const data = await enqueuePipelineJob({
      projectId,
      kind: reusesProjectStory ? "mine_arcs" : "analysis",
      input: {
        ...sharedInput,
        sourceAssetIds:
          originalSourceIds.length > 0
            ? originalSourceIds
            : selectedHighlights.map((asset) => asset.id),
        videoUrls:
          originalSourceIds.length > 0
            ? project.assets
                .slice(0, 30)
                .map((asset) => asset.sourceUrl)
            : selectedHighlights.map((asset) => asset.sourceUrl),
      },
    });
    void runPipelineJobNow(data.id);
    return NextResponse.json(
      {
        data,
        reused: reusesProjectStory ? ["analysis"] : [],
        storyContextSource: sharedInput.storyContextSource,
        requestId,
      },
      { status: 202 },
    );
  }

  const jobs = [];
  for (const [index, asset] of selectedHighlights.entries()) {
    const sourceHighlight = sharedWorkspace?.highlights.find(
      (highlight) =>
        highlight.id === asset.metadata.sourceHighlightId,
    );
    const arc =
      sharedArcs.find(
        (candidate) => candidate.id === sourceHighlight?.arcId,
      ) ?? sharedArcs[index % sharedArcs.length];
    await upsertHighlight(projectId, {
      id: `highlight-upload-${asset.id}`,
      arcId: arc.id,
      mode: "uploaded",
      status: "completed",
      result: {
        duration: uploadedHighlights[index].duration,
        videoUrls: [asset.sourceUrl],
        variants: [
          {
            index: 0,
            duration: uploadedHighlights[index].duration,
            size: asset.sizeBytes,
            videoUrl: asset.sourceUrl,
            clips: [],
          },
        ],
        storyboard: [],
      },
    }, sharedInput.runId);
    const data = await enqueuePipelineJob({
      projectId,
      kind: "transition",
      input: {
        arcId: arc.id,
        highlightId: `highlight-upload-${asset.id}`,
        ...sharedInput,
      },
    });
    jobs.push(data);
    void runPipelineJobNow(data.id);
  }
  return NextResponse.json(
    {
      data: jobs,
      reused: ["analysis", "arcs"],
      storyContextSource: "project_sources",
      requestId,
    },
    { status: 202 },
  );
}
