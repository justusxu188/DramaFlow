import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { isUsableCharacterImageAsset } from "@/lib/character-image-assets";
import { env } from "@/lib/env";
import { getPipelineProject, listPipelineJobs } from "@/lib/pipeline-store";
import { summarizeRunProgress } from "@/lib/project-progress";
import {
  productionEntries,
  type ProductionConfig,
} from "@/lib/production-config";

export type ProjectSummary = {
  id: string;
  name: string;
  genre: string;
  episodeCount: number;
  status: string;
  progress: number;
  outputs: number;
  sourceCount: number;
  runningJobs: number;
  updatedAt: string;
};

export type SourceAsset = {
  id: string;
  projectId: string;
  kind: "source";
  name: string;
  objectKey: string;
  sourceUrl: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  uploadMode: "episodes" | "full";
  episodeNumber: number | null;
  uploadStatus: "completed";
  createdAt: string;
};

function productionEntryFromConfig(
  value: unknown,
): ProductionConfig["productionEntry"] {
  if (!value || typeof value !== "object") return "full_drama";
  const productionEntry = Reflect.get(value, "productionEntry");
  return productionEntries.includes(
    productionEntry as ProductionConfig["productionEntry"],
  )
    ? productionEntry as ProductionConfig["productionEntry"]
    : "full_drama";
}

export type ImageAsset = {
  id: string;
  projectId: string;
  kind: "character_image";
  folder: "图像资产";
  name: string;
  objectKey: string;
  sourceUrl: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: "completed";
  metadata: {
    characterId?: string;
    characterName: string;
    lookName?: string;
    sourceType?:
      | "confirmed_frame"
      | "upload"
      | "video_capture"
      | "seedream"
      | "seedream_text"
      | "seedream_from_capture";
    intermediate?: boolean;
    usableAsCharacterReference?: boolean;
    viewType?: "front" | "side" | "half_body" | "full_body" | "other";
    isBaseline?: boolean;
    seedreamModel?: "seedream_5_0_lite" | "seedream_5_0_pro";
    aspectRatio?: "9:16" | "16:9";
    imageSize?: string;
    prompt?: string;
    sourceClipIndex?: number;
    sourceVideoIndex?: number;
    sourceTimestamp?: number;
    sourceAssetId?: string;
    sourceCaptureAssetId?: string;
    referenceType?: "primary" | "appearance";
    avatarGroupId?: string;
    avatarAssetId?: string;
    avatarStatus?: "processing" | "active" | "failed";
    avatarAssetType?: "Image";
    avatarProjectName?: string;
    avatarRemoteName?: string;
    avatarError?: string;
    avatarUpdatedAt?: string;
  };
  createdAt: string;
};


export function imageAssetReferenceUrl(
  asset: Pick<ImageAsset, "sourceUrl" | "metadata">,
) {
  return asset.metadata.avatarStatus === "active" &&
    asset.metadata.avatarAssetId
    ? `asset://${asset.metadata.avatarAssetId}`
    : asset.sourceUrl;
}
export type HighlightAsset = {
  id: string;
  projectId: string;
  kind: "highlight";
  folder: "高光剪辑";
  name: string;
  objectKey: string;
  sourceUrl: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  uploadStatus: "completed";
  metadata: {
    sourceType: "user" | "mediakit";
    sourceAssetId?: string;
    sourceRunId?: string;
    sourceHighlightId?: string;
    sourceArtifactId?: string;
    summary?: string;
    characterNames?: string[];
  };
  createdAt: string;
};

export type CuratedVideoAsset = {
  id: string;
  projectId: string;
  kind: "preroll_video" | "final_video";
  folder: "AI 前贴视频" | "成片视频";
  name: string;
  objectKey: string;
  sourceUrl: string;
  mimeType: "video/mp4";
  sizeBytes: number;
  durationMs: number | null;
  uploadStatus: "completed";
  metadata: {
    sourceType: "curated" | "postproduction";
    sourceRunId: string;
    sourceArtifactId: string;
    sourceScriptId?: string;
    promptTitle?: string;
    sourceAssetId?: string;
    processingType?: "erase_subtitles";
  };
  createdAt: string;
};

export type ProjectAssetKind =
  | SourceAsset["kind"]
  | ImageAsset["kind"]
  | HighlightAsset["kind"]
  | CuratedVideoAsset["kind"];

