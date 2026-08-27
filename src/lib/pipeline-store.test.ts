import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { defaultProductionConfig } from "./production-config";
import {
  activateRenderRevisionState,
  applyNextProductionPlan,
  applyActiveRunForEntry,
  appendRenderRevision,
  ensureRenderRevisionHistory,
  invalidateCompositionsForRenderVersion,
  mergeRenderVersion,
  normalizeRenderArtifacts,
  reconcileCompositionJobResults,
  reconcileRunProductionEntries,
  resolvePipelineWorkspaceProject,
  resolveCompositionVersion,
  scriptContentHash,
  type RenderVariant,
  videoPromptMatchesScript,
  videoPromptSystemPromptHash,
} from "./pipeline-store";

describe("next production plan isolation", () => {
  it("does not overwrite the active run snapshot", () => {
    const currentConfig = {
      ...defaultProductionConfig,
      videoResolution: "720p" as const,
      videoRatio: "9:16" as const,
    };
    const nextConfig = {
      ...currentConfig,
      expressionType: "uncanny_spectacle" as const,
      expressionTypes: ["uncanny_spectacle" as const],
      prerollTypes: ["strong_acquisition" as const],
      videoResolution: "1080p" as const,
      videoRatio: "16:9" as const,
    };
    const run = {
      id: "run-current",
      productionConfig: currentConfig,
      updatedAt: "2026-08-20T08:52:00.000Z",
    };
    const project = {
      currentRunId: run.id,
      productionConfig: currentConfig,
      productionPlans: {},
      runs: [run],
      updatedAt: run.updatedAt,
    };

    applyNextProductionPlan(
      project as never,
      nextConfig,
      { sourceDuration: 600 } as never,
      "strong_acquisition",
      ["asset-1"],
      "2026-08-22T02:00:00.000Z",
    );

    expect(run.productionConfig).toEqual(currentConfig);
    expect(run.updatedAt).toBe("2026-08-20T08:52:00.000Z");
    expect(project.productionConfig).toEqual(currentConfig);
    expect(project.productionPlans).toMatchObject({
      full_drama: {
        productionConfig: nextConfig,
        prerollType: "strong_acquisition",
        sourceAssetIds: ["asset-1"],
        updatedAt: "2026-08-22T02:00:00.000Z",
      },
    });
  });
});

describe("pipeline workspace run isolation", () => {
  it("shares analysis and arcs without borrowing another entry's run identity", () => {
    const analysis = {
      title: "Shared analysis",
      clips: [],
    };
    const character = {
      id: "character-1",
      name: "Lead",
    };
    const arc = {
      id: "arc-1",
      title: "Shared arc",
    };
    const sharedRun = {
      id: "run-full-drama",
      projectId: "project-1",
      sourceAssetIds: ["asset-1"],
      status: "completed",
      productionConfig: {
        ...defaultProductionConfig,
        productionEntry: "full_drama",
      },
      analysis,
      characters: [character],
      arcs: [arc],
      highlights: [{ id: "highlight-foreign" }],
      scripts: [{ id: "script-foreign" }],
      renders: [{ id: "render-foreign" }],
      compositions: [{ id: "composition-foreign" }],
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T01:00:00.000Z",
    };
    const project = {
      projectId: "project-1",
      currentRunId: sharedRun.id,
      status: sharedRun.status,
      productionConfig: sharedRun.productionConfig,
      analysis,
      characters: [character],
      arcs: [arc],
      highlights: sharedRun.highlights,
      scripts: sharedRun.scripts,
      renders: sharedRun.renders,
      compositions: sharedRun.compositions,
      runs: [sharedRun],
      updatedAt: sharedRun.updatedAt,
    };

    const workspace = resolvePipelineWorkspaceProject(
      project as never,
      "uploaded_highlights",
    );

    expect(workspace).toMatchObject({
      analysis,
      characters: [character],
      arcs: [arc],
      highlights: [],
      scripts: [],
      renders: [],
      compositions: [],
    });
    expect(workspace?.currentRunId).toBeUndefined();
    expect(workspace?.productionConfig).toBeUndefined();
  });
});

