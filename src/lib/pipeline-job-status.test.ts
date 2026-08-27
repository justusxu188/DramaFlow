import { describe, expect, it } from "vitest";
import {
  latestPipelineJobs,
  pipelineJobStage,
  pipelineStageJobs,
} from "./pipeline-job-status";
import type { PipelineJob } from "./pipeline-store";

function job(
  patch: Partial<PipelineJob> & Pick<PipelineJob, "id" | "kind" | "status">,
): PipelineJob {
  return {
    projectId: "project-1",
    runId: "run-1",
    progress: 0,
    input: {},
    attempts: 0,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    ...patch,
  };
}

describe("pipeline job status", () => {
  it("ignores an older failure after the same script succeeds", () => {
    const jobs = [
      job({
        id: "failed",
        kind: "preroll",
        status: "failed",
        input: { scriptId: "script-1", prerollPhase: "segments" },
      }),
      job({
        id: "completed",
        kind: "preroll",
        status: "completed",
        input: { scriptId: "script-1", prerollPhase: "segments" },
        updatedAt: "2026-08-21T01:00:00.000Z",
      }),
    ];

    expect(latestPipelineJobs(jobs)).toEqual([jobs[1]]);
    expect(
      pipelineStageJobs(jobs, "prerolls").filter(
        (item) => item.status === "failed",
      ),
    ).toHaveLength(0);
  });

  it("separates prompt compilation from video generation", () => {
    const prompt = job({
      id: "prompt",
      kind: "preroll",
      status: "running",
      input: {
        scriptId: "script-1",
        prerollPhase: "compile_prompt",
      },
    });
    const video = job({
      id: "video",
      kind: "preroll",
      status: "running",
      input: {
        scriptId: "script-1",
        prerollPhase: "segments",
      },
    });

    expect(pipelineJobStage(prompt)).toBe("scripts");
    expect(pipelineJobStage(video)).toBe("prerolls");
  });

  it("keeps post-production operations visible in the preroll stage", () => {
    const recognition = job({
      id: "recognition",
      kind: "post_production",
      status: "completed",
      input: {
        renderId: "render-1",
        operation: "asr",
      },
    });
    const enhancement = job({
      id: "enhancement",
      kind: "post_production",
      status: "running",
      input: {
        renderId: "render-1",
        operation: "enhance",
      },
    });

    expect(pipelineJobStage(recognition)).toBe("prerolls");
    expect(latestPipelineJobs([
      recognition,
      enhancement,
    ])).toEqual([recognition, enhancement]);
  });

  it("keeps parallel highlight analyses as separate task units", () => {
    const first = job({
      id: "analysis-a",
      kind: "highlight_analysis",
      status: "completed",
      input: { sourceHighlightAssetId: "asset-a" },
    });
    const second = job({
      id: "analysis-b",
      kind: "highlight_analysis",
      status: "running",
      input: { sourceHighlightAssetId: "asset-b" },
    });
    const context = job({
      id: "analysis-context",
      kind: "highlight_context",
      status: "queued",
    });

    expect(pipelineStageJobs([
      first,
      second,
      context,
    ], "analysis")).toEqual([
      first,
      second,
      context,
    ]);
  });
});
