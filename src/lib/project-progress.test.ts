import { describe, expect, it } from "vitest";
import { summarizeRunProgress } from "./project-progress";

const context = {
  projectId: "project-1",
  runId: "run-current",
  productionEntry: "full_drama" as const,
};

describe("project progress", () => {
  it("ignores completed stages from historical runs", () => {
    const summary = summarizeRunProgress({
      ...context,
      jobs: [
        {
          id: "old-output",
          projectId: "project-1",
          runId: "run-old",
          kind: "compose",
          status: "completed",
          input: { productionEntry: "full_drama" },
        },
        {
          id: "analysis",
          projectId: "project-1",
          runId: "run-current",
          kind: "analysis",
          status: "completed",
          input: { productionEntry: "full_drama" },
        },
      ],
    });

    expect(summary.completedStages).toEqual(["plan", "analysis"]);
    expect(summary.progress).toBe(29);
    expect(summary.completed).toBe(false);
  });

  it("keeps a stage incomplete when its latest units contain a failure", () => {
    const summary = summarizeRunProgress({
      ...context,
      completedArtifactStages: ["analysis", "arcs", "highlights"],
      jobs: [
        {
          id: "script-success",
          projectId: "project-1",
          runId: "run-current",
          kind: "scripts",
          status: "completed",
          input: {
            productionEntry: "full_drama",
            highlightId: "highlight-1",
          },
        },
        {
          id: "script-failure",
          projectId: "project-1",
          runId: "run-current",
          kind: "scripts",
          status: "failed",
          input: {
            productionEntry: "full_drama",
            highlightId: "highlight-2",
          },
        },
      ],
    });

    expect(summary.completedStages).not.toContain("scripts");
    expect(summary.failedStages).toEqual(["scripts"]);
    expect(summary.progress).toBe(57);
  });

  it("uses the shorter stage set for batch highlight workflows", () => {
    const summary = summarizeRunProgress({
      projectId: "project-1",
      runId: "run-batch",
      productionEntry: "batch_highlights",
      completedArtifactStages: ["highlights"],
      jobs: [],
    });

    expect(summary.completedStages).toEqual(["plan", "highlights"]);
    expect(summary.progress).toBe(100);
    expect(summary.completed).toBe(true);
  });
});
