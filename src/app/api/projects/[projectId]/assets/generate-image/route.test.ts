import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  createImageAsset: vi.fn(),
  getImageAssetsByIdsIncludingIntermediate: vi.fn(),
  getProject: vi.fn(),
  transferRemoteFileToTos: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  getCreativeProvider: () => ({
    generateImage: mocks.generateImage,
  }),
}));

vi.mock("@/lib/project-store", () => ({
  createImageAsset: mocks.createImageAsset,
  getImageAssetsByIdsIncludingIntermediate:
    mocks.getImageAssetsByIdsIncludingIntermediate,
  getProject: mocks.getProject,
}));

vi.mock("@/lib/tos", () => ({
  transferRemoteFileToTos:
    mocks.transferRemoteFileToTos,
}));

import { POST } from "./route";

describe("Seedream character look generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue({
      id: "project-1",
      name: "短剧项目",
    });
    mocks.getImageAssetsByIdsIncludingIntermediate.mockResolvedValue([
      {
        id: "baseline-1",
        sourceUrl:
          "https://tos.test/baseline.jpg",
        metadata: {
          characterId: "character-1",
          characterName: "林晚",
        },
      },
    ]);
    mocks.generateImage.mockResolvedValue({
      urls: [
        "https://seedream.test/look.jpg",
      ],
      size: "2048x2048",
    });
    mocks.transferRemoteFileToTos.mockResolvedValue({
      objectKey:
        "project/图像资产/linwan-look.jpg",
      sourceUrl:
        "https://tos.test/linwan-look.jpg",
      sizeBytes: 4096,
    });
    mocks.createImageAsset.mockResolvedValue({
      id: "image-2",
    });
  });

  it("uses the baseline and selected Seedream model, then persists the result", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/assets/generate-image",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            baselineAssetId: "baseline-1",
            characterName: "林晚",
            lookName: "晚宴造型",
            prompt:
              "黑色礼服，正面半身，写实棚拍",
            model: "seedream_5_0_pro",
            viewType: "half_body",
            aspectRatio: "16:9",
          }),
        },
      ),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceUrls: [
          "https://tos.test/baseline.jpg",
        ],
        model: "seedream_5_0_pro",
        size: "2048x1152",
      }),
    );
    expect(
      mocks.transferRemoteFileToTos,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteUrl:
          "https://seedream.test/look.jpg",
        stage: "character_images",
      }),
    );
    expect(
      mocks.createImageAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        sourceUrl:
          "https://tos.test/linwan-look.jpg",
        metadata: expect.objectContaining({
          characterId: "character-1",
          characterName: "林晚",
          lookName: "晚宴造型",
          sourceType: "seedream",
          usableAsCharacterReference: true,
          seedreamModel:
            "seedream_5_0_pro",
          aspectRatio: "16:9",
          imageSize: "2048x1152",
          sourceAssetId: "baseline-1",
          referenceType: "appearance",
        }),
      }),
    );
  });

  it("generates from text without sending a reference image", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/assets/generate-image",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            characterName: "新角色",
            lookName: "都市造型",
            prompt: "黑色西装，正面全身，写实棚拍",
            model: "seedream_5_0_lite",
            viewType: "full_body",
            aspectRatio: "9:16",
          }),
        },
      ),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(
      mocks.getImageAssetsByIdsIncludingIntermediate,
    ).not.toHaveBeenCalled();
    expect(mocks.generateImage).toHaveBeenCalledWith({
      prompt:
        "角色：新角色。妆造：都市造型。黑色西装，正面全身，写实棚拍",
      size: "2304x4096",
      model: "seedream_5_0_lite",
    });
    expect(
      mocks.createImageAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        name: "新角色-都市造型-文生图",
        metadata: expect.objectContaining({
          characterId: undefined,
          sourceType: "seedream_text",
          usableAsCharacterReference: true,
          aspectRatio: "9:16",
          imageSize: "2304x4096",
        }),
      }),
    );
  });

  it("turns a hidden video capture into a selectable character image", async () => {
    mocks.getImageAssetsByIdsIncludingIntermediate.mockResolvedValueOnce([
      {
        id: "capture-1",
        sourceUrl: "https://tos.test/capture.jpg",
        metadata: {
          characterId: "character-1",
          characterName: "林晚",
          sourceType: "video_capture",
          intermediate: true,
          sourceAssetId: "source-1",
          sourceTimestamp: 12.487,
        },
      },
    ]);

    const response = await POST(
      new Request(
        "http://localhost/api/projects/project-1/assets/generate-image",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            baselineAssetId: "capture-1",
            generationMode: "capture_to_image",
            characterName: "林晚",
            lookName: "医院造型",
            prompt: "正面全身角色图",
            model: "seedream_5_0_pro",
            viewType: "full_body",
            aspectRatio: "9:16",
            isBaseline: true,
          }),
        },
      ),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceUrls: [
          "https://tos.test/capture.jpg",
        ],
        prompt: expect.stringContaining(
          "完整移除背景、其他人物、字幕、水印",
        ),
      }),
    );
    expect(mocks.createImageAsset).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        name: "林晚-医院造型-截帧生图",
        metadata: expect.objectContaining({
          sourceType: "seedream_from_capture",
          usableAsCharacterReference: true,
          sourceCaptureAssetId: "capture-1",
          sourceAssetId: "source-1",
          sourceTimestamp: 12.487,
          isBaseline: true,
        }),
      }),
    );
  });
});
