import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const storePath = fileURLToPath(
  new URL("../data/pipeline-store.json", import.meta.url),
);
const data = JSON.parse(await readFile(storePath, "utf8"));

function completedSteps(projectId, renderId) {
  return (data.jobs ?? []).filter(
    (job) =>
      job.projectId === projectId &&
      job.kind === "post_production" &&
      job.status === "completed" &&
      job.input?.renderId === renderId &&
      job.input?.operation !== "asr" &&
      typeof job.input?.sourceVideoUrl === "string" &&
      typeof job.result?.videoUrl === "string",
  );
}

function migrateRender(projectId, render) {
  if (!render.videoUrl) {
    render.revisions = [];
    delete render.currentRevisionId;
    return;
  }

  const stepsByOutput = new Map(
    completedSteps(projectId, render.id).map((job) => [
      job.result.videoUrl,
      job,
    ]),
  );
  const chain = [];
  const visited = new Set();
  let cursor = render.videoUrl;
  while (stepsByOutput.has(cursor) && !visited.has(cursor)) {
    visited.add(cursor);
    const job = stepsByOutput.get(cursor);
    chain.push(job);
    cursor = job.input.sourceVideoUrl;
  }
  chain.reverse();

  const baseId = `${render.id}-revision-1`;
  const revisions = [{
    id: baseId,
    videoUrl: cursor,
    operation: chain.length > 0 ? "baseline" : "generated",
    sourceJobId: render.sourceJobId,
    createdAt:
      chain[0]?.createdAt ??
      render.createdAt ??
      render.updatedAt,
  }];
  let parentRevisionId = baseId;
  let subtitleEraseConfig;
  let subtitleVerificationStatus;
  let subtitleVerificationEvidence;

  for (const job of chain) {
    const operation = job.input.operation;
    if (operation === "erase_subtitles") {
      subtitleEraseConfig = job.input.subtitleEraseConfig;
      subtitleVerificationStatus = undefined;
      subtitleVerificationEvidence = undefined;
    } else if (operation === "add_subtitles") {
      subtitleVerificationStatus =
        job.result.subtitleVerification?.status;
      subtitleVerificationEvidence =
        job.result.subtitleVerification;
    }
    const revision = {
      id: `render-revision-${job.id}`,
      parentRevisionId,
      videoUrl: job.result.videoUrl,
      operation,
      settings: job.input.operationSettings,
      sourceJobId: job.id,
      subtitleEraseConfig,
      subtitleVerificationStatus,
      subtitleVerificationEvidence,
      createdAt:
        job.completedAt ??
        job.updatedAt ??
        job.createdAt,
    };
    revisions.push(
      Object.fromEntries(
        Object.entries(revision).filter(
          ([, value]) => value !== undefined,
        ),
      ),
    );
    parentRevisionId = revision.id;
  }

  if (chain.length === 0) {
    revisions[0].operation =
      render.processedOperation ?? "generated";
    if (render.subtitleEraseConfig) {
      revisions[0].subtitleEraseConfig =
        render.subtitleEraseConfig;
    }
    if (render.subtitleVerificationStatus) {
      revisions[0].subtitleVerificationStatus =
        render.subtitleVerificationStatus;
    }
    if (render.subtitleVerificationEvidence) {
      revisions[0].subtitleVerificationEvidence =
        render.subtitleVerificationEvidence;
    }
  }

  render.revisions = revisions;
  render.currentRevisionId = parentRevisionId;
}

for (const project of data.projects ?? []) {
  for (const render of project.renders ?? []) {
    migrateRender(project.projectId, render);
  }
  for (const run of project.runs ?? []) {
    for (const render of run.renders ?? []) {
      migrateRender(project.projectId, render);
    }
  }
}

await writeFile(storePath, `${JSON.stringify(data, null, 2)}\n`);
