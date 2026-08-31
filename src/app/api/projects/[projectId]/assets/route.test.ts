import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  createCuratedVideoAsset: vi.fn(),
  createHighlightAsset: vi.fn(),
  createImageAsset: vi.fn(),
  createSourceAsset: vi.fn(),
  deleteProjectAsset: vi.fn(),
  deleteArkAsset: vi.fn(),
  getArkProjectName: vi.fn(),
  getImageAssetsByIdsIncludingIntermediate: vi.fn(),
  listSourceAssets: vi.fn(),
  updateImageAssetName: vi.fn(),
  updateSourceAssetDuration: vi.fn(),
  listPipelineRuns: vi.fn(),
}));

vi.mock("@/lib/project-store", () => ({
  createCuratedVideoAsset:
    mocks.createCuratedVideoAsset,
  createHighlightAsset:
    mocks.createHighlightAsset,
  createImageAsset: mocks.createImageAsset,
  createSourceAsset: mocks.createSourceAsset,
  deleteProjectAsset:
    mocks.deleteProjectAsset,
  getImageAssetsByIdsIncludingIntermediate:
    mocks.getImageAssetsByIdsIncludingIntermediate,
  listSourceAssets: mocks.listSourceAssets,
  updateImageAssetName:
    mocks.updateImageAssetName,
  updateSourceAssetDuration:
    mocks.updateSourceAssetDuration,
}));

vi.mock("@/lib/authorization", () => ({
  authenticatedApiUser: async () => ({
    user: { id: "user-1", role: "user" },
    response: null,
  }),
  authorizedProject: async () => ({ id: "project-1" }),
}));

vi.mock("@/lib/ark-assets", () => ({
  getArkAssetsClient: () => ({
    deleteAsset: mocks.deleteArkAsset,
    getProjectName: mocks.getArkProjectName,
  }),
}));

vi.mock("@/lib/pipeline-store", () => ({
  listPipelineRuns: mocks.listPipelineRuns,
}));

import { DELETE, PATCH, POST } from "./route";

