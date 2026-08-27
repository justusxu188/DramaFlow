import { NextResponse } from "next/server";

import type { WorkflowAction } from "./schema";
import {
  activatePipelineRun,
  getPipelineProject,
  saveEditedVideoPrompt,
} from "@/lib/pipeline-store";
import {
  getImageAssetsByIds,
  imageAssetReferenceUrl,
} from "@/lib/project-store";
import { videoGenerationSegmentLimit } from "@/lib/production-config";

type UpdateVideoPromptAction = Extract<
  WorkflowAction,
  { action: "update_video_prompt" }
>;

export async function handleUpdateVideoPrompt(
  input: UpdateVideoPromptAction,
  projectId: string,
  requestId: string,
) {
  await activatePipelineRun(projectId, input.workflowEntry);
  const pipeline = await getPipelineProject(projectId);
  const script = pipeline?.scripts.find(
    (item) => item.id === input.scriptId,
  );
  if (
    !pipeline ||
    !script ||
    script.reviewStatus !== "confirmed"
  ) {
    return NextResponse.json(
      { error: "仅已确认脚本可以保存生视频提示词", requestId },
      { status: 409 },
    );
  }
  if (!script.videoPromptPlan) {
    return NextResponse.json(
      { error: "请先生成生视频提示词", requestId },
      { status: 409 },
    );
  }
  const generationSettings = input.generationSettings;
  if (generationSettings) {
    const plan = script.videoPromptPlan;
    const currentTargetDuration =
      plan.targetDuration ??
      plan.segments.reduce(
        (total, segment) => total + segment.duration,
        0,
      );
    if (
      generationSettings.targetDuration !==
        currentTargetDuration ||
      generationSettings.generateSubtitles !==
        (plan.generateSubtitles ??
          pipeline.productionConfig?.generateSubtitles ??
          false)
    ) {
      return NextResponse.json(
        {
          error:
            "总时长或字幕模式变化后需要重新生成视频提示词",
          requestId,
        },
        { status: 409 },
      );
    }
    const segmentLimit = videoGenerationSegmentLimit(
      generationSettings.videoModel,
    );
    if (
      plan.segments.some(
        (segment) => segment.duration > segmentLimit,
      )
    ) {
      return NextResponse.json(
        {
          error: `当前提示词包含超过 ${segmentLimit} 秒的分段，请重新生成视频提示词`,
          requestId,
        },
        { status: 409 },
      );
    }
  }

  const selections = input.characterSelections ?? [];
  if (
    selections.some(
      (selection) => selection.scriptId !== script.id,
    )
  ) {
    return NextResponse.json(
      { error: "人物资产绑定与当前脚本不一致", requestId },
      { status: 400 },
    );
  }
  const assetIds = [
    ...new Set(
      selections.flatMap((selection) => selection.assetIds),
    ),
  ];
  const assets = assetIds.length
    ? await getImageAssetsByIds(projectId, assetIds)
    : [];
  if (assets.length !== assetIds.length) {
    return NextResponse.json(
      { error: "所选人物图片不存在或不属于当前项目", requestId },
      { status: 400 },
    );
  }
  const assetsById = new Map(
    assets.map((asset) => [asset.id, asset]),
  );
  const referenceUrls = assetIds.map((assetId) => {
    const asset = assetsById.get(assetId)!;
    return imageAssetReferenceUrl(asset);
  });

  const saved = await saveEditedVideoPrompt(
    projectId,
    script.id,
    {
      segments: input.segments,
      referenceBindings: selections.map((selection) => ({
        characterName: selection.characterName,
        assetIds: selection.assetIds,
        useTextToVideo: selection.useTextToVideo,
      })),
      referenceUrls,
      generationSettings,
    },
  );
  return NextResponse.json({ data: saved, requestId });
}