describe("pipeline run workflow reconciliation", () => {
  it("uses the run task snapshot when a stale plan labels the run incorrectly", () => {
    const run = {
      id: "run-highlight-preroll",
      productionConfig: {
        ...defaultProductionConfig,
        productionEntry: "full_drama",
      },
    };
    const project = {
      currentRunId: run.id,
      productionConfig: run.productionConfig,
      runs: [run],
    };

    reconcileRunProductionEntries(
      [project] as never,
      [{
        id: "job-1",
        runId: run.id,
        input: {
          productionEntry: "uploaded_highlights",
        },
      }] as never,
    );

    expect(
      run.productionConfig.productionEntry,
    ).toBe("uploaded_highlights");
    expect(
      project.productionConfig.productionEntry,
    ).toBe("uploaded_highlights");
  });

  it("does not guess when a run contains conflicting task snapshots", () => {
    const run = {
      id: "run-mixed",
      productionConfig: {
        ...defaultProductionConfig,
        productionEntry: "full_drama",
      },
    };

    reconcileRunProductionEntries(
      [{ runs: [run] }] as never,
      [{
        id: "job-1",
        runId: run.id,
        input: {
          productionEntry: "batch_highlights",
        },
      }, {
        id: "job-2",
        runId: run.id,
        input: {
          productionEntry: "uploaded_highlights",
        },
      }] as never,
    );

    expect(
      run.productionConfig.productionEntry,
    ).toBe("full_drama");
  });
});

