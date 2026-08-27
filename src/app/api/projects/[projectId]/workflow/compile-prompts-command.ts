import { NextResponse } from "next/server";

import {
  preparePromptCompilation,
  type CompilePromptsAction,
} from "./compile-prompts-preflight";
import { videoPromptSnapshot } from "./helpers";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
import { enqueuePipelineJob } from "@/lib/pipeline-store";
import { imageAssetReferenceUrl } from "@/lib/project-store";

export type { CompilePromptsAction } from "./compile-prompts-preflight";

export async function handleCompilePrompts(
  input: CompilePromptsAction,
  projectId: string,
  requestId: string,
) {
  const prepared = await preparePromptCompilation(
    input,
    projectId,
    requestId,
  );
  if (!prepared.ok) {
    return prepared.response;
  }
  const {
    scripts,
    pipeline,
    creativeSettings,
    characterMode,
    selections,
    assetsById,
  } = prepared;

  for (const script of scripts) {
    const settings = input.generationSettings?.find(
      (item) => item.scriptId === script.id,
    ) ?? {
      scriptId: script.id,
      targetDuration: Math.max(
        4,
        Math.round(script.aiSegmentSec ?? script.duration),
      ),
      videoModel:
        pipeline?.productionConfig?.videoModel ?? "default",
      videoResolution:
        pipeline?.productionConfig?.videoResolution ?? "720p",
      videoRatio:
        pipeline?.productionConfig?.videoRatio ?? "9:16",
      generateSubtitles:
        pipeline?.productionConfig?.generateSubtitles ?? false,
    };
    const scriptSelections = selections.filter(
      (item) => item.scriptId === script.id,
    );
    const job = await enqueuePipelineJob({
      projectId,
      kind: "preroll",
      input: {
        runId: pipeline?.currentRunId,
        scriptId: script.id,
        highlightId: script.highlightId,
        characterMode,
        videoModel: settings.videoModel,
        targetDuration: settings.targetDuration,
        videoResolution: settings.videoResolution,
        videoRatio: settings.videoRatio,
        generateSubtitles: settings.generateSubtitles,
        characterSelections: scriptSelections,
        referenceUrls: [
          ...new Set(
            scriptSelections
              .flatMap((item) => item.assetIds)
              .map((assetId) => {
                const asset = assetsById.get(assetId);
                if (!asset) {
                  return undefined;
                }
                return imageAssetReferenceUrl(asset);
              })
              .filter(
                (url: string | undefined): url is string => Boolean(url),
              ),
          ),
        ],
        videoPromptSystemPrompt: videoPromptSnapshot(
          creativeSettings,
          settings.generateSubtitles,
        ),
        prerollPhase: "compile_prompt",
        autoRun: false,
      },
    });
    void runPipelineJobNow(job.id);
  }

  return NextResponse.json({ data: scripts, requestId }, { status: 202 });
}
