import { NextResponse } from "next/server";

import {
  preparePrerollGeneration,
  type GeneratePrerollsAction,
} from "./preroll-preflight";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
import { enqueuePipelineJob } from "@/lib/pipeline-store";
import type { ProductionConfig } from "@/lib/production-config";
import { imageAssetReferenceUrl } from "@/lib/project-store";

export type { GeneratePrerollsAction } from "./preroll-preflight";

export async function handleGeneratePrerolls(
  input: GeneratePrerollsAction,
  projectId: string,
  requestId: string,
) {
  const prepared = await preparePrerollGeneration(
    input,
    projectId,
    requestId,
  );
  if (!prepared.ok) {
    return prepared.response;
  }

  const {
    pipeline,
    scripts,
    characterMode,
    selections,
    assetsById,
  } = prepared;
  const createdJobs = [];
  for (const script of scripts) {
    const plan = script.videoPromptPlan!;
    const videoModel =
      (plan.targetModel as ProductionConfig["videoModel"]) ??
      pipeline.productionConfig?.videoModel ??
      "default";
    const videoResolution =
      (plan.resolution?.toLowerCase() as
        ProductionConfig["videoResolution"]) ??
      pipeline.productionConfig?.videoResolution ??
      "720p";
    const videoRatio =
      (plan.aspectRatio as ProductionConfig["videoRatio"]) ??
      pipeline.productionConfig?.videoRatio ??
      "9:16";
    const renderId = `render-${script.id}-${crypto.randomUUID()}`;
    const scriptSelections = selections.filter(
      (selection) => selection.scriptId === script.id,
    );
    const selectedReferenceUrls = scriptSelections
      .flatMap((selection) => selection.assetIds)
      .map((assetId) => {
        const asset = assetsById.get(assetId);
        if (!asset) {
          return undefined;
        }
        return imageAssetReferenceUrl(asset);
      })
      .filter((url): url is string => Boolean(url));
    const job = await enqueuePipelineJob({
      projectId,
      kind: "preroll",
      input: {
        runId: pipeline.currentRunId,
        scriptId: script.id,
        highlightId: script.highlightId,
        renderId,
        verificationRequired: true,
        characterMode:
          characterMode === "drama_character" &&
          scriptSelections.length > 0 &&
          scriptSelections.every(
            (selection) => selection.useTextToVideo === true,
          )
            ? "text_to_video"
            : characterMode,
        videoModel,
        targetDuration:
          plan.targetDuration ??
          plan.segments.reduce(
            (total, segment) => total + segment.duration,
            0,
          ),
        videoResolution,
        videoRatio,
        generateSubtitles: plan.generateSubtitles ?? false,
        referenceUrls:
          characterMode === "drama_character"
            ? [...new Set(selectedReferenceUrls)]
            : [
                ...new Set(
                  script.videoPromptPlan?.segments.flatMap(
                    (segment) => segment.referenceAssets,
                  ) ?? [],
                ),
              ],
        prerollPhase: "segments",
        autoRun: true,
      },
    });
    createdJobs.push(job);
    void runPipelineJobNow(job.id);
  }

  return NextResponse.json(
    { data: scripts, jobs: createdJobs, requestId },
    { status: 202 },
  );
}
