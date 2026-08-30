import type {
  PipelineJob,
  RenderVariant,
} from "./pipeline-store";

export type PipelineTaskDisplayStatus =
  | PipelineJob["status"]
  | "unverified";

function resultVideoUrl(job: PipelineJob) {
  if (
    !job.result ||
    typeof job.result !== "object" ||
    !("videoUrl" in job.result)
  ) {
    return undefined;
  }
  const value = job.result.videoUrl;
  return typeof value === "string" && value
    ? value
    : undefined;
}

export function pipelineTaskDisplayStatus(
  job: PipelineJob,
  render?: RenderVariant,
): PipelineTaskDisplayStatus {
  if (job.status === "queued" && job.progress > 0) {
    return "running";
  }
  if (
    job.status !== "completed" ||
    job.kind !== "preroll" ||
    job.input.prerollPhase === "compile_prompt" ||
    job.input.verificationRequired !== true
  ) {
    return job.status;
  }

  const outputUrl = resultVideoUrl(job);
  const upstreamTaskIds = Array.isArray(
    job.input.segmentTaskIds,
  )
    ? job.input.segmentTaskIds.filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value),
      )
    : [];
  if (
    !outputUrl ||
    upstreamTaskIds.length === 0 ||
    render?.sourceJobId !== job.id ||
    render.videoUrl !== outputUrl
  ) {
    return "unverified";
  }
  return "completed";
}

export function pipelineTaskEvidence(
  job: PipelineJob,
  render?: RenderVariant,
) {
  const upstreamTaskIds = Array.isArray(
    job.input.segmentTaskIds,
  )
    ? job.input.segmentTaskIds.filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value),
      )
    : [];
  return {
    upstreamTaskIds,
    outputUrl: resultVideoUrl(job),
    renderId: render?.id,
  };
}
