import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getImageAssetsByIds: vi.fn(),
  listCuratedVideoAssets: vi.fn(),
  listHighlightAssets: vi.fn(),
  listImageAssets: vi.fn(),
  enqueuePipelineJob: vi.fn(),
  getPipelineJob: vi.fn(),
  getPipelineProject: vi.fn(),
  getPipelineWorkspaceSnapshot: vi.fn(),
  activatePipelineRun: vi.fn(),
  activatePipelineRunById: vi.fn(),
  listPipelineJobs: vi.fn(),
  requeuePipelineJob: vi.fn(),
  getCreativeSettings: vi.fn(),
  markScriptPrerollOpened: vi.fn(),
  updateScript: vi.fn(),
  deleteScript: vi.fn(),
  deleteScripts: vi.fn(),
  confirmScripts: vi.fn(),
  saveEditedVideoPrompt: vi.fn(),
  saveNextProductionPlan: vi.fn(),
  saveProductionPlan: vi.fn(),
  saveAnalysis: vi.fn(),
  saveStoryArcs: vi.fn(),
  confirmProductionPlan: vi.fn(),
  startPipelineRun: vi.fn(),
  startPipelineRunFromSharedArtifacts: vi.fn(),
  upsertHighlight: vi.fn(),
  upsertRender: vi.fn(),
  scriptContentHash: vi.fn(),
  videoPromptMatchesScript: vi.fn(),
  videoPromptSystemPromptHash: vi.fn(),
  runPipelineJobNow: vi.fn(),
  verifyBurnedSubtitles: vi.fn(),
}));

vi.mock("@/lib/project-store", () => ({
  getProject: mocks.getProject,
  getImageAssetsByIds: mocks.getImageAssetsByIds,
  imageAssetReferenceUrl: (asset: {
    sourceUrl: string;
    metadata: {
      avatarStatus?: string;
      avatarAssetId?: string;
    };
  }) =>
    asset.metadata.avatarStatus === "active" &&
    asset.metadata.avatarAssetId
      ? `asset://${asset.metadata.avatarAssetId}`
      : asset.sourceUrl,
  listCuratedVideoAssets:
    mocks.listCuratedVideoAssets,
  listHighlightAssets: mocks.listHighlightAssets,
  listImageAssets: mocks.listImageAssets,
}));

vi.mock("@/lib/pipeline-store", () => ({
  enqueuePipelineJob: mocks.enqueuePipelineJob,
  getPipelineJob: mocks.getPipelineJob,
  getPipelineProject: mocks.getPipelineProject,
  getPipelineWorkspaceSnapshot:
    mocks.getPipelineWorkspaceSnapshot,
  activatePipelineRun: mocks.activatePipelineRun,
  activatePipelineRunById:
    mocks.activatePipelineRunById,
  listPipelineJobs: mocks.listPipelineJobs,
  requeuePipelineJob: mocks.requeuePipelineJob,
  markScriptPrerollOpened:
    mocks.markScriptPrerollOpened,
  updateScript: mocks.updateScript,
  deleteScript: mocks.deleteScript,
  deleteScripts: mocks.deleteScripts,
  confirmScripts: mocks.confirmScripts,
  saveEditedVideoPrompt: mocks.saveEditedVideoPrompt,
  saveNextProductionPlan:
    mocks.saveNextProductionPlan,
  saveProductionPlan: mocks.saveProductionPlan,
  saveAnalysis: mocks.saveAnalysis,
  saveStoryArcs: mocks.saveStoryArcs,
  confirmProductionPlan: mocks.confirmProductionPlan,
  startPipelineRun: mocks.startPipelineRun,
  startPipelineRunFromSharedArtifacts:
    mocks.startPipelineRunFromSharedArtifacts,
  upsertHighlight: mocks.upsertHighlight,
  upsertRender: mocks.upsertRender,
  scriptContentHash: mocks.scriptContentHash,
  videoPromptMatchesScript: mocks.videoPromptMatchesScript,
  videoPromptSystemPromptHash:
    mocks.videoPromptSystemPromptHash,
}));

vi.mock("@/lib/creative-settings-store", () => ({
  getCreativeSettings: mocks.getCreativeSettings,
  selectVideoPromptSystemPrompt: (
    settings: {
      videoPromptSystemPrompt: string;
      videoPromptWithoutSubtitlesSystemPrompt: string;
    },
    generateSubtitles: boolean,
  ) => generateSubtitles
    ? settings.videoPromptSystemPrompt
    : settings.videoPromptWithoutSubtitlesSystemPrompt,
}));

vi.mock("@/lib/pipeline-runner", () => ({
  runPipelineJobNow: mocks.runPipelineJobNow,
}));

vi.mock("@/lib/subtitle-video-verification", () => ({
  verifyBurnedSubtitles:
    mocks.verifyBurnedSubtitles,
}));

import { GET, POST } from "./route";
import { defaultProductionConfig } from "@/lib/production-config";

const project = {
  id: "project-1",
  assets: [
    {
      id: "asset-1",
      sourceUrl: "https://example.com/1.mp4",
      durationMs: 600000,
    },
    {
      id: "asset-2",
      sourceUrl: "https://example.com/2.mp4",
      durationMs: 600000,
    },
  ],
};