type LocalData = {
  projects: Array<{
    id: string;
    name: string;
    genre: string;
    episodeCount: number;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  assets: Array<
    SourceAsset | ImageAsset | HighlightAsset | CuratedVideoAsset
  >;
};

const dataPath = path.join(process.cwd(), "data", "project-store.json");
let databaseAvailable: boolean | undefined;
let localMutationQueue = Promise.resolve();

async function readLocal(): Promise<LocalData> {
  try {
    return JSON.parse(await readFile(dataPath, "utf8")) as LocalData;
  } catch {
    return { projects: [], assets: [] };
  }
}

async function writeLocal(data: LocalData) {
  await mkdir(path.dirname(dataPath), { recursive: true });
  const temporaryPath = `${dataPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, dataPath);
}

async function mutateLocal<T>(
  change: (data: LocalData) => T | Promise<T>,
): Promise<T> {
  const operation = localMutationQueue
    .catch(() => undefined)
    .then(async () => {
      const data = await readLocal();
      const result = await change(data);
      await writeLocal(data);
      return result;
    });
  localMutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function summarizeLocal(project: LocalData["projects"][number], data: LocalData): ProjectSummary {
  const sources = data.assets.filter(
    (asset): asset is SourceAsset =>
      asset.projectId === project.id && asset.kind === "source",
  );
  const episodeCount = sources.filter((asset) => asset.uploadMode === "episodes").length;
  return {
    ...project,
    episodeCount: episodeCount || project.episodeCount,
    status: sources.length ? "ready" : "awaiting_upload",
    progress: sources.length ? 14 : 0,
    outputs: 0,
    sourceCount: sources.length,
    runningJobs: 0,
  };
}

async function useDatabase<T>(operation: () => Promise<T>): Promise<T | undefined> {
  if (env.PERSISTENCE_MODE !== "mysql") return undefined;
  if (databaseAvailable === false) return undefined;
  try {
    const result = await operation();
    databaseAvailable = true;
    return result;
  } catch {
    databaseAvailable = false;
    return undefined;
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const databaseProjects = await useDatabase(() =>
    db.project.findMany({
      include: {
        assets: { where: { kind: "source", uploadStatus: "completed" } },
        jobs: true,
        outputs: true,
        productionRuns: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  );
  if (databaseProjects) {
    return databaseProjects.map((project) => {
      const run = project.productionRuns[0];
      const runProgress = summarizeRunProgress({
        projectId: project.id,
        runId: run?.id,
        productionEntry: productionEntryFromConfig(
          run?.productionConfig,
        ),
        jobs: project.jobs.map((job) => ({
          id: job.id,
          projectId: project.id,
          runId: job.runId ?? undefined,
          kind: job.stage,
          status: job.status,
          input: (job.input as Record<string, unknown> | null) ?? {},
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
        })),
      });
      return {
        id: project.id,
        name: project.name,
        genre: project.genre,
        episodeCount: project.assets.filter((asset) => asset.uploadMode === "episodes").length || project.episodeCount,
        status: !project.assets.length
          ? "awaiting_upload"
          : runProgress.runningCount
            ? "production"
            : runProgress.completed && project.outputs.length
              ? "completed"
              : "ready",
        progress: runProgress.progress,
        outputs: project.outputs.length,
        sourceCount: project.assets.length,
        runningJobs: runProgress.runningCount,
        updatedAt: project.updatedAt.toISOString(),
      };
    });
  }
  const local = await readLocal();
  return Promise.all(local.projects.map(async (project) => {
    const summary = summarizeLocal(project, local);
    const [pipeline, jobs] = await Promise.all([
      getPipelineProject(project.id),
      listPipelineJobs(project.id),
    ]);
    const completedArtifactStages = [
      pipeline?.analysis ? "analysis" : undefined,
      pipeline?.arcs.length ? "arcs" : undefined,
      pipeline?.highlights.length ? "highlights" : undefined,
      pipeline?.scripts.length ? "scripts" : undefined,
      pipeline?.renders.some((item) => item.videoUrl)
        ? "prerolls"
        : undefined,
      pipeline?.compositions.some(
        (item) => item.status === "completed" && item.videoUrl,
      )
        ? "outputs"
        : undefined,
    ].filter(Boolean) as Array<
      "analysis" | "arcs" | "highlights" | "scripts" | "prerolls" | "outputs"
    >;
    const runProgress = summarizeRunProgress({
      projectId: project.id,
      runId: pipeline?.currentRunId,
      productionEntry:
        pipeline?.productionConfig?.productionEntry ?? "full_drama",
      jobs,
      completedArtifactStages,
    });
    const completedOutputs =
      pipeline?.compositions.filter(
        (item) =>
          item.status === "completed" && Boolean(item.videoUrl),
      ).length ?? 0;
    return {
      ...summary,
      status: runProgress.runningCount
        ? "production"
        : runProgress.completed && completedOutputs
          ? "completed"
          : summary.status,
      progress: runProgress.progress,
      outputs: completedOutputs,
      runningJobs: runProgress.runningCount,
    };
  }));
}

export async function getProject(projectId: string) {
  const projects = await listProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return null;
  const [
    assets,
    imageAssets,
    highlightAssets,
    prerollAssets,
    finalAssets,
  ] = await Promise.all([
    listSourceAssets(projectId),
    listImageAssets(projectId),
    listHighlightAssets(projectId),
    listCuratedVideoAssets(projectId, "preroll_video"),
    listCuratedVideoAssets(projectId, "final_video"),
  ]);
  return {
    ...project,
    assets,
    imageAssets,
    highlightAssets,
    prerollAssets,
    finalAssets,
  };
}

export async function createProject(input: {
  name: string;
  genre: string;
  episodeCount: number;
}): Promise<ProjectSummary> {
  const databaseProject = await useDatabase(async () => {
    const owner = await db.user.upsert({
      where: { username: "local-user" },
      update: {},
      create: { username: "local-user", name: "本地创作者" },
    });
    return db.project.create({ data: { ...input, ownerId: owner.id } });
  });
  if (databaseProject) {
    return {
      ...databaseProject,
      status: "awaiting_upload",
      progress: 0,
      outputs: 0,
      sourceCount: 0,
      runningJobs: 0,
      updatedAt: databaseProject.updatedAt.toISOString(),
    };
  }
  return mutateLocal((local) => {
    const now = new Date().toISOString();
    const project = {
      id: `project-${crypto.randomUUID()}`,
      ...input,
      status: "awaiting_upload",
      createdAt: now,
      updatedAt: now,
    };
    local.projects.unshift(project);
    return summarizeLocal(project, local);
  });
}

export async function listSourceAssets(projectId: string): Promise<SourceAsset[]> {
  const databaseAssets = await useDatabase(() =>
    db.asset.findMany({
      where: { projectId, kind: "source", uploadStatus: "completed" },
      orderBy: [{ episodeNumber: "asc" }, { createdAt: "asc" }],
    }),
  );
  if (databaseAssets) {
    return databaseAssets.map((asset) => ({
      id: asset.id,
      projectId: asset.projectId,
      kind: "source",
      name: asset.name,
      objectKey: asset.objectKey,
      sourceUrl: asset.sourceUrl ?? "",
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes ?? 0),
      durationMs: asset.durationMs,
      uploadMode: asset.uploadMode === "full" ? "full" : "episodes",
      episodeNumber: asset.episodeNumber,
      uploadStatus: "completed",
      createdAt: asset.createdAt.toISOString(),
    }));
  }
  const local = await readLocal();
  return local.assets
    .filter(
      (asset): asset is SourceAsset =>
        asset.projectId === projectId && asset.kind === "source",
    )
    .map((asset) => ({
      ...asset,
      durationMs: asset.durationMs ?? null,
    }))
    .sort((a, b) => (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999));
}

export async function listImageAssets(projectId: string): Promise<ImageAsset[]> {
  const databaseAssets = await useDatabase(() =>
    db.asset.findMany({
      where: {
        projectId,
        kind: "character_image",
        uploadStatus: "completed",
      },
      orderBy: { createdAt: "asc" },
    }),
  );
  if (databaseAssets) {
    return databaseAssets.map((asset) => ({
      id: asset.id,
      projectId: asset.projectId,
      kind: "character_image",
      folder: "图像资产",
      name: asset.name,
      objectKey: asset.objectKey,
      sourceUrl: asset.sourceUrl ?? "",
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes ?? 0),
      uploadStatus: "completed",
      metadata: asset.metadata as ImageAsset["metadata"],
      createdAt: asset.createdAt.toISOString(),
    }));
  }
  const local = await readLocal();
  return local.assets
    .filter(
      (asset): asset is ImageAsset =>
        asset.projectId === projectId &&
        asset.kind === "character_image",
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createImageAsset(
  projectId: string,
  input: Omit<
    ImageAsset,
    "id" | "projectId" | "kind" | "folder" | "uploadStatus" | "createdAt"
  >,
): Promise<ImageAsset | null> {
  if (!(await getProject(projectId))) return null;
  const databaseAsset = await useDatabase(() =>
    db.asset.create({
      data: {
        projectId,
        kind: "character_image",
        name: input.name,
        objectKey: input.objectKey,
        sourceUrl: input.sourceUrl,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        uploadStatus: "completed",
        metadata: input.metadata,
      },
    }),
  );
  if (databaseAsset) {
    return {
      ...input,
      id: databaseAsset.id,
      projectId,
      kind: "character_image",
      folder: "图像资产",
      uploadStatus: "completed",
      createdAt: databaseAsset.createdAt.toISOString(),
    };
  }
  return mutateLocal((local) => {
    const asset: ImageAsset = {
      ...input,
      id: `image-asset-${crypto.randomUUID()}`,
      projectId,
      kind: "character_image",
      folder: "图像资产",
      uploadStatus: "completed",
      createdAt: new Date().toISOString(),
    };
    local.assets.push(asset);
    return asset;
  });
}

export async function getImageAssetsByIds(
  projectId: string,
  assetIds: string[],
) {
  const requested = new Set(assetIds);
  return (await listImageAssets(projectId)).filter(
    (asset) =>
      requested.has(asset.id) &&
      isUsableCharacterImageAsset(asset),
  );
}

export async function getImageAssetsByIdsIncludingIntermediate(
  projectId: string,
  assetIds: string[],
) {
  const requested = new Set(assetIds);
  return (await listImageAssets(projectId)).filter((asset) =>
    requested.has(asset.id),
  );
}

function normalizeHighlightMetadata(
  metadata: HighlightAsset["metadata"],
  objectKey: string,
): HighlightAsset["metadata"] {
  const isMediaKit =
    metadata.sourceType === "mediakit" ||
    Boolean(metadata.sourceRunId) ||
    Boolean(metadata.sourceHighlightId) ||
    objectKey.includes("mediakit-highlight") ||
    /\/runs\/[^/]+\/highlights\//.test(objectKey);

  return {
    ...metadata,
    sourceType: isMediaKit ? "mediakit" : "user",
  };
}

export async function listHighlightAssets(
  projectId: string,
): Promise<HighlightAsset[]> {
  const databaseAssets = await useDatabase(() =>
    db.asset.findMany({
      where: {
        projectId,
        kind: "highlight",
        uploadStatus: "completed",
      },
      orderBy: { createdAt: "desc" },
    }),
  );
  if (databaseAssets) {
    return databaseAssets.map((asset) => ({
      id: asset.id,
      projectId: asset.projectId,
      kind: "highlight",
      folder: "高光剪辑",
      name: asset.name,
      objectKey: asset.objectKey,
      sourceUrl: asset.sourceUrl ?? "",
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes ?? 0),
      durationMs: asset.durationMs,
      uploadStatus: "completed",
      metadata: normalizeHighlightMetadata(
        asset.metadata as HighlightAsset["metadata"],
        asset.objectKey,
      ),
      createdAt: asset.createdAt.toISOString(),
    }));
  }
  const local = await readLocal();
  return local.assets
    .filter(
      (asset): asset is HighlightAsset =>
        asset.projectId === projectId &&
        asset.kind === "highlight",
    )
    .map((asset) => ({
      ...asset,
      metadata: normalizeHighlightMetadata(
        asset.metadata,
        asset.objectKey,
      ),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createHighlightAsset(
  projectId: string,
  input: Omit<
    HighlightAsset,
    "id" | "projectId" | "kind" | "folder" | "uploadStatus" | "createdAt"
  >,
): Promise<HighlightAsset | null> {
  if (!(await getProject(projectId))) return null;
  if (input.metadata.sourceArtifactId) {
    const existing = (
      await listHighlightAssets(projectId)
    ).find(
      (asset) =>
        asset.metadata.sourceArtifactId ===
        input.metadata.sourceArtifactId,
    );
    if (existing) return existing;
  }
  const databaseAsset = await useDatabase(() =>
    db.asset.create({
      data: {
        projectId,
        kind: "highlight",
        name: input.name,
        objectKey: input.objectKey,
        sourceUrl: input.sourceUrl,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        durationMs: input.durationMs,
        uploadStatus: "completed",
        metadata: input.metadata,
      },
    }),
  );
  if (databaseAsset) {
    return {
      ...input,
      id: databaseAsset.id,
      projectId,
      kind: "highlight",
      folder: "高光剪辑",
      uploadStatus: "completed",
      createdAt: databaseAsset.createdAt.toISOString(),
    };
  }
  return mutateLocal((local) => {
    const asset: HighlightAsset = {
      ...input,
      id: `highlight-asset-${crypto.randomUUID()}`,
      projectId,
      kind: "highlight",
      folder: "高光剪辑",
      uploadStatus: "completed",
      createdAt: new Date().toISOString(),
    };
    local.assets.push(asset);
    return asset;
  });
}

export async function listCuratedVideoAssets(
  projectId: string,
  kind?: CuratedVideoAsset["kind"],
): Promise<CuratedVideoAsset[]> {
  const databaseAssets = await useDatabase(() =>
    db.asset.findMany({
      where: {
        projectId,
        kind: kind
          ? kind
          : { in: ["preroll_video", "final_video"] },
        uploadStatus: "completed",
      },
      orderBy: { createdAt: "desc" },
    }),
  );
  if (databaseAssets) {
    return databaseAssets.map((asset) => ({
      id: asset.id,
      projectId: asset.projectId,
      kind: asset.kind as CuratedVideoAsset["kind"],
      folder:
        asset.kind === "preroll_video"
          ? "AI 前贴视频"
          : "成片视频",
      name: asset.name,
      objectKey: asset.objectKey,
      sourceUrl: asset.sourceUrl ?? "",
      mimeType: "video/mp4",
      sizeBytes: Number(asset.sizeBytes ?? 0),
      durationMs: asset.durationMs,
      uploadStatus: "completed",
      metadata:
        asset.metadata as CuratedVideoAsset["metadata"],
      createdAt: asset.createdAt.toISOString(),
    }));
  }
  const local = await readLocal();
  return local.assets
    .filter(
      (asset): asset is CuratedVideoAsset =>
        asset.projectId === projectId &&
        (asset.kind === "preroll_video" ||
          asset.kind === "final_video") &&
        (!kind || asset.kind === kind),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createCuratedVideoAsset(
  projectId: string,
  input: Omit<
    CuratedVideoAsset,
    | "id"
    | "projectId"
    | "folder"
    | "uploadStatus"
    | "createdAt"
  >,
): Promise<CuratedVideoAsset | null> {
  if (!(await getProject(projectId))) return null;
  const existing = (
    await listCuratedVideoAssets(projectId, input.kind)
  ).find(
    (asset) =>
      asset.metadata.sourceArtifactId ===
      input.metadata.sourceArtifactId,
  );
  if (existing) return existing;
  const databaseAsset = await useDatabase(() =>
    db.asset.create({
      data: {
        projectId,
        kind: input.kind,
        name: input.name,
        objectKey: input.objectKey,
        sourceUrl: input.sourceUrl,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        durationMs: input.durationMs,
        uploadStatus: "completed",
        metadata: input.metadata,
      },
    }),
  );
  const folder =
    input.kind === "preroll_video"
      ? "AI 前贴视频"
      : "成片视频";
  if (databaseAsset) {
    return {
      ...input,
      id: databaseAsset.id,
      projectId,
      folder,
      uploadStatus: "completed",
      createdAt: databaseAsset.createdAt.toISOString(),
    };
  }
  return mutateLocal((local) => {
    const asset: CuratedVideoAsset = {
      ...input,
      id: `curated-video-${crypto.randomUUID()}`,
      projectId,
      folder,
      uploadStatus: "completed",
      createdAt: new Date().toISOString(),
    };
    local.assets.push(asset);
    return asset;
  });
}

export async function createSourceAsset(
  projectId: string,
  input: Omit<SourceAsset, "id" | "projectId" | "kind" | "uploadStatus" | "createdAt">,
): Promise<SourceAsset | null> {
  if (!(await getProject(projectId))) return null;
  const databaseAsset = await useDatabase(() =>
    db.asset.create({
      data: {
        projectId,
        kind: "source",
        ...input,
        sizeBytes: BigInt(input.sizeBytes),
        durationMs: input.durationMs,
        uploadStatus: "completed",
      },
    }),
  );
  if (databaseAsset) {
    return {
      ...input,
      id: databaseAsset.id,
      projectId,
      kind: "source",
      uploadStatus: "completed",
      createdAt: databaseAsset.createdAt.toISOString(),
    };
  }
  return mutateLocal((local) => {
    if (input.uploadMode === "episodes" && local.assets.some(
      (asset) =>
        asset.kind === "source" &&
        asset.projectId === projectId &&
        asset.episodeNumber === input.episodeNumber,
    )) {
      throw new Error(`第 ${input.episodeNumber} 集已存在`);
    }
    const asset: SourceAsset = {
      ...input,
      id: `asset-${crypto.randomUUID()}`,
      projectId,
      kind: "source",
      uploadStatus: "completed",
      createdAt: new Date().toISOString(),
    };
    local.assets.push(asset);
    const project = local.projects.find((item) => item.id === projectId);
    if (project) project.updatedAt = new Date().toISOString();
    return asset;
  });
}

export async function updateSourceAssetDuration(
  projectId: string,
  assetId: string,
  durationMs: number,
) {
  const databaseAsset = await useDatabase(() =>
    db.asset.updateMany({
      where: { id: assetId, projectId, kind: "source" },
      data: { durationMs },
    }),
  );
  if (databaseAsset) return databaseAsset.count > 0;

  return mutateLocal((local) => {
    const asset = local.assets.find(
      (item): item is SourceAsset =>
        item.kind === "source" &&
        item.id === assetId &&
        item.projectId === projectId,
    );
    if (!asset) return false;
    asset.durationMs = durationMs;
    return true;
  });
}

export async function updateImageAssetName(
  projectId: string,
  assetId: string,
  name: string,
) {
  const databaseAsset = await useDatabase(() =>
    db.asset.updateMany({
      where: {
        id: assetId,
        projectId,
        kind: "character_image",
      },
      data: { name },
    }),
  );
  if (databaseAsset) return databaseAsset.count > 0;

  return mutateLocal((local) => {
    const asset = local.assets.find(
      (item): item is ImageAsset =>
        item.kind === "character_image" &&
        item.id === assetId &&
        item.projectId === projectId,
    );
    if (!asset) return false;
    asset.name = name;
    return true;
  });
}

export async function updateImageAssetMetadata(
  projectId: string,
  assetId: string,
  patch: Partial<ImageAsset["metadata"]>,
) {
  const databaseAsset = await useDatabase(async () => {
    const asset = await db.asset.findFirst({
      where: {
        id: assetId,
        projectId,
        kind: "character_image",
      },
    });
    if (!asset) return false;
    await db.asset.update({
      where: { id: asset.id },
      data: {
        metadata: {
          ...(
            asset.metadata as ImageAsset["metadata"]
          ),
          ...patch,
        },
      },
    });
    return true;
  });
  if (databaseAsset !== undefined) return databaseAsset;

  return mutateLocal((local) => {
    const asset = local.assets.find(
      (item): item is ImageAsset =>
        item.kind === "character_image" &&
        item.id === assetId &&
        item.projectId === projectId,
    );
    if (!asset) return false;
    asset.metadata = {
      ...asset.metadata,
      ...patch,
    };
    return true;
  });
}

export async function deleteProjectAsset(
  projectId: string,
  assetId: string,
  kind: ProjectAssetKind,
) {
  const databaseAsset = await useDatabase(() =>
    db.asset.deleteMany({
      where: {
        id: assetId,
        projectId,
        kind,
      },
    }),
  );
  if (databaseAsset) {
    return databaseAsset.count > 0;
  }

  return mutateLocal((local) => {
    const assetIndex = local.assets.findIndex(
      (asset) =>
        asset.id === assetId &&
        asset.projectId === projectId &&
        asset.kind === kind,
    );
    if (assetIndex < 0) return false;
    local.assets.splice(assetIndex, 1);
    const project = local.projects.find(
      (item) => item.id === projectId,
    );
    if (project) {
      project.updatedAt = new Date().toISOString();
    }
    return true;
  });
}
