import { NextResponse } from "next/server";

import type { WorkflowAction } from "./schema";
import {
  createImageAsset,
  getImageAssetsByIds,
  listImageAssets,
} from "@/lib/project-store";
import {
  getPipelineProject,
  saveCharacterBindings,
  type CharacterBinding,
} from "@/lib/pipeline-store";
import { transferRemoteFileToTos } from "@/lib/tos";

export type SaveCharacterBindingsAction = Extract<
  WorkflowAction,
  { action: "save_character_bindings" }
>;

export async function handleSaveCharacterBindings(
  input: SaveCharacterBindingsAction,
  projectId: string,
  projectName: string,
  requestId: string,
) {
  const pipeline = await getPipelineProject(projectId);
  const knownAppearances = new Map(
    (pipeline?.characters ?? []).flatMap((character) =>
      character.appearances.map(
        (appearance) => [appearance.id, appearance] as const,
      ),
    ),
  );
  const characters: CharacterBinding[] = [];

  for (const character of input.characters) {
    const appearances = character.appearances.map((appearance) => {
      const known = knownAppearances.get(appearance.id);
      if (
        !known ||
        known.imageUrl !== appearance.imageUrl ||
        known.clipIndex !== appearance.clipIndex
      ) {
        throw new Error("人物画面不存在或不属于当前项目");
      }
      return appearance;
    });
    let referenceAssetIds = character.referenceAssetIds;
    const existingAssets = await getImageAssetsByIds(
      projectId,
      referenceAssetIds,
    );
    if (existingAssets.length !== new Set(referenceAssetIds).size) {
      throw new Error("人物图像资产不存在或不属于当前项目");
    }
    let confirmedAt = character.confirmedAt;

    if (character.status === "confirmed" && referenceAssetIds.length === 0) {
      const primary = appearances.find(
        (appearance) => appearance.id === character.primaryAppearanceId,
      );
      if (!primary) {
        throw new Error(`请为“${character.name}”选择标准参考图`);
      }
      const extension = primary.imageUrl.toLowerCase().includes(".png")
        ? "png"
        : "jpg";
      const stored = await transferRemoteFileToTos({
        remoteUrl: primary.imageUrl,
        projectId,
        projectName,
        stage: "character_images",
        fileName: `${character.id}-${character.name}.${extension}`,
      });
      const asset = await createImageAsset(projectId, {
        name: `${character.name}-标准参考图`,
        objectKey: stored.objectKey,
        sourceUrl: stored.sourceUrl,
        mimeType: extension === "png" ? "image/png" : "image/jpeg",
        sizeBytes: stored.sizeBytes ?? 0,
        metadata: {
          characterId: character.id,
          characterName: character.name,
          sourceClipIndex: primary.clipIndex,
          sourceVideoIndex: primary.sourceVideoIndex,
          sourceTimestamp: primary.timestamp,
          referenceType: "primary",
        },
      });
      if (!asset) {
        throw new Error("人物图像资产保存失败");
      }
      referenceAssetIds = [asset.id];
      confirmedAt = new Date().toISOString();
    }

    characters.push({
      ...character,
      appearances,
      referenceAssetIds,
      confirmedAt,
      updatedAt: new Date().toISOString(),
    });
  }

  const data = await saveCharacterBindings(projectId, characters);
  return NextResponse.json({
    data,
    imageAssets: await listImageAssets(projectId),
    requestId,
  });
}
