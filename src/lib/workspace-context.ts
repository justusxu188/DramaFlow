import type {
  CreativeWorkTypeId,
  ProductionWorkspaceStage,
} from "@/lib/creative-work-types";
import {
  latestPipelineJobs,
  pipelineJobStage,
  type PipelineJobStatusInput,
} from "@/lib/pipeline-job-status";
import type { ProductionConfig } from "@/lib/production-config";

export type WorkspaceContext = {
  projectId: string;
  workflowId: CreativeWorkTypeId;
  productionEntry?: ProductionConfig["productionEntry"];
  runId?: string;
  stageId: ProductionWorkspaceStage;
  artifactId?: string;
};

export type WorkspaceJob = PipelineJobStatusInput & {
  projectId?: string;
  runId?: string;
};

const artifactInputKeys = [
  "highlightId",
  "scriptId",
  "renderId",
  "compositionId",
] as const;

function jobProductionEntry(job: WorkspaceJob) {
  return typeof job.input?.productionEntry === "string"
    ? job.input.productionEntry
    : undefined;
}

function jobMatchesArtifact(
  job: WorkspaceJob,
  artifactId: string | undefined,
) {
  if (!artifactId) return true;
  return artifactInputKeys.some(
    (key) => job.input?.[key] === artifactId,
  );
}

export function jobsForWorkspace<T extends WorkspaceJob>(
  jobs: T[],
  context: WorkspaceContext,
) {
  return jobs.filter((job) => {
    if (job.projectId && job.projectId !== context.projectId) return false;
    if (context.runId && job.runId !== context.runId) return false;

    const productionEntry = jobProductionEntry(job);
    if (
      context.productionEntry &&
      productionEntry &&
      productionEntry !== context.productionEntry
    ) {
      return false;
    }
    if (
      context.productionEntry &&
      !context.runId &&
      productionEntry !== context.productionEntry
    ) {
      return false;
    }
    return jobMatchesArtifact(job, context.artifactId);
  });
}

export function jobsForWorkspaceStage<T extends WorkspaceJob>(
  jobs: T[],
  context: WorkspaceContext,
  stage: ProductionWorkspaceStage = context.stageId,
) {
  if (stage === "plan") return [];
  return latestPipelineJobs(
    jobsForWorkspace(jobs, context),
  ).filter((job) => pipelineJobStage(job) === stage);
}

export type WorkspaceStageSummary = {
  state: "waiting" | "running" | "failed" | "completed";
  runningCount: number;
  failedCount: number;
  completedCount: number;
  jobs: WorkspaceJob[];
};

export function workspaceStageSummary<T extends WorkspaceJob>(
  jobs: T[],
  context: WorkspaceContext,
  stage: ProductionWorkspaceStage = context.stageId,
): WorkspaceStageSummary {
  const scopedJobs = jobsForWorkspaceStage(jobs, context, stage);
  const runningCount = scopedJobs.filter((job) =>
    ["queued", "running"].includes(job.status),
  ).length;
  const failedCount = scopedJobs.filter(
    (job) => job.status === "failed",
  ).length;
  const completedCount = scopedJobs.filter(
    (job) => job.status === "completed",
  ).length;
  return {
    state: runningCount
      ? "running"
      : failedCount
        ? "failed"
        : completedCount
          ? "completed"
          : "waiting",
    runningCount,
    failedCount,
    completedCount,
    jobs: scopedJobs,
  };
}