function request(body: unknown) {
  return new Request("http://localhost/api/projects/project-1/workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("project workflow source selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue(project);
    mocks.getImageAssetsByIds.mockResolvedValue([]);
    mocks.listCuratedVideoAssets.mockResolvedValue([]);
    mocks.listHighlightAssets.mockResolvedValue([]);
    mocks.listImageAssets.mockResolvedValue([]);
    mocks.getPipelineWorkspaceSnapshot.mockResolvedValue({
      project: null,
      jobs: [],
    });
    mocks.listPipelineJobs.mockResolvedValue([]);
    mocks.enqueuePipelineJob.mockResolvedValue({ id: "job-1" });
    mocks.saveEditedVideoPrompt.mockResolvedValue({
      reviewStatus: "confirmed",
    });
    mocks.upsertRender.mockResolvedValue({
      id: "render-1",
      videoUrl: "https://example.com/processed.mp4",
    });
    mocks.scriptContentHash.mockReturnValue("script-hash");
    mocks.videoPromptSystemPromptHash.mockReturnValue(
      "system-prompt-hash",
    );
    mocks.videoPromptMatchesScript.mockImplementation(
      (script: { videoPromptSourceHash?: string }) =>
        script.videoPromptSourceHash === "script-hash",
    );
    mocks.verifyBurnedSubtitles.mockResolvedValue({
      status: "verified",
      method: "ffmpeg_frame_difference_v1",
      sampleTimes: [1],
      strongDifferenceScores: [8.5],
      verifiedAt: "2026-08-21T00:00:00.000Z",
    });
    mocks.getPipelineProject.mockResolvedValue(null);
    mocks.getCreativeSettings.mockResolvedValue({
      prerollCreativeSystemPrompt: "创意提案提示词",
      prerollScriptSystemPrompt: "脚本成稿提示词",
      videoPromptSystemPrompt: "生视频提示词",
      videoPromptWithoutSubtitlesSystemPrompt:
        "无字幕生视频提示词",
      updatedAt: "",
    });
  });

  it("loads the workspace from one project snapshot", async () => {
    const pipeline = {
      projectId: "project-1",
      status: "ready",
      characters: [],
      arcs: [],
      highlights: [],
      scripts: [],
      renders: [],
      compositions: [],
      updatedAt: "2026-08-20T00:00:00.000Z",
    };
    const jobs = [{ id: "job-1" }];
    const imageAssets = [{
      id: "image-1",
      metadata: {
        sourceType: "upload",
        characterName: "林夏",
      },
    }];
    mocks.getPipelineWorkspaceSnapshot.mockResolvedValue({
      project: pipeline,
      jobs,
    });
    mocks.listImageAssets.mockResolvedValue(imageAssets);
    mocks.listHighlightAssets.mockResolvedValue([{
      id: "featured-highlight-1",
      kind: "highlight",
      metadata: {
        sourceArtifactId: "highlight-1:0",
      },
    }]);
    mocks.listCuratedVideoAssets.mockImplementation(
      (_projectId: string, kind: string) =>
        Promise.resolve([{
          id: `featured-${kind}`,
          kind,
          metadata: {
            sourceArtifactId:
              kind === "preroll_video"
                ? "render-1"
                : "composition-1",
          },
        }]),
    );

    const response = await GET(
      new Request(
        "http://localhost/api/projects/project-1/workflow?productionEntry=batch_highlights",
      ),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: pipeline,
      jobs,
      imageAssets,
      featuredAssets: [
        {
          id: "featured-highlight-1",
          kind: "highlight",
          sourceArtifactId: "highlight-1:0",
        },
        {
          id: "featured-preroll_video",
          kind: "preroll_video",
          sourceArtifactId: "render-1",
        },
        {
          id: "featured-final_video",
          kind: "final_video",
          sourceArtifactId: "composition-1",
        },
      ],
    });
    expect(
      mocks.getPipelineWorkspaceSnapshot,
    ).toHaveBeenCalledWith(
      "project-1",
      "batch_highlights",
    );
    expect(mocks.getProject).not.toHaveBeenCalled();
  });

  it("activates a selected production run", async () => {
    mocks.activatePipelineRunById.mockResolvedValue({
      currentRunId: "run-older",
    });

    const response = await POST(
      request({
        action: "activate_run",
        runId: "run-older",
        workflowEntry: "full_drama",
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(
      mocks.activatePipelineRunById,
    ).toHaveBeenCalledWith(
      "project-1",
      "run-older",
      "full_drama",
    );
  });

  it("clears the previous upstream task when retrying", async () => {
    mocks.getPipelineJob.mockResolvedValue({
      id: "job-highlight-1",
      kind: "highlight",
      upstreamId: "old-upstream-task",
    });
    mocks.requeuePipelineJob.mockResolvedValue({
      id: "job-highlight-1",
      status: "queued",
    });

    const response = await POST(
      request({
        action: "retry",
        jobId: "job-highlight-1",
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(
      mocks.requeuePipelineJob,
    ).toHaveBeenCalledWith(
      "job-highlight-1",
      {
        attempts: 0,
        upstreamId: undefined,
      },
    );
  });

  it("reuses a completed upstream task when retrying post-production", async () => {
    mocks.getPipelineJob.mockResolvedValue({
      id: "job-post-1",
      kind: "post_production",
      upstreamId: "mediakit-task-1",
    });
    mocks.requeuePipelineJob.mockResolvedValue({
      id: "job-post-1",
      status: "queued",
    });

    const response = await POST(
      request({
        action: "retry",
        jobId: "job-post-1",
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.requeuePipelineJob).toHaveBeenCalledWith(
      "job-post-1",
      {
        attempts: 0,
        upstreamId: "mediakit-task-1",
      },
    );
  });

  it("rejects manual composition without both source videos", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      renders: [],
      highlights: [],
    });

    const response = await POST(
      request({
        action: "compose_preroll",
        renderId: "render-1",
        highlightId: "highlight-1",
        renderVideoUrl:
          "https://example.com/processed.mp4",
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("rejects composition from an unverified subtitle version", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      renders: [{
        id: "render-1",
        status: "completed",
        videoUrl:
          "https://example.com/add_subtitles-output.mp4",
        processedOperation: "add_subtitles",
      }],
      highlights: [{
        id: "highlight-1",
        result: {
          videoUrls:
            ["https://example.com/highlight.mp4"],
        },
      }],
    });

    const response = await POST(
      request({
        action: "compose_preroll",
        renderId: "render-1",
        highlightId: "highlight-1",
        renderVideoUrl:
          "https://example.com/add_subtitles-output.mp4",
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("reuses an active manual composition job", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      renders: [{
        id: "render-1",
        status: "completed",
        videoUrl: "https://example.com/processed.mp4",
      }],
      highlights: [{
        id: "highlight-1",
        result: {
          videoUrls: ["https://example.com/highlight.mp4"],
        },
      }],
    });
    mocks.listPipelineJobs.mockResolvedValue([{
      id: "compose-job-1",
      kind: "compose",
      status: "running",
      input: {
        renderId: "render-1",
        highlightId: "highlight-1",
        renderVideoUrl:
          "https://example.com/processed.mp4",
      },
    }]);

    const response = await POST(
      request({
        action: "compose_preroll",
        renderId: "render-1",
        highlightId: "highlight-1",
        renderVideoUrl:
          "https://example.com/processed.mp4",
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
    expect(mocks.runPipelineJobNow).not.toHaveBeenCalled();
  });

  it("starts composition only after the user requests it", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      renders: [{
        id: "render-1",
        status: "completed",
        videoUrl: "https://example.com/processed.mp4",
      }],
      highlights: [{
        id: "highlight-1",
        result: {
          videoUrls: ["https://example.com/highlight.mp4"],
        },
      }],
    });
    mocks.enqueuePipelineJob.mockResolvedValue({
      id: "compose-job-1",
    });

    const response = await POST(
      request({
        action: "compose_preroll",
        renderId: "render-1",
        highlightId: "highlight-1",
        renderVideoUrl:
          "https://example.com/processed.mp4",
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith({
      projectId: "project-1",
      kind: "compose",
      input: {
        runId: "run-1",
        renderId: "render-1",
        highlightId: "highlight-1",
        renderVideoUrl: "https://example.com/processed.mp4",
        sourceRenderSubtitleVerified: false,
        compositionId: expect.stringMatching(
          /^composition-render-1-/,
        ),
      },
    });
    expect(mocks.runPipelineJobNow).toHaveBeenCalledWith(
      "compose-job-1",
    );
  });

  it("rejects composition when the displayed preroll version is stale", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      renders: [{
        id: "render-1",
        status: "completed",
        videoUrl: "https://example.com/current.mp4",
      }],
      highlights: [{
        id: "highlight-1",
        result: {
          videoUrls: ["https://example.com/highlight.mp4"],
        },
      }],
    });

    const response = await POST(
      request({
        action: "compose_preroll",
        renderId: "render-1",
        highlightId: "highlight-1",
        renderVideoUrl:
          "https://example.com/old.mp4",
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("snapshots only selected project assets in project order", async () => {
    const response = await POST(
      request({ action: "run_full", sourceAssetIds: ["asset-2"] }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.startPipelineRun).toHaveBeenCalledWith(
      "project-1",
      expect.stringMatching(/^run-/),
      ["asset-2"],
    );
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      kind: "analysis",
      input: expect.objectContaining({
        autoRun: true,
        sourceAssetIds: ["asset-2"],
        videoUrls: ["https://example.com/2.mp4"],
        prerollType: "story_extended",
        prerollCreativeSystemPrompt: "创意提案提示词",
        prerollScriptSystemPrompt: "脚本成稿提示词",
        sellingPointCount: 3,
        scriptCount: 3,
          highlightTargetDuration: 120,
        highlightTargetCount: 3,
          highlightMinDuration: 72,
          highlightMaxDuration: 120,
      }),
    }));
  });

  it("starts batch highlights directly without storyline analysis", async () => {
    const response = await POST(
      request({
        action: "run_full",
        sourceAssetIds: ["asset-1", "asset-2"],
        workflowEntry: "batch_highlights",
        productionConfig: {
          ...defaultProductionConfig,
          productionEntry: "full_drama",
          highlightTargetDuration: 120,
          highlightTargetCount: 3,
        },
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.upsertHighlight).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        arcId: expect.stringMatching(/^batch-run-/),
        mode: "montage",
        status: "queued",
      }),
    );
    expect(
      mocks.enqueuePipelineJob,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        kind: "highlight",
        input: expect.objectContaining({
          autoRun: false,
          productionEntry: "batch_highlights",
          videoUrls: [
            "https://example.com/1.mp4",
            "https://example.com/2.mp4",
          ],
          highlightOutputCount: 3,
        }),
      }),
    );
    expect(
      mocks.enqueuePipelineJob,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "analysis",
      }),
    );
  });

  it("starts from selected highlight assets without source videos", async () => {
    mocks.enqueuePipelineJob.mockImplementation(
      async (input: { kind: string }) => ({
        id: `job-${input.kind}`,
      }),
    );
    mocks.getProject.mockResolvedValue({
      ...project,
      assets: [],
    });
    mocks.listHighlightAssets.mockResolvedValue([
      {
        id: "highlight-asset-1",
        name: "用户高光-逆袭",
        sourceUrl:
          "https://example.com/highlight.mp4",
        durationMs: 90000,
        sizeBytes: 4096,
        metadata: {
          sourceType: "user",
          summary: "女主当众揭露身份",
        },
      },
    ]);

    const response = await POST(
      request({
        action: "run_full",
        productionConfig: {
          ...defaultProductionConfig,
          productionEntry:
            "uploaded_highlights",
          executionMode: "agent",
          selectedHighlightAssetIds: [
            "highlight-asset-1",
          ],
        },
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.startPipelineRun).toHaveBeenCalledWith(
      "project-1",
      expect.stringMatching(/^run-/),
      ["highlight-asset-1"],
    );
    expect(mocks.upsertHighlight).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        id: "highlight-upload-highlight-asset-1",
        arcId: "",
        mode: "uploaded",
      }),
      expect.stringMatching(/^run-/),
    );
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "highlight_analysis",
        input: expect.objectContaining({
          sourceAssetIds: ["highlight-asset-1"],
          sourceHighlightAssetId: "highlight-asset-1",
          highlightId:
            "highlight-upload-highlight-asset-1",
          storyContextSource: "selected_highlights",
          videoUrl: "https://example.com/highlight.mp4",
          uploadedHighlights: [
            expect.objectContaining({
              assetId: "highlight-asset-1",
              highlightId:
                "highlight-upload-highlight-asset-1",
              videoUrl:
                "https://example.com/highlight.mp4",
            }),
          ],
          executionMode: "agent",
          productionEntry:
            "uploaded_highlights",
          videoPromptSystemPrompt:
            "无字幕生视频提示词",
        }),
      }),
    );
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "highlight_context",
        input: expect.objectContaining({
          analysisJobIds: ["job-highlight_analysis"],
          sourceAssetIds: ["highlight-asset-1"],
        }),
      }),
    );
    expect(mocks.runPipelineJobNow).toHaveBeenCalledWith(
      "job-highlight_analysis",
    );
    expect(mocks.runPipelineJobNow).toHaveBeenCalledWith(
      "job-highlight_context",
    );
  });

  it("enqueues one analysis per uploaded highlight and one coordinator", async () => {
    mocks.enqueuePipelineJob.mockImplementation(
      async (input: {
        kind: string;
        input: { sourceHighlightAssetId?: string };
      }) => ({
        id: input.kind === "highlight_analysis"
          ? `job-${input.input.sourceHighlightAssetId}`
          : "job-highlight-context",
      }),
    );
    mocks.getProject.mockResolvedValue({
      ...project,
      assets: [],
    });
    mocks.listHighlightAssets.mockResolvedValue([
      {
        id: "highlight-asset-1",
        name: "高光一.mp4",
        sourceUrl: "https://example.com/highlight-1.mp4",
        durationMs: 90000,
        sizeBytes: 4096,
        metadata: { sourceType: "user" },
      },
      {
        id: "highlight-asset-2",
        name: "高光二.mp4",
        sourceUrl: "https://example.com/highlight-2.mp4",
        durationMs: 80000,
        sizeBytes: 3072,
        metadata: { sourceType: "user" },
      },
    ]);

    const response = await POST(
      request({
        action: "run_full",
        productionConfig: {
          ...defaultProductionConfig,
          productionEntry: "uploaded_highlights",
          selectedHighlightAssetIds: [
            "highlight-asset-1",
            "highlight-asset-2",
          ],
        },
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    const analysisCalls =
      mocks.enqueuePipelineJob.mock.calls.filter(
        ([input]) => input.kind === "highlight_analysis",
      );
    expect(analysisCalls).toHaveLength(2);
    expect(analysisCalls.map(([input]) => ({
      assetId: input.input.sourceHighlightAssetId,
      sourceName: input.input.sourceName,
      sourceAssetIds: input.input.sourceAssetIds,
    }))).toEqual([
      {
        assetId: "highlight-asset-1",
        sourceName: "高光一.mp4",
        sourceAssetIds: ["highlight-asset-1"],
      },
      {
        assetId: "highlight-asset-2",
        sourceName: "高光二.mp4",
        sourceAssetIds: ["highlight-asset-2"],
      },
    ]);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "highlight_context",
        input: expect.objectContaining({
          analysisJobIds: [
            "job-highlight-asset-1",
            "job-highlight-asset-2",
          ],
          sourceAssetIds: [
            "highlight-asset-1",
            "highlight-asset-2",
          ],
        }),
      }),
    );
    expect(mocks.runPipelineJobNow.mock.calls).toEqual([
      ["job-highlight-asset-1"],
      ["job-highlight-asset-2"],
      ["job-highlight-context"],
    ]);
  });

  it("analyzes project episodes before selected highlights when no shared context exists", async () => {
    mocks.listHighlightAssets.mockResolvedValue([{
      id: "highlight-asset-1",
      name: "用户高光",
      sourceUrl: "https://example.com/highlight.mp4",
      durationMs: 90000,
      sizeBytes: 4096,
      metadata: { sourceType: "user" },
    }]);

    const response = await POST(
      request({
        action: "run_full",
        productionConfig: {
          ...defaultProductionConfig,
          productionEntry: "uploaded_highlights",
          selectedHighlightAssetIds: ["highlight-asset-1"],
        },
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.startPipelineRun).toHaveBeenCalledWith(
      "project-1",
      expect.stringMatching(/^run-/),
      ["asset-1", "asset-2"],
    );
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "analysis",
        input: expect.objectContaining({
          storyContextSource: "project_sources",
          sourceAssetIds: ["asset-1", "asset-2"],
          videoUrls: [
            "https://example.com/1.mp4",
            "https://example.com/2.mp4",
          ],
        }),
      }),
    );
  });

  it("reuses project story context before analyzing the selected highlight opening", async () => {
    mocks.listHighlightAssets.mockResolvedValue([{
      id: "highlight-asset-1",
      name: "MediaKit 高光",
      sourceUrl: "https://example.com/highlight.mp4",
      durationMs: 90000,
      sizeBytes: 4096,
      metadata: {
        sourceType: "mediakit",
        sourceHighlightId: "source-highlight-1",
      },
    }]);
    mocks.getPipelineWorkspaceSnapshot.mockResolvedValue({
      project: {
        analysisSourceAssetIds: ["asset-1", "asset-2"],
        analysis: {
          duration: 1200,
          sourceVideoInfo: [],
          clips: [],
          highlights: [],
        },
        arcs: [{
          id: "arc-shared",
          title: "身份反转",
          pitch: "主角完成身份反转",
          evidenceClipIndexes: [0],
          scores: {},
        }],
        highlights: [{
          id: "source-highlight-1",
          arcId: "arc-shared",
        }],
      },
      jobs: [],
    });

    const response = await POST(
      request({
        action: "run_full",
        productionConfig: {
          ...defaultProductionConfig,
          productionEntry: "uploaded_highlights",
          selectedHighlightAssetIds: ["highlight-asset-1"],
        },
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(
      mocks.startPipelineRunFromSharedArtifacts,
    ).toHaveBeenCalledWith(
      "project-1",
      expect.stringMatching(/^run-/),
      ["asset-1", "asset-2"],
    );
    expect(mocks.upsertHighlight).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        id: "highlight-upload-highlight-asset-1",
        arcId: "arc-shared",
        mode: "uploaded",
      }),
      expect.stringMatching(/^run-/),
    );
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "transition",
        input: expect.objectContaining({
          arcId: "arc-shared",
          storyContextSource: "project_sources",
        }),
      }),
    );
  });

  it("rejects an asset outside the current project", async () => {
    const response = await POST(
      request({ action: "run_full", sourceAssetIds: ["asset-other"] }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("所选源视频不存在或不属于当前项目");
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("rejects production until all selected source durations are available", async () => {
    mocks.getProject.mockResolvedValue({
      ...project,
      assets: [{
        id: "asset-1",
        sourceUrl: "https://example.com/1.mp4",
        durationMs: null,
      }],
    });

    const response = await POST(
      request({ action: "run_full", sourceAssetIds: ["asset-1"] }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "所选素材时长尚未读取完成，请稍后再开始生产",
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("accepts a duration below the suggested live-action range", async () => {
    const response = await POST(
      request({
        action: "run_full",
        sourceAssetIds: ["asset-1"],
        productionConfig: {
          ...defaultProductionConfig,
          highlightTargetMode: "duration",
          highlightTargetDuration: 30,
        },
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        highlightTargetDuration: 30,
        highlightMinDuration: 30,
        highlightMaxDuration: 30,
      }),
    }));
  });

  it("rejects a target duration above the selected source duration", async () => {
    const response = await POST(
      request({
        action: "run_full",
        sourceAssetIds: ["asset-1"],
        productionConfig: {
          ...defaultProductionConfig,
          highlightTargetMode: "duration",
          highlightTargetDuration: 601,
        },
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "目标时长不能超过当前素材总时长 600 秒",
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("accepts an output count above the advisory limit", async () => {
    const response = await POST(
      request({
        action: "run_full",
        sourceAssetIds: ["asset-1"],
        productionConfig: {
          ...defaultProductionConfig,
          highlightTargetDuration: 180,
          highlightTargetCount: 4,
        },
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        highlightTargetDuration: 180,
        highlightTargetCount: 4,
      }),
    }));
  });

  it("saves the complete production plan before generation", async () => {
    const productionConfig = {
      ...defaultProductionConfig,
      expressionType: "uncanny_spectacle" as const,
      scriptCount: 4,
      highlightTargetDuration: 90,
      highlightTargetCount: 5,
    };

    const response = await POST(
      request({
        action: "save_production_plan",
        sourceAssetIds: ["asset-1"],
        prerollType: "strong_acquisition",
        productionConfig,
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.saveNextProductionPlan).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        expressionType: "uncanny_spectacle",
        scriptCount: 4,
        highlightTargetDuration: 90,
        highlightTargetCount: 5,
      }),
      expect.objectContaining({
        sourceDuration: 600,
      }),
      "strong_acquisition",
      ["asset-1"],
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("saves production settings without requiring source selection", async () => {
    const productionConfig = {
      ...defaultProductionConfig,
      videoResolution: "1080p" as const,
      videoRatio: "21:9" as const,
    };

    const response = await POST(
      request({
        action: "save_production_plan",
        sourceAssetIds: [],
        prerollType: "story_extended",
        productionConfig,
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.saveNextProductionPlan).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        videoResolution: "1080p",
        videoRatio: "21:9",
      }),
      expect.objectContaining({
        sourceDuration:
          productionConfig.highlightTargetDuration *
          productionConfig.highlightTargetCount,
      }),
      "story_extended",
      [],
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("continues only after the user confirms editable highlight settings", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-current",
      analysisSourceAssetIds: ["asset-2"],
      analysis: {
        duration: 1800,
        sourceVideoInfo: [{ url: "https://example.com/2.mp4" }],
      },
      highlightRecommendation: {
        minDuration: 60,
        maxDuration: 180,
        maxNumber: 12,
        targetDuration: 120,
        recommendedNumber: 12,
        upperLimit: 30,
        sourceDuration: 1800,
        cutMode: "Mixed",
        enableOpeningHook: true,
        rationale: "formula",
      },
    });

    const response = await POST(
      request({
        action: "continue_production",
        sourceAssetIds: ["asset-2"],
        prerollType: "story_linked",
        productionConfig: {
          ...defaultProductionConfig,
          highlightTargetCount: 10,
          highlightMinDuration: 70,
          highlightMaxDuration: 160,
        },
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.confirmProductionPlan).toHaveBeenCalledWith("project-1");
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      kind: "mine_arcs",
      input: expect.objectContaining({
        highlightTargetCount: 10,
          highlightTargetDuration: 120,
          highlightMinDuration: 72,
          highlightMaxDuration: 120,
      }),
    }));
  });

  it("reuses shared story arcs without mining them again", async () => {
    mocks.getPipelineWorkspaceSnapshot.mockResolvedValue({
      project: {
        currentRunId: "run-current",
        analysisSourceAssetIds: ["asset-2"],
        analysis: {
          duration: 1800,
          sourceVideoInfo: [
            { url: "https://example.com/2.mp4" },
          ],
        },
        arcs: [
          { id: "arc-1" },
          { id: "arc-2" },
        ],
        highlightRecommendation: {
          minDuration: 60,
          maxDuration: 180,
        },
      },
      jobs: [],
    });

    const response = await POST(
      request({
        action: "continue_production",
        sourceAssetIds: ["asset-2"],
        prerollType: "story_linked",
        workflowEntry: "full_drama",
        productionConfig: {
          ...defaultProductionConfig,
          highlightTargetCount: 2,
        },
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(
      mocks.startPipelineRunFromSharedArtifacts,
    ).not.toHaveBeenCalled();
    expect(
      mocks.enqueuePipelineJob,
    ).toHaveBeenCalledTimes(2);
    expect(
      mocks.enqueuePipelineJob,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "highlight",
        input: expect.objectContaining({
          runId: "run-current",
          arcId: "arc-1",
        }),
      }),
    );
    expect(
      mocks.enqueuePipelineJob,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mine_arcs",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      reused: ["analysis", "arcs"],
    });
  });

  it("rejects a plan when the selected assets differ from the analyzed snapshot", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      analysisSourceAssetIds: ["asset-1"],
      analysis: {
        duration: 1200,
        sourceVideoInfo: [{ url: "https://example.com/1.mp4" }],
      },
      highlightRecommendation: {
        minDuration: 60,
        maxDuration: 720,
      },
    });

    const response = await POST(
      request({
        action: "continue_production",
        sourceAssetIds: ["asset-2"],
        prerollType: "story_linked",
        productionConfig: defaultProductionConfig,
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "本次素材选择已变化，请重新分析后再继续",
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("saves a script draft without starting downstream generation", async () => {
    const script = {
      title: "身份揭露",
        duration: 45,
      voiceover: "她直到这一刻才知道真相。",
      transition: "推近人物眼神后切入正片。",
      shots: [{
        time: "0-3s",
        framing: "近景",
        visual: "人物抬头",
        dialogue: "原来是你",
      }],
    };
    mocks.updateScript.mockResolvedValue({ id: "script-1", ...script });

    const response = await POST(
      request({ action: "update_script", scriptId: "script-1", script }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateScript).toHaveBeenCalledWith("project-1", "script-1", script);
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("records when a script enters the AI preroll stage", async () => {
    mocks.markScriptPrerollOpened.mockResolvedValue({
      id: "script-1",
      prerollOpenedAt: "2026-08-24T01:00:00.000Z",
    });

    const response = await POST(
      request({
        action: "open_preroll_script",
        scriptId: "script-1",
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(
      mocks.markScriptPrerollOpened,
    ).toHaveBeenCalledWith("project-1", "script-1");
    expect(mocks.updateScript).not.toHaveBeenCalled();
  });

  it("deletes a script draft without starting downstream generation", async () => {
    mocks.deleteScript.mockResolvedValue({ id: "script-1" });

    const response = await POST(
      request({ action: "delete_script", scriptId: "script-1" }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteScript).toHaveBeenCalledWith(
      "project-1",
      "script-1",
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("deletes multiple draft scripts atomically", async () => {
    mocks.deleteScripts.mockResolvedValue([
      { id: "script-1" },
      { id: "script-2" },
    ]);

    const response = await POST(
      request({
        action: "delete_scripts",
        scriptIds: ["script-1", "script-2"],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteScripts).toHaveBeenCalledWith(
      "project-1",
      ["script-1", "script-2"],
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

    it("regenerates scripts for one highlight with the latest settings", async () => {
      mocks.getPipelineProject.mockResolvedValue({
        currentRunId: "run-1",
        productionConfig: {
          ...defaultProductionConfig,
          scriptCount: 2,
          scriptDurationMin: 20,
          scriptDurationMax: 45,
        },
        highlights: [{
          id: "highlight-1",
          arcId: "arc-1",
          anchor: { openingSummary: "高光开头" },
        }],
      });
      mocks.getCreativeSettings.mockResolvedValue({
        prerollCreativeSystemPrompt: "最新创意提示词",
        prerollScriptSystemPrompt: "最新脚本提示词",
      });
      mocks.listPipelineJobs.mockResolvedValue([{
        id: "old-script-job",
        kind: "scripts",
        status: "completed",
        updatedAt: "2026-08-17T00:00:00.000Z",
        input: {
          highlightId: "highlight-1",
          prerollType: "strong_acquisition",
        },
      }]);

      const response = await POST(
        request({
          action: "regenerate_scripts",
          highlightId: "highlight-1",
          prerollType: "strong_acquisition",
          productionConfig: {
            ...defaultProductionConfig,
            scriptCount: 2,
            scriptDurationMin: 20,
            scriptDurationMax: 45,
            expressionType: "uncanny_spectacle",
          },
        }),
        { params: Promise.resolve({ projectId: "project-1" }) },
      );

      expect(response.status).toBe(202);
      expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith({
        projectId: "project-1",
        kind: "scripts",
        input: expect.objectContaining({
          runId: "run-1",
          arcId: "arc-1",
          highlightId: "highlight-1",
          scriptCount: 2,
          scriptDurationMin: 20,
          scriptDurationMax: 45,
          prerollType: "strong_acquisition",
          expressionType: "uncanny_spectacle",
          prerollCreativeSystemPrompt: "最新创意提示词",
          prerollScriptSystemPrompt: "最新脚本提示词",
        }),
      });
        expect(mocks.saveProductionPlan).toHaveBeenCalledWith(
          "project-1",
          expect.objectContaining({
            expressionType: "uncanny_spectacle",
          }),
          expect.any(Object),
          "strong_acquisition",
        );
    });

  it("confirms scripts without compiling video prompts", async () => {
    mocks.confirmScripts.mockResolvedValue([{
      id: "script-1",
      highlightId: "highlight-1",
    }]);
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "new_character_assets",
        videoModel: "seedance_2_0_fast",
        videoResolution: "1080p",
        videoRatio: "9:16",
        generateSubtitles: false,
      },
    });

    const response = await POST(
      request({ action: "confirm_scripts", scriptIds: ["script-1"] }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.confirmScripts).toHaveBeenCalledWith(
      "project-1",
      ["script-1"],
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("prioritizes workbench settings over production defaults when compiling prompts", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        ...defaultProductionConfig,
        characterMode: "text_to_video",
        videoModel: "seedance_2_0_fast",
        videoResolution: "1080p",
        videoRatio: "16:9",
        generateSubtitles: false,
      },
      scripts: [{
      id: "script-1",
      highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        shots: [],
      }],
    });

    const response = await POST(
      request({
        action: "compile_video_prompts",
        scriptIds: ["script-1"],
        generationSettings: [{
          scriptId: "script-1",
          targetDuration: 15,
          videoModel: "seedance_2_5",
          videoResolution: "720p",
          videoRatio: "9:16",
          generateSubtitles: true,
        }],
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(
      mocks.enqueuePipelineJob,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          targetDuration: 15,
          videoModel: "seedance_2_5",
          videoResolution: "720p",
          videoRatio: "9:16",
          generateSubtitles: true,
          videoPromptSystemPrompt:
            "生视频提示词",
        }),
      }),
    );
  });

  it("allows prompt compilation while an unrelated script job is running", async () => {
    mocks.listPipelineJobs.mockResolvedValue([{
      id: "scripts-job",
      kind: "scripts",
      status: "running",
      progress: 20,
      input: { highlightId: "highlight-1" },
    }]);
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        ...defaultProductionConfig,
        characterMode: "text_to_video",
      },
      scripts: [{
        id: "script-1",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        shots: [],
      }],
    });

    const response = await POST(
      request({
        action: "compile_video_prompts",
        scriptIds: ["script-1"],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "preroll",
        input: expect.objectContaining({
          scriptId: "script-1",
          prerollPhase: "compile_prompt",
        }),
      }),
    );
  });

  it("starts another prompt compilation even when one is running", async () => {
    mocks.listPipelineJobs.mockResolvedValue([{
      id: "prompt-job",
      kind: "preroll",
      status: "queued",
      progress: 0,
      input: {
        scriptId: "script-1",
        prerollPhase: "compile_prompt",
      },
    }]);
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        ...defaultProductionConfig,
        characterMode: "text_to_video",
      },
      scripts: [{
        id: "script-1",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
      }],
    });

    const response = await POST(
      request({
        action: "compile_video_prompts",
        scriptIds: ["script-1"],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "preroll",
        input: expect.objectContaining({
          scriptId: "script-1",
          prerollPhase: "compile_prompt",
        }),
      }),
    );
    expect(mocks.runPipelineJobNow).toHaveBeenCalledWith("job-1");
  });

  it("persists edited prompts before video submission", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      productionConfig: defaultProductionConfig,
      scripts: [{
        id: "script-1",
        reviewStatus: "confirmed",
        videoPromptPlan: {
          targetDuration: 15,
          generateSubtitles: false,
          segments: [{
            index: 0,
            duration: 15,
            prompt: "初始提示词",
            referenceAssets: [],
          }],
        },
      }],
    });

    const response = await POST(
      request({
        action: "update_video_prompt",
        scriptId: "script-1",
        segments: [{
          index: 0,
          submittedPrompt: "用户确认后的提示词",
        }],
        characterSelections: [],
        generationSettings: {
          targetDuration: 15,
          videoModel: "seedance_2_0",
          videoResolution: "1080p",
          videoRatio: "16:9",
          generateSubtitles: false,
        },
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.saveEditedVideoPrompt).toHaveBeenCalledWith(
      "project-1",
      "script-1",
      {
        segments: [{
          index: 0,
          submittedPrompt: "用户确认后的提示词",
        }],
        referenceBindings: [],
        referenceUrls: [],
        generationSettings: {
          targetDuration: 15,
          videoModel: "seedance_2_0",
          videoResolution: "1080p",
          videoRatio: "16:9",
          generateSubtitles: false,
        },
      },
    );
  });

  it("rejects a model switch when an existing prompt segment exceeds its limit", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      productionConfig: defaultProductionConfig,
      scripts: [{
        id: "script-1",
        reviewStatus: "confirmed",
        videoPromptPlan: {
          targetDuration: 20,
          generateSubtitles: false,
          segments: [{
            index: 0,
            duration: 20,
            prompt: "20 秒完整镜头提示词",
            referenceAssets: [],
          }],
        },
      }],
    });

    const response = await POST(
      request({
        action: "update_video_prompt",
        scriptId: "script-1",
        segments: [{
          index: 0,
          submittedPrompt: "20 秒完整镜头提示词",
        }],
        characterSelections: [],
        generationSettings: {
          targetDuration: 20,
          videoModel: "seedance_2_0",
          videoResolution: "720p",
          videoRatio: "9:16",
          generateSubtitles: false,
        },
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringContaining("超过 15 秒"),
      }),
    );
    expect(mocks.saveEditedVideoPrompt).not.toHaveBeenCalled();
  });

  it("blocks video submission while prompts await confirmation", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: defaultProductionConfig,
      scripts: [{
        id: "script-1",
        title: "待确认提示词脚本",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        videoPromptStatus: "ready",
        videoPromptPlan: {
          reviewStatus: "draft",
          maxClipDurationSec: 30,
          segments: [{
            duration: 15,
            prompt: "待确认提示词",
            referenceAssets: [],
          }],
        },
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("submits Seedance only after the compiled prompt is explicitly confirmed", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "text_to_video",
        videoModel: "default",
        videoResolution: "720p",
        videoRatio: "9:16",
      },
      scripts: [{
        id: "script-1",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        videoPromptStatus: "ready",
        videoPromptSourceHash: "script-hash",
        videoPromptPlan: {
          maxClipDurationSec: 15,
          reviewStatus: "confirmed",
          segments: [{
            duration: 15,
            submittedPrompt: "已确认提示词",
            referenceAssets: [
              "https://example.com/role.jpg",
            ],
          }],
        },
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith({
      projectId: "project-1",
      kind: "preroll",
      input: {
        runId: "run-1",
        scriptId: "script-1",
        highlightId: "highlight-1",
        characterMode: "text_to_video",
        videoModel: "default",
        targetDuration: 15,
        videoResolution: "720p",
        videoRatio: "9:16",
        generateSubtitles: false,
        referenceUrls: [
          "https://example.com/role.jpg",
        ],
        renderId: expect.stringMatching(
          /^render-script-1-/,
        ),
        verificationRequired: true,
        prerollPhase: "segments",
        autoRun: true,
      },
    });
  });

  it("rejects video submission after the active System Prompt changes", async () => {
    mocks.videoPromptMatchesScript.mockReturnValue(false);
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "text_to_video",
        videoModel: "default",
        videoResolution: "720p",
        videoRatio: "9:16",
        generateSubtitles: false,
      },
      scripts: [{
        id: "script-1",
        title: "旧提示词脚本",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        videoPromptStatus: "ready",
        videoPromptSourceHash: "script-hash",
        videoPromptPlan: {
          maxClipDurationSec: 15,
          reviewStatus: "confirmed",
          segments: [{
            duration: 15,
            submittedPrompt: "已确认提示词",
            referenceAssets: [],
          }],
        },
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringContaining(
          "当前字幕模式或 System Prompt 版本不一致",
        ),
      }),
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("rejects an old 15-second prompt plan for Seedance 2.5", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "text_to_video",
        videoModel: "seedance_2_5",
        videoResolution: "720p",
      },
      scripts: [{
        id: "script-1",
        title: "30 秒前贴",
        duration: 30,
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        videoPromptStatus: "ready",
        videoPromptSourceHash: "script-hash",
        videoPromptPlan: {
          maxClipDurationSec: 15,
          reviewStatus: "confirmed",
          segments: [
            {
              duration: 15,
              submittedPrompt: "第一段",
              referenceAssets: [],
            },
            {
              duration: 15,
              submittedPrompt: "第二段",
              referenceAssets: [],
            },
          ],
        },
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringContaining("当前模型时长上限不一致"),
      }),
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("blocks only a drama-character video request when its person has no image", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "drama_character",
        videoModel: "default",
        videoResolution: "720p",
      },
      scripts: [{
        id: "script-1",
        title: "关联人物脚本",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        videoPromptStatus: "ready",
        videoPromptSourceHash: "script-hash",
        videoPromptPlan: {
          maxClipDurationSec: 15,
          reviewStatus: "confirmed",
          segments: [{
            duration: 15,
            submittedPrompt: "已确认提示词",
            referenceAssets: [],
          }],
        },
        shots: [{ characters: ["林夏"] }],
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringContaining("林夏"),
      }),
    );
    expect(mocks.enqueuePipelineJob).not.toHaveBeenCalled();
  });

  it("uses the selected confirmed image for a drama-character video", async () => {
    mocks.getImageAssetsByIds.mockResolvedValue([{
      id: "image-1",
      sourceUrl: "https://example.com/lin-xia.jpg",
      metadata: {},
    }]);
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "drama_character",
        videoModel: "default",
        videoResolution: "720p",
      },
      scripts: [{
        id: "script-1",
        title: "关联人物脚本",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        videoPromptStatus: "ready",
        videoPromptSourceHash: "script-hash",
        videoPromptPlan: {
          maxClipDurationSec: 15,
          reviewStatus: "confirmed",
          segments: [{
            duration: 15,
            submittedPrompt: "已确认提示词",
            referenceAssets: [],
          }],
        },
        shots: [{ characters: ["林夏"] }],
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
        characterSelections: [{
          scriptId: "script-1",
          characterName: "林夏",
          assetIds: ["image-1"],
        }],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(202);
    await expect(response.clone().json()).resolves.toEqual(
      expect.objectContaining({
        jobs: [expect.objectContaining({ id: "job-1" })],
      }),
    );
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          referenceUrls: ["https://example.com/lin-xia.jpg"],
        }),
      }),
    );
  });

  it("uses an active private avatar asset for video generation", async () => {
    mocks.getImageAssetsByIds.mockResolvedValue([{
      id: "image-1",
      name: "林夏虚拟人像",
      sourceUrl: "https://example.com/lin-xia.jpg",
      metadata: {
        avatarAssetId: "avatar-1",
        avatarStatus: "active",
      },
    }]);
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "drama_character",
        videoModel: "default",
        videoResolution: "720p",
      },
      scripts: [{
        id: "script-1",
        title: "虚拟人像脚本",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        videoPromptStatus: "ready",
        videoPromptSourceHash: "script-hash",
        videoPromptPlan: {
          maxClipDurationSec: 15,
          reviewStatus: "confirmed",
          segments: [{
            duration: 15,
            submittedPrompt: "已确认提示词",
            referenceAssets: [],
          }],
        },
        shots: [{ characters: ["林夏"] }],
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
        characterSelections: [{
          scriptId: "script-1",
          characterName: "林夏",
          assetIds: ["image-1"],
        }],
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          referenceUrls: ["asset://avatar-1"],
        }),
      }),
    );
  });

  it("blocks a private avatar that is still processing", async () => {
    mocks.getImageAssetsByIds.mockResolvedValue([{
      id: "image-1",
      name: "林夏虚拟人像",
      sourceUrl: "https://example.com/lin-xia.jpg",
      metadata: {
        avatarAssetId: "avatar-1",
        avatarStatus: "processing",
      },
    }]);
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "drama_character",
        videoModel: "default",
        videoResolution: "720p",
      },
      scripts: [{
        id: "script-1",
        title: "虚拟人像脚本",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        videoPromptStatus: "ready",
        videoPromptSourceHash: "script-hash",
        videoPromptPlan: {
          maxClipDurationSec: 15,
          reviewStatus: "confirmed",
          segments: [{
            duration: 15,
            submittedPrompt: "已确认提示词",
            referenceAssets: [],
          }],
        },
        shots: [{ characters: ["林夏"] }],
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
        characterSelections: [{
          scriptId: "script-1",
          characterName: "林夏",
          assetIds: ["image-1"],
        }],
      }),
      {
        params: Promise.resolve({
          projectId: "project-1",
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringContaining(
          "素材仍在处理中",
        ),
      }),
    );
    expect(
      mocks.enqueuePipelineJob,
    ).not.toHaveBeenCalled();
  });

  it("allows an explicit text-to-video choice without a character image", async () => {
    mocks.getPipelineProject.mockResolvedValue({
      currentRunId: "run-1",
      productionConfig: {
        characterMode: "drama_character",
        videoModel: "default",
        videoResolution: "720p",
      },
      scripts: [{
        id: "script-1",
        title: "文生视频脚本",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        duration: 15,
        videoPromptStatus: "ready",
        videoPromptSourceHash: "script-hash",
        videoPromptPlan: {
          maxClipDurationSec: 15,
          reviewStatus: "confirmed",
          segments: [{
            duration: 15,
            submittedPrompt: "已确认提示词",
            referenceAssets: [],
          }],
        },
        shots: [{ characters: ["林夏"] }],
      }],
      renders: [],
    });

    const response = await POST(
      request({
        action: "generate_prerolls",
        scriptIds: ["script-1"],
        characterSelections: [{
          scriptId: "script-1",
          characterName: "林夏",
          assetIds: [],
          useTextToVideo: true,
        }],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          characterMode: "text_to_video",
          referenceUrls: [],
          renderId: expect.stringMatching(
            /^render-script-1-/,
          ),
          verificationRequired: true,
        }),
      }),
    );
  });
});
