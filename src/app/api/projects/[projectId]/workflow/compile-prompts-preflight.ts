import { NextResponse } from "next/server";

import type { WorkflowAction } from "./schema";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import { videoGenerationSegmentLimit } from "@/lib/production-config";
import { getImageAssetsByIds } from "@/lib/project-store";
import {
  activatePipelineRun,
  getPipelineProject,
} from "@/lib/pipeline-store";
import { planVideoSegments } from "@/lib/video-shot-segmentation";

export type CompilePromptsAction = Extract<
  WorkflowAction,
  { action: "compile_video_prompts" }
>;

export async function preparePromptCompilation(
  input: CompilePromptsAction,
  projectId: string,
  requestId: string,
) {
  await activatePipelineRun(projectId, input.workflowEntry);
  const scripts =
    (await getPipelineProject(projectId))?.scripts.filter(
      (script) =>
        input.scriptIds.includes(script.id) &&
        script.reviewStatus === "confirmed",
    ) ?? [];
  if (scripts.length !== new Set(input.scriptIds).size) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "仅已确认脚本可以重新生成生视频提示词",
          requestId,
        },
        { status: 409 },
      ),
    };
  }
  {
    const settings = input.generationSettings ?? [];
    if (
      settings.length > 0 &&
      (
        settings.length !== scripts.length ||
        scripts.some(
          (script) =>
            !settings.some(
              (item) => item.scriptId === script.id,
            ),
        )
      )
    ) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "视频生成设置与所选脚本不一致", requestId },
          { status: 400 },
        ),
      };
    }
    try {
      for (const script of scripts) {
        const item = settings.find(
          (candidate) => candidate.scriptId === script.id,
        );
        if (!item) continue;
        planVideoSegments(
          script.shots.filter(
            (shot) =>
              shot.segmentType !== "original_footage",
          ),
          item.targetDuration,
          videoGenerationSegmentLimit(item.videoModel),
        );
      }
    } catch (error) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "脚本镜头无法按当前模型分段",
            requestId,
          },
          { status: 409 },
        ),
      };
    }
  }

  const pipeline = await getPipelineProject(projectId);
  const creativeSettings = await getCreativeSettings();
  const characterMode =
    pipeline?.productionConfig?.characterMode ?? "text_to_video";
  const selections = input.characterSelections ?? [];

  if (characterMode === "drama_character") {
    for (const script of scripts) {
      const characterNames = [
        ...new Set(
          script.shots.flatMap((shot) => shot.characters ?? []),
        ),
      ].filter(Boolean);
      const missing = characterNames.filter((name) => {
        const selection = selections.find(
          (item) =>
            item.scriptId === script.id && item.characterName === name,
        );
        return (
          !selection ||
          (selection.useTextToVideo !== true &&
            selection.assetIds.length === 0)
        );
      });
      if (missing.length) {
        return {
          ok: false as const,
          response: NextResponse.json(
            {
              error:
                `“${script.title}”还未关联人物图片：${missing.join("、")}，` +
                "请先选择人物形象再生成视频提示词",
              requestId,
            },
            { status: 409 },
          ),
        };
      }
    }
  }

  const selectedAssetIds = [
    ...new Set(selections.flatMap((item) => item.assetIds)),
  ];
  let selectedAssets: Awaited<ReturnType<typeof getImageAssetsByIds>> = [];
  if (selectedAssetIds.length > 0) {
    selectedAssets = await getImageAssetsByIds(projectId, selectedAssetIds);
    if (selectedAssets.length !== selectedAssetIds.length) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "所选人物图片不存在或不属于当前项目", requestId },
          { status: 400 },
        ),
      };
    }
  }

  return {
    ok: true as const,
    scripts,
    pipeline,
    creativeSettings,
    characterMode,
    selections,
    assetsById: new Map(
      selectedAssets.map((asset) => [asset.id, asset]),
    ),
  };
}
