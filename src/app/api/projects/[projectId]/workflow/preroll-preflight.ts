import { NextResponse } from "next/server";

import { videoPromptSnapshot } from "./helpers";
import { preparePrerollCharacters } from "./preroll-character-preflight";
import type { WorkflowAction } from "./schema";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import {
  videoGenerationSegmentLimit,
  videoModels,
} from "@/lib/production-config";
import {
  activatePipelineRun,
  getPipelineProject,
  videoPromptMatchesScript,
  videoPromptSystemPromptHash,
} from "@/lib/pipeline-store";

export type GeneratePrerollsAction = Extract<
  WorkflowAction,
  { action: "generate_prerolls" }
>;

export async function preparePrerollGeneration(
  input: GeneratePrerollsAction,
  projectId: string,
  requestId: string,
) {
  await activatePipelineRun(projectId, input.workflowEntry);
  const pipeline = await getPipelineProject(projectId);
  const scripts =
    pipeline?.scripts.filter((script) =>
      input.scriptIds.includes(script.id),
    ) ?? [];
  if (!pipeline || scripts.length !== new Set(input.scriptIds).size) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "所选前贴脚本不存在", requestId },
        { status: 404 },
      ),
    };
  }
  const invalid = scripts.find(
    (script) =>
      script.reviewStatus !== "confirmed" ||
      script.videoPromptStatus !== "ready" ||
      !script.videoPromptPlan ||
      script.videoPromptPlan.reviewStatus !== "confirmed",
  );
  if (invalid) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "请先确认脚本并完成当前脚本的生视频提示词编译",
          requestId,
        },
        { status: 409 },
      ),
    };
  }

  const creativeSettings = await getCreativeSettings();
  const outdatedPrompt = scripts.find(
    (script) => {
      const generateSubtitles =
        script.videoPromptPlan?.generateSubtitles ?? false;
      const currentVideoPromptHash = videoPromptSystemPromptHash(
        videoPromptSnapshot(
          creativeSettings,
          generateSubtitles,
        ),
      );
      return !videoPromptMatchesScript(
        script,
        generateSubtitles,
        currentVideoPromptHash,
      );
    },
  );
  if (outdatedPrompt) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            `“${outdatedPrompt.title}”的生视频提示词与当前字幕模式或 System Prompt 版本不一致，` +
            "请先重新生成生视频提示词",
          requestId,
        },
        { status: 409 },
      ),
    };
  }

  const incompatible = scripts.find((script) => {
    const plan = script.videoPromptPlan;
    const fallbackModel =
      pipeline.productionConfig?.videoModel ?? "default";
    const videoModel = videoModels.includes(
      plan?.targetModel as (typeof videoModels)[number],
    )
      ? plan!.targetModel as (typeof videoModels)[number]
      : fallbackModel;
    const maxClipDurationSec =
      videoGenerationSegmentLimit(videoModel);
    const targetDuration =
      plan?.targetDuration ??
      plan?.segments.reduce(
        (total, segment) => total + segment.duration,
        0,
      ) ??
      0;
    return (
      !plan ||
      plan.maxClipDurationSec !== maxClipDurationSec ||
      plan.segments.length === 0 ||
      plan.segments.some(
        (segment) =>
          segment.duration < 4 ||
          segment.duration > maxClipDurationSec ||
          !segment.submittedPrompt?.trim(),
      ) ||
      plan.segments.reduce(
        (total, segment) => total + segment.duration,
        0,
      ) !== targetDuration
    );
  });
  if (incompatible) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            `“${incompatible.title}”的生视频提示词与当前模型时长上限不一致，` +
            "请重新生成生视频提示词",
          requestId,
        },
        { status: 409 },
      ),
    };
  }

  const selections =
    input.characterSelections?.length
      ? input.characterSelections
      : scripts.flatMap((script) =>
          (
            script.videoPromptPlan?.referenceBindings ?? []
          ).map((binding) => ({
            scriptId: script.id,
            characterName: binding.characterName,
            assetIds: binding.assetIds,
            useTextToVideo: binding.useTextToVideo,
          })),
        );
  const characters = await preparePrerollCharacters(
    projectId,
    requestId,
    pipeline,
    scripts,
    selections,
  );
  if (!characters.ok) {
    return characters;
  }

  return {
    pipeline,
    scripts,
    ...characters,
  };
}
