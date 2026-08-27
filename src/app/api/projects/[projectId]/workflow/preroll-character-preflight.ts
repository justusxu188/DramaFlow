import { NextResponse } from "next/server";

import type { WorkflowAction } from "./schema";
import { getImageAssetsByIds } from "@/lib/project-store";
import type { getPipelineProject } from "@/lib/pipeline-store";

type Pipeline = NonNullable<
  Awaited<ReturnType<typeof getPipelineProject>>
>;
type GeneratePrerollsAction = Extract<
  WorkflowAction,
  { action: "generate_prerolls" }
>;

export async function preparePrerollCharacters(
  projectId: string,
  requestId: string,
  pipeline: Pipeline,
  scripts: Pipeline["scripts"],
  selections: NonNullable<
    GeneratePrerollsAction["characterSelections"]
  >,
) {
  const characterMode =
    pipeline.productionConfig?.characterMode ?? "text_to_video";
  const selectedAssetIds = [
    ...new Set(selections.flatMap((selection) => selection.assetIds)),
  ];
  const selectedAssets = await getImageAssetsByIds(
    projectId,
    selectedAssetIds,
  );
  if (selectedAssets.length !== selectedAssetIds.length) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "所选人物图片不存在或不属于当前项目", requestId },
        { status: 400 },
      ),
    };
  }
  const unavailableAvatar = selectedAssets.find(
    (asset) =>
      asset.metadata.avatarAssetId &&
      asset.metadata.avatarStatus !== "active",
  );
  if (unavailableAvatar) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            `虚拟人像“${unavailableAvatar.name}”尚不可用：` +
            (unavailableAvatar.metadata.avatarError ||
              (unavailableAvatar.metadata.avatarStatus === "processing"
                ? "素材仍在处理中，请刷新状态后重试"
                : "素材处理失败")),
          requestId,
        },
        { status: 409 },
      ),
    };
  }

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
              error: `“${script.title}”还未关联人物图片：${missing.join("、")}`,
              requestId,
            },
            { status: 409 },
          ),
        };
      }
    }
  }

  return {
    ok: true as const,
    characterMode,
    selections,
    assetsById: new Map(
      selectedAssets.map((asset) => [asset.id, asset]),
    ),
  };
}