function request(body: unknown) {
  return new Request(
    "http://localhost/api/projects/project-1/assets",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

const context = {
  params: Promise.resolve({
    projectId: "project-1",
  }),
};

describe("project asset registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createImageAsset.mockResolvedValue({
      id: "image-1",
    });
    mocks.createHighlightAsset.mockResolvedValue({
      id: "highlight-1",
    });
    mocks.createCuratedVideoAsset.mockResolvedValue({
      id: "curated-1",
    });
    mocks.getImageAssetsByIdsIncludingIntermediate
      .mockResolvedValue([]);
    mocks.getArkProjectName.mockReturnValue("default");
    mocks.listPipelineRuns.mockResolvedValue([]);
  });

  it("stores uploaded character and appearance metadata", async () => {
    const response = await POST(
      request({
        assetType: "character_image",
        name: "林晚-医院造型",
        objectKey: "project/images/linwan.jpg",
        sourceUrl:
          "https://example.com/linwan.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        characterName: "林晚",
        lookName: "医院造型",
        viewType: "front",
        isBaseline: true,
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(
      mocks.createImageAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        metadata: {
          characterId: expect.stringMatching(
            /^character-/,
          ),
          characterName: "林晚",
          lookName: "医院造型",
          sourceType: "upload",
          usableAsCharacterReference: true,
          viewType: "front",
          isBaseline: true,
          referenceType: "primary",
        },
      }),
    );
  });

  it("marks uploaded highlights as user assets", async () => {
    const response = await POST(
      request({
        assetType: "highlight",
        name: "身份揭露高光",
        objectKey:
          "project/highlights/reveal.mp4",
        sourceUrl:
          "https://example.com/reveal.mp4",
        mimeType: "video/mp4",
        sizeBytes: 4096,
        durationMs: 90000,
        sourceAssetId: "source-1",
        summary: "女主当众揭露身份",
        characterNames: ["林晚"],
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(
      mocks.createHighlightAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        durationMs: 90000,
        metadata: {
          sourceType: "user",
          sourceAssetId: "source-1",
          summary: "女主当众揭露身份",
          characterNames: ["林晚"],
        },
      }),
    );
  });

  it("renames a project image asset", async () => {
    mocks.updateImageAssetName.mockResolvedValue(true);

    const response = await PATCH(
      request({
        action: "rename_image",
        assetId: "image-1",
        name: "林晚正面全身照",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(
      mocks.updateImageAssetName,
    ).toHaveBeenCalledWith(
      "project-1",
      "image-1",
      "林晚正面全身照",
    );
  });

  it("promotes a completed preroll into the curated library", async () => {
    mocks.listPipelineRuns.mockResolvedValue([
      {
        id: "run-1",
        scripts: [
          {
            id: "script-1",
            title: "身份揭露前贴",
            duration: 15,
          },
        ],
        renders: [
          {
            id: "render-1",
            scriptId: "script-1",
            status: "completed",
            videoUrl:
              "https://example.com/preroll.mp4",
          },
        ],
        compositions: [],
      },
    ]);

    const response = await POST(
      request({
        action: "curate_pipeline_video",
        runId: "run-1",
        artifactType: "preroll",
        artifactId: "render-1",
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(
      mocks.createCuratedVideoAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        kind: "preroll_video",
        name: "身份揭露前贴",
        sourceUrl:
          "https://example.com/preroll.mp4",
        metadata: {
          sourceType: "curated",
          sourceRunId: "run-1",
          sourceArtifactId: "render-1",
          sourceScriptId: "script-1",
          promptTitle: "身份揭露前贴",
        },
      }),
    );
  });

  it("promotes a MediaKit highlight into the highlight library", async () => {
    mocks.listPipelineRuns.mockResolvedValue([
      {
        id: "run-1",
        scripts: [],
        renders: [],
        compositions: [],
        highlights: [{
          id: "highlight-1",
          result: {
            videoUrls: [
              "https://example.com/highlight-a.mp4",
              "https://example.com/highlight-b.mp4",
            ],
            variants: [
              { duration: 15 },
              { duration: 20 },
            ],
          },
        }],
      },
    ]);

    const response = await POST(
      request({
        action: "curate_pipeline_video",
        runId: "run-1",
        artifactType: "highlight",
        artifactId: "highlight-1",
        artifactIndex: 1,
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(
      mocks.createHighlightAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        sourceUrl:
          "https://example.com/highlight-b.mp4",
        durationMs: 20000,
        metadata: {
          sourceType: "mediakit",
          sourceRunId: "run-1",
          sourceHighlightId: "highlight-1",
          sourceArtifactId: "highlight-1:1",
        },
      }),
    );
  });

  it("does not copy the preroll script duration onto a curated final video", async () => {
    mocks.listPipelineRuns.mockResolvedValue([
      {
        id: "run-1",
        scripts: [
          {
            id: "script-1",
            title: "身份揭露前贴",
            duration: 15,
          },
        ],
        renders: [
          {
            id: "render-1",
            scriptId: "script-1",
            status: "completed",
            videoUrl:
              "https://example.com/preroll.mp4",
          },
        ],
        compositions: [
          {
            id: "composition-1",
            renderId: "render-1",
            status: "completed",
            videoUrl:
              "https://example.com/final.mp4",
          },
        ],
      },
    ]);

    const response = await POST(
      request({
        action: "curate_pipeline_video",
        runId: "run-1",
        artifactType: "final",
        artifactId: "composition-1",
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(
      mocks.createCuratedVideoAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        kind: "final_video",
        sourceUrl:
          "https://example.com/final.mp4",
        durationMs: null,
      }),
    );
  });

  it("rejects an unfinished pipeline video", async () => {
    mocks.listPipelineRuns.mockResolvedValue([
      {
        id: "run-1",
        scripts: [],
        renders: [
          {
            id: "render-1",
            status: "running",
          },
        ],
        compositions: [],
      },
    ]);

    const response = await POST(
      request({
        action: "curate_pipeline_video",
        runId: "run-1",
        artifactType: "preroll",
        artifactId: "render-1",
      }),
      context,
    );

    expect(response.status).toBe(404);
    expect(
      mocks.createCuratedVideoAsset,
    ).not.toHaveBeenCalled();
  });

  it("deletes a project-scoped source asset", async () => {
    mocks.deleteProjectAsset.mockResolvedValue(true);

    const response = await DELETE(
      request({
        assetId: "source-1",
        assetType: "source",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(
      mocks.deleteProjectAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      "source-1",
      "source",
    );
  });

  it("returns 404 when the asset cannot be deleted", async () => {
    mocks.deleteProjectAsset.mockResolvedValue(false);

    const response = await DELETE(
      request({
        assetId: "image-1",
        assetType: "character_image",
      }),
      context,
    );

    expect(response.status).toBe(404);
  });

  it("deletes the linked Ark avatar before deleting its local image", async () => {
    mocks.getImageAssetsByIdsIncludingIntermediate.mockResolvedValue([
      {
        id: "image-1",
        metadata: {
          avatarAssetId: "avatar-1",
          avatarProjectName: "default",
        },
      },
    ]);
    mocks.deleteArkAsset.mockResolvedValue(undefined);
    mocks.deleteProjectAsset.mockResolvedValue(true);

    const response = await DELETE(
      request({
        assetId: "image-1",
        assetType: "character_image",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteArkAsset).toHaveBeenCalledWith(
      "avatar-1",
    );
    expect(
      mocks.deleteArkAsset.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.deleteProjectAsset.mock.invocationCallOrder[0],
    );
  });

  it("keeps the local image when Ark avatar deletion fails", async () => {
    mocks.getImageAssetsByIdsIncludingIntermediate.mockResolvedValue([
      {
        id: "image-1",
        metadata: {
          avatarAssetId: "avatar-1",
          avatarProjectName: "default",
        },
      },
    ]);
    mocks.deleteArkAsset.mockRejectedValue(
      new Error("remote delete failed"),
    );

    const response = await DELETE(
      request({
        assetId: "image-1",
        assetType: "character_image",
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.deleteProjectAsset).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("本地图片已保留"),
    });
  });
});
