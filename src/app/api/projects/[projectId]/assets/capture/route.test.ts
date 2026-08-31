import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  extractFrames: vi.fn(),
  getMediaTask: vi.fn(),
  createImageAsset: vi.fn(),
  getProject: vi.fn(),
  transferRemoteFileToTos: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  getCreativeProvider: () => ({
    extractFrames: mocks.extractFrames,
    getMediaTask: mocks.getMediaTask,
  }),
}));

vi.mock("@/lib/project-store", () => ({
  createImageAsset: mocks.createImageAsset,
  getProject: mocks.getProject,
}));

vi.mock("@/lib/authorization", () => ({
  authenticatedApiUser: async () => ({
    user: { id: "user-1", role: "user" },
    response: null,
  }),
  authorizedProject: (
    projectId: string,
  ) => mocks.getProject(projectId),
}));

vi.mock("@/lib/tos", () => ({
  transferRemoteFileToTos:
    mocks.transferRemoteFileToTos,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request(
    "http://localhost/api/projects/project-1/assets/capture",
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

describe("video frame capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue({
      id: "project-1",
      name: "短剧项目",
      assets: [{
        id: "source-1",
        sourceUrl:
          "https://example.com/episode.mp4",
      }],
    });
    mocks.extractFrames.mockResolvedValue({
      id: "frame-task-1",
      status: "queued",
    });
    mocks.getMediaTask.mockResolvedValue({
      id: "frame-task-1",
      status: "completed",
      result: {
        snapshots: [{
          image_url:
            "https://mediakit.test/frame.jpg",
        }],
      },
    });
    mocks.transferRemoteFileToTos.mockResolvedValue({
      objectKey: "project/图像资产/frame.jpg",
      sourceUrl:
        "https://tos.test/frame.jpg",
      sizeBytes: 2048,
    });
    mocks.createImageAsset.mockResolvedValue({
      id: "image-1",
    });
  });

  it("submits the selected video timestamp", async () => {
    const response = await POST(
      request({
        action: "start",
        sourceAssetId: "source-1",
        timestamp: 12.4867,
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.extractFrames).toHaveBeenCalledWith({
      videoUrl:
        "https://example.com/episode.mp4",
      timestamps: [12.487],
      clientToken:
        "capture-project-1-source-1-12.4867",
    });
  });

  it("persists a completed frame before registering it", async () => {
    const response = await POST(
      request({
        action: "complete",
        taskId: "frame-task-1",
        sourceAssetId: "source-1",
        timestamp: 12.487,
        characterName: "林晚",
        lookName: "医院造型",
        viewType: "front",
        isBaseline: true,
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(
      mocks.transferRemoteFileToTos,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteUrl:
          "https://mediakit.test/frame.jpg",
        stage: "character_images",
      }),
    );
    expect(
      mocks.createImageAsset,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        sourceUrl:
          "https://tos.test/frame.jpg",
        metadata: expect.objectContaining({
          characterName: "林晚",
          lookName: "医院造型",
          sourceType: "video_capture",
          intermediate: true,
          usableAsCharacterReference: false,
          sourceAssetId: "source-1",
          sourceTimestamp: 12.487,
          referenceType: "primary",
        }),
      }),
    );
  });

  it("accepts the MediaKit frame_urls result shape", async () => {
    mocks.getMediaTask.mockResolvedValue({
      id: "frame-task-1",
      status: "completed",
      result: {
        frame_urls: [
          "https://mediakit.test/frame-alt.jpg",
        ],
      },
    });

    const response = await POST(
      request({
        action: "complete",
        taskId: "frame-task-1",
        sourceAssetId: "source-1",
        timestamp: 8,
        characterName: "林晚",
        lookName: "日常造型",
        viewType: "front",
        isBaseline: false,
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(
      mocks.transferRemoteFileToTos,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteUrl:
          "https://mediakit.test/frame-alt.jpg",
      }),
    );
  });
});
