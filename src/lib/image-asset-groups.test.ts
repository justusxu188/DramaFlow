import { describe, expect, it } from "vitest";
import {
  groupImageAssetsByIdentity,
  imageAssetIdentityKey,
} from "./image-asset-groups";
import type { ImageAsset } from "./project-store";

function image(
  id: string,
  characterName: string,
  metadata: Partial<ImageAsset["metadata"]> = {},
): ImageAsset {
  return {
    id,
    projectId: "project-1",
    kind: "character_image",
    folder: "图像资产",
    name: `${characterName}-妆照`,
    objectKey: `${id}.jpg`,
    sourceUrl: `https://example.com/${id}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 100,
    uploadStatus: "completed",
    metadata: {
      characterName,
      ...metadata,
    },
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

describe("image asset identity groups", () => {
  it("keeps differently named looks from one baseline together", () => {
    const baseline = image("baseline-1", "林夏", {
      characterId: "character-1",
      isBaseline: true,
    });
    const redraw = image("generated-1", "重绘-林夏", {
      characterId: "character-1",
      sourceAssetId: "baseline-1",
      sourceType: "seedream",
    });

    const groups = groupImageAssetsByIdentity([
      baseline,
      redraw,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0][1].characterName).toBe("林夏");
    expect(groups[0][1].assets).toHaveLength(2);
  });

  it("uses the baseline reference before legacy names", () => {
    expect(
      imageAssetIdentityKey(
        image("generated-1", "另一个名称", {
          sourceAssetId: "baseline-1",
        }),
      ),
    ).toBe("asset:baseline-1");
    expect(
      imageAssetIdentityKey(
        image("legacy-1", "重绘-林夏"),
      ),
    ).toBe("legacy:林夏");
  });

  it("merges historical generated assets that used the baseline id as character id", () => {
    const baseline = image("baseline-1", "林夏", {
      isBaseline: true,
    });
    const generated = image("generated-1", "不同名字", {
      characterId: "baseline-1",
      sourceAssetId: "baseline-1",
      sourceType: "seedream",
    });

    const groups = groupImageAssetsByIdentity([
      baseline,
      generated,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0][1].assets).toHaveLength(2);
  });

  it("keeps renamed assets in their existing character group", () => {
    const baseline = image("baseline-1", "林夏", {
      characterId: "character-1",
      isBaseline: true,
    });
    const generated = image("generated-1", "重绘-林夏", {
      characterId: "character-1",
      sourceAssetId: "baseline-1",
      sourceType: "seedream",
    });
    generated.name = "用户修改后的图片名";

    const groups = groupImageAssetsByIdentity([
      baseline,
      generated,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0][1].assets).toHaveLength(2);
  });

  it("merges historical same-name images without identity metadata", () => {
    const baseline = image("baseline-1", "林夏", {
      isBaseline: true,
    });
    const generated = image("generated-1", "林夏", {
      sourceType: "seedream",
    });

    const groups = groupImageAssetsByIdentity([
      baseline,
      generated,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0][1].assets).toHaveLength(2);
  });
});
