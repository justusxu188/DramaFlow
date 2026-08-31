import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  activateRenderRevision: vi.fn(),
  addSubtitlesToVideo: vi.fn(),
  adjustVideoSpeed: vi.fn(),
  concatVideos: vi.fn(),
  createAsrSubtitles: vi.fn(),
  createCuratedVideoAsset: vi.fn(),
  createHighlightAsset: vi.fn(),
  createSourceAsset: vi.fn(),
  enhanceVideo: vi.fn(),
  enqueuePipelineJob: vi.fn(),
  eraseVideoSubtitles: vi.fn(),
  getMediaTask: vi.fn(),
  getPipelineProject: vi.fn(),
  getProject: vi.fn(),
  listPipelineJobs: vi.fn(),
  runPipelineJobNow: vi.fn(),
  transferRemoteFileToTos: vi.fn(),
  trimVideo: vi.fn(),
  upsertComposition: vi.fn(),
  vodGetTask: vi.fn(),
  vodStart: vi.fn(),
  verifyBurnedSubtitles: vi.fn(),
}));

vi.mock("@/lib/providers/mediakit", () => ({
  MediaKitProvider: class {
    addSubtitlesToVideo =
      mocks.addSubtitlesToVideo;
    adjustVideoSpeed = mocks.adjustVideoSpeed;
    concatVideos = mocks.concatVideos;
    createAsrSubtitles =
      mocks.createAsrSubtitles;
    enhanceVideo = mocks.enhanceVideo;
    eraseVideoSubtitles =
      mocks.eraseVideoSubtitles;
    getMediaTask = mocks.getMediaTask;
    trimVideo = mocks.trimVideo;
  },
}));

vi.mock("@/lib/providers/vod-watermark", () => ({
  VodWatermarkProvider: class {
    getTask = mocks.vodGetTask;
    start = mocks.vodStart;
  },
}));

vi.mock("@/lib/pipeline-store", () => ({
  activateRenderRevision: mocks.activateRenderRevision,
  enqueuePipelineJob: mocks.enqueuePipelineJob,
  getPipelineProject: mocks.getPipelineProject,
  listPipelineJobs: mocks.listPipelineJobs,
  upsertComposition: mocks.upsertComposition,
}));

vi.mock("@/lib/pipeline-runner", () => ({
  runPipelineJobNow: mocks.runPipelineJobNow,
}));