describe("preroll render versions", () => {
  it("initializes a generated revision for an existing current video", () => {
    const render: RenderVariant = {
      id: "render-1",
      projectId: "project-1",
      scriptId: "script-1",
      status: "completed",
      videoUrl: "https://example.com/original.mp4",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    };

    ensureRenderRevisionHistory(render);

    expect(render.currentRevisionId).toBe("render-1-revision-1");
    expect(render.revisions).toEqual([{
      id: "render-1-revision-1",
      videoUrl: "https://example.com/original.mp4",
      operation: "generated",
      createdAt: "2026-08-20T00:00:00.000Z",
    }]);
  });

  it("appends immutable child revisions and can branch after rollback", () => {
    const render: RenderVariant = {
      id: "render-1",
      projectId: "project-1",
      scriptId: "script-1",
      status: "completed",
      videoUrl: "https://example.com/original.mp4",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    };
    ensureRenderRevisionHistory(render);

    appendRenderRevision(
      render,
      {
        id: "revision-enhance",
        videoUrl: "https://example.com/enhanced.mp4",
        operation: "enhance",
        settings: { resolution: "1080p" },
      },
      "2026-08-20T01:00:00.000Z",
    );
    appendRenderRevision(
      render,
      {
        id: "revision-subtitles",
        videoUrl: "https://example.com/subtitles.mp4",
        operation: "add_subtitles",
        subtitleVerificationStatus: "verified",
      },
      "2026-08-20T02:00:00.000Z",
    );

    activateRenderRevisionState(
      render,
      "revision-enhance",
      "2026-08-20T03:00:00.000Z",
    );
    appendRenderRevision(
      render,
      {
        id: "revision-erase",
        videoUrl: "https://example.com/erased.mp4",
        operation: "erase_subtitles",
      },
      "2026-08-20T04:00:00.000Z",
    );

    expect(render.videoUrl).toBe("https://example.com/erased.mp4");
    expect(render.currentRevisionId).toBe("revision-erase");
    expect(render.revisions).toEqual([
      expect.objectContaining({
        id: "render-1-revision-1",
      }),
      expect.objectContaining({
        id: "revision-enhance",
        parentRevisionId: "render-1-revision-1",
      }),
      expect.objectContaining({
        id: "revision-subtitles",
        parentRevisionId: "revision-enhance",
      }),
      expect.objectContaining({
        id: "revision-erase",
        parentRevisionId: "revision-enhance",
      }),
    ]);
  });

  it("replaces the current video URL when a later operation finishes", () => {
    const current = {
      id: "render-1",
      projectId: "project-1",
      scriptId: "script-1",
      status: "completed",
      videoUrl:
        "https://example.com/video-add_subtitles-output.mp4",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    };

    mergeRenderVersion(
      current,
      {
        status: "completed",
        videoUrl: "https://example.com/new-original.mp4",
      },
      "2026-08-21T00:00:00.000Z",
    );

    expect(current).toMatchObject({
      videoUrl: "https://example.com/new-original.mp4",
      updatedAt: "2026-08-21T00:00:00.000Z",
    });
  });

  it("keeps only the newest render while retaining historical composition output", () => {
    const renders = [{
      id: "render-old",
      projectId: "project-1",
      scriptId: "script-1",
      status: "completed",
      videoUrl: "https://example.com/old.mp4",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    }, {
      id: "render-current",
      projectId: "project-1",
      scriptId: "script-1",
      status: "completed",
      videoUrl: "https://example.com/current.mp4",
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    }];
    const compositions = [{
      id: "composition-1",
      projectId: "project-1",
      renderId: "render-old",
      highlightId: "highlight-1",
      status: "completed",
      videoUrl: "https://example.com/old-composition.mp4",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:30:00.000Z",
    }];

    normalizeRenderArtifacts(renders, compositions);

    expect(renders).toEqual([
      expect.objectContaining({
        id: "render-current",
        videoUrl: "https://example.com/current.mp4",
      }),
    ]);
    expect(compositions[0]).toMatchObject({
      status: "stale",
      videoUrl: "https://example.com/old-composition.mp4",
    });
  });

  it("keeps a composition made from a verified subtitle video", () => {
    const renders = [{
      id: "render-1",
      projectId: "project-1",
      scriptId: "script-1",
      status: "completed",
      videoUrl:
        "https://example.com/video-add_subtitles-output.mp4",
      processedOperation: "add_subtitles" as const,
      subtitleVerificationStatus: "verified" as const,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:30:00.000Z",
    }];
    const compositions = [{
      id: "composition-1",
      projectId: "project-1",
      renderId: "render-1",
      highlightId: "highlight-1",
      status: "completed",
      videoUrl: "https://example.com/new-composition.mp4",
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    }];

    normalizeRenderArtifacts(renders, compositions);

    expect(compositions[0]).toMatchObject({
      status: "completed",
      videoUrl: "https://example.com/new-composition.mp4",
      sourceRenderVideoUrl:
        "https://example.com/video-add_subtitles-output.mp4",
    });
  });

  it("recovers a completed composition into the job production run", () => {
    const compositionId = "composition-1";
    const targetComposition = {
      id: compositionId,
      projectId: "project-1",
      renderId: "render-1",
      highlightId: "highlight-1",
      status: "running",
      createdAt: "2026-08-25T13:49:34.008Z",
      updatedAt: "2026-08-25T13:49:34.008Z",
    };
    const misplacedComposition = {
      ...targetComposition,
      status: "completed",
      videoUrl: "https://example.com/final.mp4",
      objectKey: "compositions/final.mp4",
      updatedAt: "2026-08-25T13:54:35.510Z",
    };
    const targetRun = {
      id: "run-target",
      status: "composing",
      compositions: [targetComposition],
    };
    const wrongRun = {
      id: "run-wrong",
      status: "completed",
      compositions: [misplacedComposition],
    };
    const project = {
      projectId: "project-1",
      currentRunId: targetRun.id,
      status: "composing",
      compositions: [targetComposition],
      runs: [wrongRun, targetRun],
    };

    reconcileCompositionJobResults(
      [project] as never,
      [{
        id: "job-compose-1",
        projectId: "project-1",
        runId: targetRun.id,
        kind: "compose",
        status: "completed",
        progress: 100,
        upstreamId: "upstream-1",
        input: {
          compositionId,
          renderId: "render-1",
          highlightId: "highlight-1",
          renderVideoUrl: "https://example.com/preroll.mp4",
          sourceRenderSubtitleVerified: true,
        },
        result: {
          videoUrl: "https://example.com/final.mp4",
        },
        attempts: 1,
        createdAt: "2026-08-25T13:49:33.196Z",
        updatedAt: "2026-08-25T13:54:35.609Z",
      }],
    );

    expect(project.compositions[0]).toMatchObject({
      id: compositionId,
      status: "completed",
      videoUrl: "https://example.com/final.mp4",
      objectKey: "compositions/final.mp4",
      sourceRenderVideoUrl: "https://example.com/preroll.mp4",
      sourceRenderSubtitleVerified: true,
    });
    expect(targetRun.compositions[0]).toEqual(
      project.compositions[0],
    );
    expect(wrongRun.compositions).toEqual([]);
  });

  it("archives compositions only when the effective video changes", () => {
    const composition = {
      id: "composition-1",
      projectId: "project-1",
      renderId: "render-1",
      highlightId: "highlight-1",
      status: "completed",
      videoUrl: "https://example.com/composition.mp4",
      sourceRenderVideoUrl:
        "https://example.com/original.mp4",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:30:00.000Z",
    };
    const render = {
      id: "render-1",
      projectId: "project-1",
      scriptId: "script-1",
      status: "completed",
      videoUrl: "https://example.com/original.mp4",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    };

    invalidateCompositionsForRenderVersion(
      [composition],
      render,
      render.videoUrl,
      "2026-08-21T00:00:00.000Z",
    );
    expect(composition.status).toBe("completed");

    render.videoUrl =
      "https://example.com/video-add_subtitles-output.mp4";
    invalidateCompositionsForRenderVersion(
      [composition],
      render,
      "https://example.com/original.mp4",
      "2026-08-21T00:00:00.000Z",
    );
    expect(composition).toMatchObject({
      status: "stale",
      videoUrl: "https://example.com/composition.mp4",
    });
  });

  it("archives a late composition result made from an older video", () => {
    const result = resolveCompositionVersion(
      {
        status: "completed",
        videoUrl: "https://example.com/old-composition.mp4",
        sourceRenderVideoUrl:
          "https://example.com/original.mp4",
      },
      {
        videoUrl:
          "https://example.com/video-add_subtitles-output.mp4",
      },
    );

    expect(result).toEqual({
      status: "stale",
      videoUrl: "https://example.com/old-composition.mp4",
      sourceRenderVideoUrl:
        "https://example.com/original.mp4",
    });
  });
});

