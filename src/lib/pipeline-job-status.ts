export type PipelineStatusStage =
  | "analysis"
  | "arcs"
  | "highlights"
  | "scripts"
  | "prerolls"
  | "outputs";

export type PipelineJobStatusInput = {
  id: string;
  kind: string;
  status: string;
  input?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export function pipelineJobStage(
  job: Pick<PipelineJobStatusInput, "kind" | "input">,
): PipelineStatusStage {
  if (
    job.kind === "analysis" ||
    job.kind === "media_analysis" ||
    job.kind === "highlight_analysis" ||
    job.kind === "highlight_context"
  ) {
    return "analysis";
  }
  if (job.kind === "mine_arcs") return "arcs";
  if (job.kind === "highlight") return "highlights";
  if (
    job.kind === "transition" ||
    job.kind === "scripts" ||
    (
      job.kind === "preroll" &&
      job.input?.prerollPhase === "compile_prompt"
    )
  ) {
    return "scripts";
  }
  if (job.kind === "preroll") return "prerolls";
  if (job.kind === "post_production") return "prerolls";
  return "outputs";
}

function taskUnit(job: PipelineJobStatusInput) {
  const stage = pipelineJobStage(job);
  const value = (key: string) =>
    typeof job.input?.[key] === "string"
      ? String(job.input[key])
      : "";
  if (stage === "analysis") {
    if (job.kind === "media_analysis") {
      return `${stage}:media:${value("assetId") || job.id}`;
    }
    if (job.kind === "highlight_analysis") {
      return `${stage}:${value("sourceHighlightAssetId") || job.id}`;
    }
    if (job.kind === "highlight_context") {
      return `${stage}:shared-context`;
    }
    return stage;
  }
  if (stage === "arcs") {
    return `${stage}:${value("sourceHighlightAssetId") || "project"}`;
  }
  if (stage === "highlights") {
    return `${stage}:${value("highlightId") || job.id}`;
  }
  if (stage === "scripts") {
    if (job.kind === "preroll") {
      return `${stage}:prompt:${value("scriptId") || job.id}`;
    }
    return `${stage}:${value("highlightId") || job.id}`;
  }
  if (stage === "prerolls") {
    if (job.kind === "post_production") {
      return `${stage}:post:${value("renderId") || job.id}:${value("operation")}`;
    }
    return `${stage}:${value("scriptId") || job.id}`;
  }
  return `${stage}:${value("renderId") || job.id}`;
}

function jobTime(job: PipelineJobStatusInput) {
  return job.updatedAt || job.createdAt || "";
}

export function latestPipelineJobs<T extends PipelineJobStatusInput>(
  jobs: T[],
) {
  const latest = new Map<string, T>();
  for (const job of jobs) {
    const key = taskUnit(job);
    const current = latest.get(key);
    if (!current || jobTime(job) >= jobTime(current)) {
      latest.set(key, job);
    }
  }
  return [...latest.values()];
}

export function pipelineStageJobs<T extends PipelineJobStatusInput>(
  jobs: T[],
  stage: PipelineStatusStage,
) {
  return latestPipelineJobs(jobs).filter(
    (job) => pipelineJobStage(job) === stage,
  );
}
