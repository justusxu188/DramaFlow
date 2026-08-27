import { describe, expect, it } from "vitest";
import type {
  PipelineJob,
  RenderVariant,
} from "./pipeline-store";
import {
  pipelineTaskDisplayStatus,
} from "./pipeline-task-verification";

const job: PipelineJob = {
  id: "job-1",
  projectId: "project-1",
  runId: "run-1",
  kind: "preroll",
  status: "completed",
  progress: 100,
  input: {
    scriptId: "script-1",
    prerollPhase: "segments",
    verificationRequired: true,
    segmentTaskIds: ["seedance-1"],
  },
  result: {
    videoUrl: "https://example.com/new.mp4",
  },
  attempts: 0,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:03:00.000Z",
};

const render: RenderVariant = {
  id: "render-version-1",
  projectId: "project-1",
  scriptId: "script-1",
  sourceJobId: "job-1",
  status: "completed",
  videoUrl: "https://example.com/new.mp4",
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:03:00.000Z",
};

describe("pipeline task verification", () => {
  it("shows success only when the job and render identify the same output", () => {
    expect(
      pipelineTaskDisplayStatus(job, render),
    ).toBe("completed");
  });

  it("marks a completed job as unverified when it only has an older render", () => {
    expect(
      pipelineTaskDisplayStatus(job, {
        ...render,
        sourceJobId: "older-job",
      }),
    ).toBe("unverified");
  });

  it("keeps legacy task status unchanged", () => {
    expect(
      pipelineTaskDisplayStatus({
        ...job,
        input: {
          ...job.input,
          verificationRequired: undefined,
        },
      }, undefined),
    ).toBe("completed");
  });
});