vi.mock("@/lib/project-store", () => ({
  createCuratedVideoAsset:
    mocks.createCuratedVideoAsset,
  createHighlightAsset:
    mocks.createHighlightAsset,
  createSourceAsset: mocks.createSourceAsset,
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

vi.mock("@/lib/subtitle-video-verification", () => ({
  verifyBurnedSubtitles:
    mocks.verifyBurnedSubtitles,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request(
    "http://localhost/api/projects/project-1/post-production",
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

describe("project post-production", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue({
      id: "project-1",
      name: "测试短剧",
      assets: [{
        id: "source-1",
        name: "第1集",
        durationMs: 30000,
        uploadMode: "episodes",
        episodeNumber: 1,
      }],
      highlightAssets: [],
      prerollAssets: [],
      finalAssets: [],
    });
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        productionEntry: "full_drama",
      },
      renders: [{
        id: "render-1",
        scriptId: "script-1",
        status: "completed",
        currentRevisionId: "revision-1",
        revisions: [{
          id: "revision-1",
          videoUrl: "https://example.com/preroll.mp4",
          operation: "generated",
          createdAt: "2026-08-21T00:00:00.000Z",
        }],
        videoUrl:
          "https://example.com/preroll.mp4",
      }],
      compositions: [{
        id: "composition-1",
        renderId: "render-1",
        highlightId: "highlight-1",
        status: "completed",
        videoUrl:
          "https://tos.example.com/compositions/final.mp4",
        objectKey: "project-1/compositions/final.mp4",
      }],
    });
    mocks.verifyBurnedSubtitles.mockResolvedValue({
      status: "verified",
      method: "ffmpeg_frame_difference_v1",
      sampleTimes: [1],
      strongDifferenceScores: [8.5],
      verifiedAt: "2026-08-21T00:00:00.000Z",
    });
    mocks.addSubtitlesToVideo.mockResolvedValue({
      id: "subtitle-task-1",
      status: "queued",
      progress: 5,
    });
    mocks.listPipelineJobs.mockResolvedValue([]);
    mocks.enqueuePipelineJob.mockResolvedValue({
      id: "post-job-1",
      kind: "post_production",
      status: "queued",
      progress: 0,
    });
  });

  it("enqueues preroll post-production with a render snapshot", async () => {
    const response = await POST(
      request({
        action: "enqueue",
        operation: "enhance",
        renderId: "render-1",
        videoUrl: "https://example.com/preroll.mp4",
        resolution: "1080p",
        fps: 30,
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith({
      projectId: "project-1",
      kind: "post_production",
      input: expect.objectContaining({
        runId: "run-1",
        renderId: "render-1",
        scriptId: "script-1",
        operation: "enhance",
        sourceRevisionId: "revision-1",
        sourceVideoUrl: "https://example.com/preroll.mp4",
        productionEntry: "full_drama",
      }),
    });
    expect(mocks.runPipelineJobNow).toHaveBeenCalledWith(
      "post-job-1",
    );
  });

  it("rejects subtitle erase ranges shorter than a video frame", async () => {
    const response = await POST(
      request({
        action: "enqueue",
        operation: "erase_subtitles",
        renderId: "render-1",
        videoUrl: "https://example.com/preroll.mp4",
        timeSegmentFilter: {
          mode: "selected",
          segments: [{
            startTime: 9.417,
            endTime: 9.43,
          }],
        },
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("clips subtitle jobs to the server-validated erase range", async () => {
    const response = await POST(
      request({
        action: "enqueue",
        operation: "add_subtitles",
        renderId: "render-1",
        videoUrl: "https://example.com/preroll.mp4",
        scope: "erase_scope",
        ranges: [{
          startTime: 5.123,
          endTime: 6.456,
        }],
        subtitles: [
          {
            subtitleText: "范围外字幕",
            startTime: 1,
            endTime: 2,
          },
          {
            subtitleText: "范围内字幕",
            startTime: 4,
            endTime: 7,
          },
        ],
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          subtitles: [{
            subtitleText: "范围内字幕",
            startTime: 5.123,
            endTime: 6.456,
          }],
        }),
      }),
    );
  });

  it("keeps millisecond subtitle timing after range clipping", async () => {
    const response = await POST(
      request({
        action: "enqueue",
        operation: "add_subtitles",
        renderId: "render-1",
        videoUrl: "https://example.com/preroll.mp4",
        scope: "erase_scope",
        ranges: [{
          startTime: 9.417,
          endTime: 9.6,
        }],
        subtitles: [{
          subtitleText: "过短字幕",
          startTime: 7.96,
          endTime: 9.64,
        }],
      }),
      context,
    );
    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          subtitles: [{
            subtitleText: "过短字幕",
            startTime: 9.417,
            endTime: 9.6,
          }],
        }),
      }),
    );
  });

  it("rejects a different operation while the current version is processing", async () => {
    mocks.listPipelineJobs.mockResolvedValue([{
      id: "post-job-running",
      kind: "post_production",
      status: "running",
      input: {
        renderId: "render-1",
        operation: "enhance",
        sourceRevisionId: "revision-1",
        sourceVideoUrl: "https://example.com/preroll.mp4",
      },
    }]);

    const response = await POST(
      request({
        action: "enqueue",
        operation: "erase_subtitles",
        renderId: "render-1",
        videoUrl: "https://example.com/preroll.mp4",
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("activates an earlier revision with current URL protection", async () => {
    mocks.activateRenderRevision.mockResolvedValue({
      id: "render-1",
      currentRevisionId: "revision-1",
      videoUrl: "https://example.com/preroll.mp4",
    });

    const response = await POST(
      request({
        action: "activate_revision",
        renderId: "render-1",
        revisionId: "revision-1",
        currentVideoUrl: "https://example.com/current.mp4",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.activateRenderRevision).toHaveBeenCalledWith(
      "project-1",
      {
        renderId: "render-1",
        revisionId: "revision-1",
        expectedVideoUrl: "https://example.com/current.mp4",
      },
    );
  });

  it("rejects subtitle burning before human confirmation", async () => {
    const response = await POST(
      request({
        action: "start",
        operation: "add_subtitles",
        videoUrl:
          "https://example.com/episode.mp4",
        subtitles: [{
          subtitleText: "未经确认的字幕",
          startTime: 0,
          endTime: 2,
        }],
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(
      mocks.addSubtitlesToVideo,
    ).not.toHaveBeenCalled();
  });

  it("starts subtitle burning after human confirmation", async () => {
    const response = await POST(
      request({
        action: "start",
        operation: "add_subtitles",
        confirmed: true,
        videoUrl:
          "https://example.com/episode.mp4",
        subtitles: [{
          subtitleText: "已人工确认的字幕",
          startTime: 0,
          endTime: 2,
        }],
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(
      mocks.addSubtitlesToVideo,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        subtitles: [{
          subtitleText: "已人工确认的字幕",
          startTime: 0,
          endTime: 2,
        }],
      }),
    );
  });

  it("returns ASR subtitles as a draft without storing a video", async () => {
    mocks.getMediaTask.mockResolvedValue({
      id: "asr-task-1",
      status: "completed",
      progress: 100,
      result: {
        subtitles: [
          {
            subtitle_text: "第一句字幕",
            start_time: 0.2,
            end_time: 1.8,
            speaker: "speaker-1",
          },
          {
            subtitle_text: "",
            start_time: 2,
            end_time: 1,
          },
        ],
      },
    });

    const response = await POST(
      request({
        action: "status",
        operation: "asr",
        taskId: "asr-task-1",
      }),
      context,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.subtitles).toEqual([
      {
        id: "subtitle-1",
        subtitleText: "第一句字幕",
        startTime: 0.2,
        endTime: 1.8,
        speaker: "speaker-1",
      },
    ]);
    expect(
      mocks.transferRemoteFileToTos,
    ).not.toHaveBeenCalled();
  });

  it("uses the MediaKit Chinese ASR language enum", async () => {
    mocks.createAsrSubtitles.mockResolvedValue({
      id: "asr-task-1",
      status: "queued",
      progress: 1,
    });

    const response = await POST(
      request({
        action: "start",
        operation: "asr",
        videoUrl:
          "https://example.com/episode.mp4",
        language: "cmn-Hans-CN",
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(
      mocks.createAsrSubtitles,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "cmn-Hans-CN",
      }),
    );
  });

  it("passes precise subtitle erase settings to MediaKit V5", async () => {
    mocks.eraseVideoSubtitles.mockResolvedValue({
      id: "erase-task-1",
      status: "queued",
      progress: 1,
    });

    const response = await POST(
      request({
        action: "start",
        operation: "erase_subtitles",
        videoUrl: "https://example.com/episode.mp4",
        modelVersion: "v5",
        timeSegmentFilter: {
          mode: "selected",
          segments: [{ startTime: 2, endTime: 8 }],
        },
        eraseRatioLocations: [{
          topLeftX: 0.05,
          topLeftY: 0.55,
          bottomRightX: 0.95,
          bottomRightY: 0.95,
        }],
        subtitleFilter: {
          minTextHeightRatio: 0.01,
          maxTextHeightRatio: 0.15,
          centerOffsetRatio: 0.12,
        },
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(
      mocks.eraseVideoSubtitles,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        modelVersion: "v5",
        timeSegmentFilter: {
          mode: "selected",
          segments: [{ startTime: 2, endTime: 8 }],
        },
        eraseRatioLocations: [{
          topLeftX: 0.05,
          topLeftY: 0.55,
          bottomRightX: 0.95,
          bottomRightY: 0.95,
        }],
      }),
    );
  });

  it("starts an image watermark workflow from the composition object key", async () => {
    mocks.vodStart.mockResolvedValue({
      id: "vod-run-1",
      status: "queued",
      progress: 3,
    });

    const response = await POST(
      request({
        action: "start",
        operation: "watermark",
        compositionId: "composition-1",
        sourceVideoUrl:
          "https://tos.example.com/compositions/final.mp4",
        watermarkMode: "image",
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.vodStart).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: "project-1/compositions/final.mp4",
        mode: "image",
      }),
    );
  });

  it("stores a completed text watermark as the current final output", async () => {
    mocks.vodGetTask.mockResolvedValue({
      id: "vod-run-1",
      status: "completed",
      progress: 100,
      videoUrl:
        "https://vod.example.com/final-watermarked.mp4",
    });
    mocks.upsertComposition.mockResolvedValue({
      id: "composition-1",
      videoUrl:
        "https://vod.example.com/final-watermarked.mp4",
    });

    const response = await POST(
      request({
        action: "status",
        operation: "watermark",
        taskId: "vod-run-1",
        compositionId: "composition-1",
        sourceVideoUrl:
          "https://tos.example.com/compositions/final.mp4",
        watermarkMode: "text",
        text: "FrameFlow",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.upsertComposition).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        id: "composition-1",
        processedOperation: "text_watermark",
        watermarkText: "FrameFlow",
        videoUrl:
          "https://vod.example.com/final-watermarked.mp4",
      }),
    );
  });

  it("stores subtitle-erased output beside the source asset", async () => {
    mocks.getMediaTask.mockResolvedValue({
      id: "erase-task-1",
      status: "completed",
      progress: 100,
      videoUrl:
        "https://temporary.example.com/erased.mp4",
    });
    mocks.transferRemoteFileToTos.mockResolvedValue({
      sourceUrl:
        "https://tos.example.com/sources/erased.mp4",
      objectKey:
        "project-1/sources/erased.mp4",
      sizeBytes: 2048,
    });
    mocks.createSourceAsset.mockResolvedValue({
      id: "source-erased-1",
      kind: "source",
      name: "第1集-字幕擦除",
    });

    const response = await POST(
      request({
        action: "status",
        operation: "erase_subtitles",
        taskId: "erase-task-1",
        sourceAssetId: "source-1",
        sourceAssetType: "source",
        sourceAssetName: "第1集",
      }),
      context,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(
      mocks.transferRemoteFileToTos,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "sources",
        fileName: "第1集-字幕擦除.mp4",
      }),
    );
    expect(mocks.createSourceAsset).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        name: "第1集-字幕擦除",
        sourceUrl:
          "https://tos.example.com/sources/erased.mp4",
        uploadMode: "episodes",
        episodeNumber: 1,
      }),
    );
    expect(payload.data.derivedAsset).toMatchObject({
      id: "source-erased-1",
      name: "第1集-字幕擦除",
    });
  });

  it("stores completed video output in project TOS", async () => {
    mocks.getMediaTask.mockResolvedValue({
      id: "trim-task-1",
      status: "completed",
      progress: 100,
      videoUrl:
        "https://temporary.example.com/trim.mp4",
    });
    mocks.transferRemoteFileToTos.mockResolvedValue({
      sourceUrl:
        "https://tos.example.com/postproduction/trim.mp4",
      objectKey:
        "project-1/postproduction/trim.mp4",
    });

    const response = await POST(
      request({
        action: "status",
        operation: "trim",
        taskId: "trim-task-1",
      }),
      context,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(
      mocks.transferRemoteFileToTos,
    ).toHaveBeenCalledWith({
      remoteUrl:
        "https://temporary.example.com/trim.mp4",
      projectId: "project-1",
      projectName: "测试短剧",
      stage: "postproduction",
      fileName: "trim-trim-task-1.mp4",
    });
    expect(payload.data).toMatchObject({
      videoUrl:
        "https://tos.example.com/postproduction/trim.mp4",
      objectKey:
        "project-1/postproduction/trim.mp4",
    });
  });

  it("verifies visible subtitle pixels before storing output", async () => {
    mocks.getMediaTask.mockResolvedValue({
      id: "subtitle-task-1",
      status: "completed",
      progress: 100,
      videoUrl:
        "https://temporary.example.com/subtitled.mp4",
    });
    mocks.transferRemoteFileToTos.mockResolvedValue({
      sourceUrl:
        "https://tos.example.com/postproduction/subtitled.mp4",
      objectKey:
        "project-1/postproduction/subtitled.mp4",
    });

    const subtitles = [{
      subtitleText: "可见字幕",
      startTime: 0,
      endTime: 2,
    }];
    const response = await POST(
      request({
        action: "status",
        operation: "add_subtitles",
        taskId: "subtitle-task-1",
        sourceVideoUrl:
          "https://example.com/original.mp4",
        subtitles,
      }),
      context,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(
      mocks.verifyBurnedSubtitles,
    ).toHaveBeenCalledWith({
      sourceVideoUrl:
        "https://example.com/original.mp4",
      outputVideoUrl:
        "https://temporary.example.com/subtitled.mp4",
      subtitles,
    });
    expect(payload.data.subtitleVerification).toMatchObject({
      status: "verified",
    });
  });

  it("does not store subtitle output when pixels are not visible", async () => {
    mocks.getMediaTask.mockResolvedValue({
      id: "subtitle-task-1",
      status: "completed",
      progress: 100,
      videoUrl:
        "https://temporary.example.com/subtitled.mp4",
    });
    mocks.verifyBurnedSubtitles.mockRejectedValue(
      new Error(
        "字幕任务已完成，但抽帧验收未检测到可见字幕，已禁止保存和拼接",
      ),
    );

    const response = await POST(
      request({
        action: "status",
        operation: "add_subtitles",
        taskId: "subtitle-task-1",
        sourceVideoUrl:
          "https://example.com/original.mp4",
        subtitles: [{
          subtitleText: "不可见字幕",
          startTime: 0,
          endTime: 2,
        }],
      }),
      context,
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain(
      "抽帧验收未检测到可见字幕",
    );
    expect(
      mocks.transferRemoteFileToTos,
    ).not.toHaveBeenCalled();
  });
});
