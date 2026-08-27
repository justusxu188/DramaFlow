import { describe, expect, it } from "vitest";
import type { PipelineJob } from "./pipeline-store";
import {
  jobsForWorkspace,
  jobsForWorkspaceStage,
  workspaceStageSummary,
} from "./workspace-context";

function job(
  patch: Partial<PipelineJob> &
    Pick<PipelineJob, "id" | "kind" | "status">,
): PipelineJob {
  return {
    projectId: "project-1",
    runId: "run-1",
    progress: 0,
    input: { productionEntry: "full_drama" },
    attempts: 0,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    ...patch,
  };
}

const context = {
  projectId: "project-1",
  workflowId: "full-chain" as const,
  productionEntry: "full_drama" as const,
  runId: "run-1",
  stageId: "scripts" as const,
};

describe("workspace context", () => {
  it("isolates jobs by project, run, and production entry", () => {
    const current = job({
      id: "current",
      kind: "scripts",
      status: "running",
    });
    const jobs = [
      current,
      job({
        id: "other-run",
        kind: "scripts",
        status: "failed",
        runId: "run-2",
      }),
      job({
        id: "other-workflow",
        kind: "scripts",
        status: "failed",
        input: { productionEntry: "uploaded_highlights" },
      }),
      job({
        id: "other-project",
        kind: "scripts",
        status: "failed",
        projectId: "project-2",
      }),
    ];

    expect(jobsForWorkspace(jobs, context)).toEqual([current]);
  });

  it("excludes source-run jobs before the target entry creates a run", () => {
    const pendingContext = {
      ...context,
      workflowId: "highlight-preroll" as const,
      productionEntry: "uploaded_highlights" as const,
      runId: undefined,
    };
    const sourceJob = job({
      id: "source-run-job",
      kind: "compose",
      status: "completed",
      runId: "run-full-drama",
      input: { productionEntry: "full_drama" },
    });

    expect(
      jobsForWorkspace([sourceJob], pendingContext),
    ).toEqual([]);
  });

  it("does not expose video failures in the script stage", () => {
    const promptFailure = job({
      id: "prompt",
      kind: "preroll",
      status: "failed",
      input: {
        productionEntry: "full_drama",
        scriptId: "script-1",
        prerollPhase: "compile_prompt",
      },
    });
    const videoFailure = job({
      id: "video",
      kind: "preroll",
      status: "failed",
      input: {
        productionEntry: "full_drama",
        scriptId: "script-1",
        prerollPhase: "segments",
      },
    });

    expect(
      jobsForWorkspaceStage(
        [promptFailure, videoFailure],
        context,
        "scripts",
      ),
    ).toEqual([promptFailure]);
  });

  it("summarizes only the latest units in the requested stage", () => {
    const jobs = [
      job({
        id: "old-failure",
        kind: "preroll",
        status: "failed",
        input: {
          productionEntry: "full_drama",
          scriptId: "script-1",
          prerollPhase: "segments",
        },
      }),
      job({
        id: "latest-success",
        kind: "preroll",
        status: "completed",
        updatedAt: "2026-08-21T01:00:00.000Z",
        input: {
          productionEntry: "full_drama",
          scriptId: "script-1",
          prerollPhase: "segments",
        },
      }),
    ];

    expect(
      workspaceStageSummary(jobs, context, "prerolls"),
    ).toMatchObject({
      state: "completed",
      runningCount: 0,
      failedCount: 0,
      completedCount: 1,
    });
  });
});
