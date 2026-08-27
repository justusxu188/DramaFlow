import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const dataDirectory = path.join(process.cwd(), "data");

async function readJson(fileName, fallback) {
  try {
    return JSON.parse(await readFile(path.join(dataDirectory, fileName), "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeRuns(project) {
  const runs = project.runs ?? [];
  if (runs.length || !(
    project.analysis ||
    project.arcs?.length ||
    project.highlights?.length ||
    project.scripts?.length ||
    project.renders?.length ||
    project.compositions?.length
  )) {
    return runs;
  }
  const id = `run-legacy-${project.projectId}`;
  project.currentRunId = id;
  return [{
    id,
    projectId: project.projectId,
    sourceAssetIds: project.analysisSourceAssetIds ?? [],
    status: project.status,
    planReviewRequired: project.planReviewRequired,
    productionConfig: project.productionConfig,
    highlightRecommendation: project.highlightRecommendation,
    analysis: project.analysis,
    arcs: project.arcs ?? [],
    highlights: project.highlights ?? [],
    scripts: project.scripts ?? [],
    renders: project.renders ?? [],
    compositions: project.compositions ?? [],
    createdAt: project.updatedAt,
    updatedAt: project.updatedAt,
  }];
}

function objectKeyFromUrl(sourceUrl) {
  if (!sourceUrl) return undefined;
  try {
    return new URL(sourceUrl).pathname.replace(/^\/+/, "");
  } catch {
    return undefined;
  }
}

function artifacts(run) {
  const result = [];
  if (run.analysis) {
    result.push(["analysis", "storyline-analysis", "analysis", run.analysis]);
  }
  for (const arc of run.arcs ?? []) {
    result.push(["strategies", arc.id, "story_arc", arc]);
  }
  for (const highlight of run.highlights ?? []) {
    result.push([
      "highlights",
      highlight.id,
      "highlight",
      highlight,
      highlight.result?.videoUrls?.[0],
    ]);
  }
  for (const script of run.scripts ?? []) {
    result.push(["scripts", script.id, "preroll_script", script]);
  }
  for (const render of run.renders ?? []) {
    result.push(["prerolls", render.id, "preroll_video", render, render.videoUrl]);
  }
  for (const composition of run.compositions ?? []) {
    result.push([
      "compositions",
      composition.id,
      "composition",
      composition,
      composition.videoUrl,
    ]);
  }
  return result;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("缺少 DATABASE_URL");
  }
  const [projectData, pipelineData, creativeSettings] = await Promise.all([
    readJson("project-store.json", { projects: [], assets: [] }),
    readJson("pipeline-store.json", { projects: [], jobs: [] }),
    readJson("creative-settings.json", null),
  ]);
  const owner = await db.user.upsert({
    where: { username: "local-user" },
    update: {},
    create: { username: "local-user", name: "本地创作者" },
  });

  for (const project of projectData.projects ?? []) {
    await db.project.upsert({
      where: { id: project.id },
      update: {
        name: project.name,
        genre: project.genre,
        episodeCount: project.episodeCount,
        status: project.status,
        updatedAt: new Date(project.updatedAt),
      },
      create: {
        id: project.id,
        ownerId: owner.id,
        name: project.name,
        genre: project.genre,
        episodeCount: project.episodeCount,
        status: project.status,
        createdAt: new Date(project.createdAt),
        updatedAt: new Date(project.updatedAt),
      },
    });
  }

  for (const asset of projectData.assets ?? []) {
    await db.asset.upsert({
      where: { id: asset.id },
      update: {
        name: asset.name,
        objectKey: asset.objectKey,
        sourceUrl: asset.sourceUrl,
        mimeType: asset.mimeType,
        sizeBytes: BigInt(asset.sizeBytes ?? 0),
        durationMs: asset.durationMs ?? null,
        uploadMode: asset.uploadMode,
        episodeNumber: asset.episodeNumber,
        uploadStatus: asset.uploadStatus,
      },
      create: {
        id: asset.id,
        projectId: asset.projectId,
        kind: "source",
        name: asset.name,
        objectKey: asset.objectKey,
        sourceUrl: asset.sourceUrl,
        mimeType: asset.mimeType,
        sizeBytes: BigInt(asset.sizeBytes ?? 0),
        durationMs: asset.durationMs ?? null,
        uploadMode: asset.uploadMode,
        episodeNumber: asset.episodeNumber,
        uploadStatus: asset.uploadStatus ?? "completed",
        createdAt: new Date(asset.createdAt),
      },
    });
  }

  const currentRuns = new Map();
  for (const pipelineProject of pipelineData.projects ?? []) {
    const runs = normalizeRuns(pipelineProject);
    currentRuns.set(pipelineProject.projectId, pipelineProject.currentRunId);
    await db.productionRun.updateMany({
      where: { projectId: pipelineProject.projectId },
      data: { isCurrent: false },
    });
    for (const run of runs) {
      await db.productionRun.upsert({
        where: { id: run.id },
        update: {
          sourceAssetIds: run.sourceAssetIds,
          status: run.status,
          isCurrent: run.id === pipelineProject.currentRunId,
          planReviewRequired: run.planReviewRequired ?? false,
          productionConfig: run.productionConfig ?? Prisma.DbNull,
          highlightRecommendation:
            run.highlightRecommendation ?? Prisma.DbNull,
          analysis: run.analysis ?? Prisma.DbNull,
          arcs: run.arcs ?? [],
          snapshot: run,
          updatedAt: new Date(run.updatedAt),
        },
        create: {
          id: run.id,
          projectId: run.projectId,
          sourceAssetIds: run.sourceAssetIds,
          status: run.status,
          isCurrent: run.id === pipelineProject.currentRunId,
          planReviewRequired: run.planReviewRequired ?? false,
          productionConfig: run.productionConfig ?? Prisma.DbNull,
          highlightRecommendation:
            run.highlightRecommendation ?? Prisma.DbNull,
          analysis: run.analysis ?? Prisma.DbNull,
          arcs: run.arcs ?? [],
          snapshot: run,
          createdAt: new Date(run.createdAt),
          updatedAt: new Date(run.updatedAt),
        },
      });
      for (const [stage, artifactId, kind, payload, sourceUrl] of artifacts(run)) {
        await db.runArtifact.upsert({
          where: {
            runId_stage_artifactId: { runId: run.id, stage, artifactId },
          },
          update: {
            kind,
            payload,
            objectKey: objectKeyFromUrl(sourceUrl),
            sourceUrl,
          },
          create: {
            runId: run.id,
            stage,
            artifactId,
            kind,
            payload,
            objectKey: objectKeyFromUrl(sourceUrl),
            sourceUrl,
          },
        });
      }
    }
  }

  for (const job of pipelineData.jobs ?? []) {
    const runId = job.runId ?? currentRuns.get(job.projectId);
    await db.job.upsert({
      where: { id: job.id },
      update: {
        runId,
        status: job.status,
        progress: job.progress,
        attempts: job.attempts ?? 0,
        parentId: job.parentId,
        upstreamRequestId: job.upstreamId,
        input: job.input ?? {},
        result: job.result ?? Prisma.DbNull,
        errorMessage: job.error,
      },
      create: {
        id: job.id,
        projectId: job.projectId,
        runId,
        stage: job.kind,
        provider: "pipeline",
        status: job.status,
        progress: job.progress,
        attempts: job.attempts ?? 0,
        parentId: job.parentId,
        upstreamRequestId: job.upstreamId,
        idempotencyKey: job.id,
        input: job.input ?? {},
        result: job.result ?? Prisma.DbNull,
        errorMessage: job.error,
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.updatedAt),
      },
    });
  }

  if (creativeSettings) {
    await db.creativeSetting.upsert({
      where: { id: "default" },
      update: { value: creativeSettings },
      create: { id: "default", value: creativeSettings },
    });
  }

  process.stdout.write(
    `Imported ${projectData.projects?.length ?? 0} projects, ` +
    `${projectData.assets?.length ?? 0} assets, ` +
    `${pipelineData.projects?.length ?? 0} pipeline projects and ` +
    `${pipelineData.jobs?.length ?? 0} jobs.\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
