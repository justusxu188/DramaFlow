import { NextResponse } from "next/server";
import { z } from "zod";
import { getCreativeProvider } from "@/lib/providers";
import { createImageAsset } from "@/lib/project-store";
import { transferRemoteFileToTos } from "@/lib/tos";
import {
  authenticatedApiUser,
  authorizedProject,
} from "@/lib/authorization";

const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    sourceAssetId: z.string().min(1),
    timestamp: z.number().min(0).max(6 * 60 * 60),
  }),
  z.object({
    action: z.literal("complete"),
    taskId: z.string().min(1),
    sourceAssetId: z.string().min(1),
    timestamp: z.number().min(0).max(6 * 60 * 60),
    characterName: z.string().trim().min(1).max(120),
    lookName: z.string().trim().min(1).max(120),
    viewType: z
      .enum(["front", "side", "half_body", "full_body", "other"])
      .default("front"),
    isBaseline: z.boolean().default(true),
  }),
]);

function snapshotUrlFromResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  const collections = [
    record.snapshots,
    record.snapshot_info,
    record.frames,
    record.images,
  ];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (typeof item === "string" && /^https?:\/\//.test(item)) {
        return item;
      }
      if (!item || typeof item !== "object") continue;
      const candidate = item as Record<string, unknown>;
      for (const key of [
        "image_url",
        "snapshot_url",
        "frame_url",
        "url",
      ]) {
        const value = candidate[key];
        if (typeof value === "string" && /^https?:\/\//.test(value)) {
          return value;
        }
      }
    }
  }
  for (const key of [
    "image_urls",
    "snapshot_urls",
    "frame_urls",
  ]) {
    const value = record[key];
    if (Array.isArray(value)) {
      const url = value.find(
        (item): item is string =>
          typeof item === "string" && /^https?:\/\//.test(item),
      );
      if (url) return url;
    }
  }
  for (const key of ["output", "data", "result"]) {
    const nested = snapshotUrlFromResult(record[key]);
    if (nested) return nested;
  }
  return undefined;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = crypto.randomUUID();
  const { projectId } = await context.params;
  try {
    const auth = await authenticatedApiUser();
    if (!auth.user || auth.response) return auth.response;
    const input = inputSchema.parse(await request.json());
    const project = await authorizedProject(projectId, auth.user);
    if (!project) {
      return NextResponse.json(
        { error: "项目不存在", requestId },
        { status: 404 },
      );
    }
    const source = project.assets.find(
      (asset) => asset.id === input.sourceAssetId,
    );
    if (!source) {
      return NextResponse.json(
        { error: "源视频不存在", requestId },
        { status: 404 },
      );
    }

    const provider = getCreativeProvider();
    if (input.action === "start") {
      const task = await provider.extractFrames({
        videoUrl: source.sourceUrl,
        timestamps: [Number(input.timestamp.toFixed(3))],
        clientToken: `capture-${projectId}-${input.sourceAssetId}-${input.timestamp}`,
      });
      return NextResponse.json({ data: task, requestId }, { status: 202 });
    }

    const task = await provider.getMediaTask(input.taskId);
    if (task.status !== "completed") {
      return NextResponse.json({ data: task, requestId }, { status: 202 });
    }
    const remoteUrl = snapshotUrlFromResult(task.result);
    if (!remoteUrl) {
      throw new Error("MediaKit 抽帧任务未返回图片");
    }
    const stored = await transferRemoteFileToTos({
      remoteUrl,
      projectId,
      projectName: project.name,
      stage: "character_images",
      fileName: `${input.characterName}-${input.lookName}-截图参考.jpg`,
    });
    const asset = await createImageAsset(projectId, {
      name: `${input.characterName}-${input.lookName}-截图参考`,
      objectKey: stored.objectKey,
      sourceUrl: stored.sourceUrl,
      mimeType: "image/jpeg",
      sizeBytes: stored.sizeBytes ?? 0,
      metadata: {
        characterId: input.isBaseline
          ? `character-${crypto.randomUUID()}`
          : undefined,
        characterName: input.characterName,
        lookName: input.lookName,
        sourceType: "video_capture",
        intermediate: true,
        usableAsCharacterReference: false,
        viewType: input.viewType,
        isBaseline: input.isBaseline,
        sourceAssetId: source.id,
        sourceTimestamp: input.timestamp,
        referenceType: input.isBaseline ? "primary" : "appearance",
      },
    });
    return NextResponse.json({ data: asset, requestId }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "视频截图失败";
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }
}