describe("video prompt revision", () => {
  it("invalidates a compiled prompt when the subtitle mode changes", () => {
    const script = {
      title: "前贴脚本",
      duration: 15,
      hookTitleCard: "",
      voiceover: "旁白",
      transition: "硬切",
      shots: [],
    };

    expect(
      scriptContentHash(script, true),
    ).not.toBe(
      scriptContentHash(script, false),
    );
  });
});

describe("videoPromptMatchesScript", () => {
  const script = {
    title: "前贴脚本",
    duration: 15,
    hookTitleCard: "",
    voiceover: "旁白",
    transition: "硬切",
    shots: [
      {
        time: "0-3s",
        framing: "中景",
        visual: "开场",
        dialogue: "",
        characters: ["江宸"],
      },
    ],
  };

  it("accepts a prompt fingerprinted with the current algorithm", () => {
    expect(
      videoPromptMatchesScript(
        {
          ...script,
          videoPromptSourceHash: scriptContentHash(script, false),
        },
        false,
      ),
    ).toBe(true);
  });

  it("accepts a legacy prompt hashed before generateSubtitles joined the fingerprint", () => {
    const legacyHash = scriptContentHash(
      // The legacy hash omits generateSubtitles, matching neither the true nor
      // false current hash. Simulate it by building the exact legacy payload.
      script,
      false,
    );
    // Recreate the pre-migration hash (no generateSubtitles key at all).
    const preMigration = createHash("sha256")
      .update(JSON.stringify({
        title: script.title,
        duration: script.duration,
        hookTitleCard: script.hookTitleCard,
        voiceover: script.voiceover,
        transition: script.transition,
        shots: script.shots,
      }))
      .digest("hex");

    expect(preMigration).not.toBe(legacyHash);
    expect(
      videoPromptMatchesScript(
        { ...script, videoPromptSourceHash: preMigration },
        false,
      ),
    ).toBe(true);
    expect(
      videoPromptMatchesScript(
        { ...script, videoPromptSourceHash: preMigration },
        true,
      ),
    ).toBe(true);
  });

  it("rejects a prompt whose script content genuinely changed", () => {
    const staleHash = scriptContentHash(
      { ...script, voiceover: "旧旁白" },
      false,
    );
    expect(
      videoPromptMatchesScript(
        { ...script, videoPromptSourceHash: staleHash },
        false,
      ),
    ).toBe(false);
  });

  it("rejects a prompt compiled with another System Prompt or subtitle mode", () => {
    const sourceHash = scriptContentHash(script, false);
    const systemPromptHash =
      videoPromptSystemPromptHash("无字幕版本 V2");
    const compiled = {
      ...script,
      videoPromptSourceHash: sourceHash,
      videoPromptPlan: {
        systemPromptHash,
        generateSubtitles: false,
      },
    };

    expect(
      videoPromptMatchesScript(
        compiled as never,
        false,
        systemPromptHash,
      ),
    ).toBe(true);
    expect(
      videoPromptMatchesScript(
        compiled as never,
        false,
        videoPromptSystemPromptHash("无字幕版本 V3"),
      ),
    ).toBe(false);
    expect(
      videoPromptMatchesScript(
        compiled as never,
        true,
        systemPromptHash,
      ),
    ).toBe(false);
  });

  it("rejects a script that never compiled a prompt", () => {
    expect(
      videoPromptMatchesScript(
        { ...script, videoPromptSourceHash: undefined },
        false,
      ),
    ).toBe(false);
  });
});

