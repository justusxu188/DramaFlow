import {
  workTypeFromProductionEntry,
  type ProductionWorkspaceStage,
} from "@/lib/creative-work-types";
import {
  latestPipelineJobs,
  pipelineJobStage,
} from "@/lib/pipeline-job-status";
import type { ProductionConfig } from "@/lib/production-config";
import {
  jobsForWorkspace,
  type WorkspaceJob,
} from "@/lib/workspace-context";

export function summarizeRunProgress({
  projectId,
  runId,
  productionEntry,
  jobs,
  completedArtifactStages = [],
}: {
  projectId: string;
  runId?: string;
  productionEntry: ProductionConfig["productionEntry"];
  jobs: WorkspaceJob[];
  completedArtifactStages?: ProductionWorkspaceStage[];
}) {
  if (!runId) {
    return {
      progress: 0,
      completed: false,
      runningCount: 0,
      completedStages: [] as ProductionWorkspaceStage[],
      failedStages: [] as ProductionWorkspaceStage[],
    };
  }

  const workType = workTypeFromProductionEntry(productionEntry);
  const scopedJobs = latestPipelineJobs(
    jobsForWorkspace(jobs, {
      projectId,
      workflowId: workType.id,
      productionEntry,
      runId,
      stageId: "plan",
    }),
  );
  const completedArtifacts = new Set(completedArtifactStages);
  const completedStages: ProductionWorkspaceStage[] = ["plan"];
  const failedStages: ProductionWorkspaceStage[] = [];

  for (const stage of workType.stages) {
    if (stage === "plan") continue;
    const stageJobs = scopedJobs.filter(
      (job) => pipelineJobStage(job) === stage,
    );
    const running = stageJobs.some((job) =>
      ["queued", "running"].includes(job.status),
    );
    const failed = !running && stageJobs.some(
      (job) => job.status === "failed",
    );
    const completed =
      !running &&
      !failed &&
      (
        completedArtifacts.has(stage) ||
        stageJobs.some((job) => job.status === "completed")
      );

    if (failed) failedStages.push(stage);
    if (completed) completedStages.push(stage);
  }

  const runningCount = scopedJobs.filter((job) =>
    ["queued", "running"].includes(job.status),
  ).length;
  const progress = Math.round(
    (completedStages.length / Math.max(1, workType.stages.length)) *
      100,
  );

  return {
    progress,
    completed: progress === 100 && failedStages.length === 0,
    runningCount,
    completedStages,
    failedStages,
  };
}