describe("applyActiveRunForEntry", () => {
  const makeRun = (
    id: string,
    productionEntry: string,
    updatedAt: string,
    scriptIds: string[],
  ) => ({
    id,
    productionConfig: {
      ...defaultProductionConfig,
      productionEntry,
    },
    updatedAt,
    status: "completed",
    planReviewRequired: false,
    prerollType: "story_extended",
    sourceAssetIds: [],
    characters: [],
    arcs: [],
    highlights: [],
    scripts: scriptIds.map((scriptId) => ({ id: scriptId })),
    renders: [],
    compositions: [],
  });

  it("switches the active run to the viewed entry and hydrates its scripts", () => {
    const drama = makeRun(
      "run-drama",
      "full_drama",
      "2026-08-20T13:22:27.731Z",
      ["script-drama"],
    );
    const uploaded = makeRun(
      "run-uploaded",
      "uploaded_highlights",
      "2026-08-21T01:23:33.886Z",
      ["script-uploaded"],
    );
    const project = {
      currentRunId: uploaded.id,
      scripts: [...uploaded.scripts],
      runs: [drama, uploaded],
    };

    const switched = applyActiveRunForEntry(
      project as never,
      "full_drama",
    );

    expect(switched).toBe(true);
    expect(project.currentRunId).toBe("run-drama");
    expect(
      project.scripts.map((script) => script.id),
    ).toEqual(["script-drama"]);
  });

  it("does not switch when the viewed entry is already active", () => {
    const uploaded = makeRun(
      "run-uploaded",
      "uploaded_highlights",
      "2026-08-21T01:23:33.886Z",
      ["script-uploaded"],
    );
    const project = {
      currentRunId: uploaded.id,
      scripts: [...uploaded.scripts],
      runs: [uploaded],
    };

    const switched = applyActiveRunForEntry(
      project as never,
      "uploaded_highlights",
    );

    expect(switched).toBe(false);
    expect(project.currentRunId).toBe("run-uploaded");
    expect(
      project.scripts.map((script) => script.id),
    ).toEqual(["script-uploaded"]);
  });

  it("keeps an explicitly selected older run active within the same entry", () => {
    const older = makeRun(
      "run-older",
      "full_drama",
      "2026-08-19T10:20:14.326Z",
      ["script-older"],
    );
    const newer = makeRun(
      "run-newer",
      "full_drama",
      "2026-08-20T13:22:27.731Z",
      ["script-newer"],
    );
    const project = {
      currentRunId: older.id,
      scripts: [...older.scripts],
      runs: [older, newer],
    };

    const switched = applyActiveRunForEntry(
      project as never,
      "full_drama",
    );

    expect(switched).toBe(false);
    expect(project.currentRunId).toBe("run-older");
    expect(
      project.scripts.map((script) => script.id),
    ).toEqual(["script-older"]);
  });

  it("leaves the active run untouched when no run matches the entry", () => {
    const uploaded = makeRun(
      "run-uploaded",
      "uploaded_highlights",
      "2026-08-21T01:23:33.886Z",
      ["script-uploaded"],
    );
    const project = {
      currentRunId: uploaded.id,
      scripts: [...uploaded.scripts],
      runs: [uploaded],
    };

    const switched = applyActiveRunForEntry(
      project as never,
      "batch_highlights",
    );

    expect(switched).toBe(false);
    expect(project.currentRunId).toBe("run-uploaded");
  });

  it("activates the most recent run when several share the entry", () => {
    const older = makeRun(
      "run-older",
      "full_drama",
      "2026-08-19T10:20:14.326Z",
      ["script-older"],
    );
    const newer = makeRun(
      "run-newer",
      "full_drama",
      "2026-08-20T13:22:27.731Z",
      ["script-newer"],
    );
    const active = makeRun(
      "run-active",
      "uploaded_highlights",
      "2026-08-21T01:23:33.886Z",
      ["script-active"],
    );
    const project = {
      currentRunId: active.id,
      scripts: [...active.scripts],
      runs: [older, newer, active],
    };

    const switched = applyActiveRunForEntry(
      project as never,
      "full_drama",
    );

    expect(switched).toBe(true);
    expect(project.currentRunId).toBe("run-newer");
    expect(
      project.scripts.map((script) => script.id),
    ).toEqual(["script-newer"]);
  });
});
