import { NextResponse } from "next/server";
import { z } from "zod";
import { sourceAssetInputSchema } from "@/lib/domain";
import {
  createCuratedVideoAsset,
  createHighlightAsset,
  createImageAsset,
  createSourceAsset,
  deleteProjectAsset,
  getImageAssetsByIdsIncludingIntermediate,
  listSourceAssets,
  updateImageAssetName,
  updateSourceAssetDuration,
} from "@/lib/project-store";
import { listPipelineRuns } from "@/lib/pipeline-store";
import { getArkAssetsClient } from "@/lib/ark-assets";

const sharedUploadedAssetSchema = z.object({
  name: z.string().trim().min(1).max(180),
  objectKey: z.string().min(1).max(1000),
  sourceUrl: z.string().url(),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative(),
});

const characterImageInputSchema = sharedUploadedAssetSchema.extend({
  assetType: z.literal("character_image"),
  characterId: z.string().trim().max(120).optional(),
  characterName: z.string().trim().min(1).max(120),
  lookName: z.string().trim().min(1).max(120),
  viewType: z
    .enum(["front", "side", "half_body", "full_body", "other"])
    .default("other"),
  isBaseline: z.boolean().default(false),
});

const highlightInputSchema = sharedUploadedAssetSchema.extend({
  assetType: z.literal("highlight"),
  durationMs: z.number().int().positive().nullable().default(null),
  sourceAssetId: z.string().min(1).optional(),
  summary: z.string().trim().max(1000).optional(),
  characterNames: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

const durationUpdateSchema = z.object({
  action: z.literal("update_duration").optional(),
  assetId: z.string().min(1),
  durationMs: z.number().int().positive().max(6 * 60 * 60 * 1000),
});

const imageRenameSchema = z.object({
  action: z.literal("rename_image"),
  assetId: z.string().min(1),
  name: z.string().trim().min(1).max(180),
});

const curatedVideoInputSchema = z.object({
  action: z.literal("curate_pipeline_video"),
  runId: z.string().min(1),
  artifactType: z.enum(["highlight", "preroll", "final"]),
  artifactId: z.string().min(1),
  artifactIndex: z.number().int().nonnegative().optional(),
});

const assetDeleteSchema = z.object({
  assetId: z.string().min(1),
  assetType: z.enum([
    "source",
    "character_image",
    "highlight",
    "preroll_video",
    "final_video",
  ]),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  return NextResponse.json({ data: await listSourceAssets(projectId) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = crypto.randomUUID();
  const { projectId } = await context.params;
  try {
    const raw = await request.json();
    let data;
    if (raw?.action === "curate_pipeline_video") {
      const input = curatedVideoInputSchema.parse(raw);
      const run = (await listPipelineRuns(projectId)).find(
        (item) => item.id === input.runId,
      );
      if (!run) {
        return NextResponse.json(
          { error: "生产批次不存在", requestId },
          { status: 404 },
        );
      }
      const selectedRender =
        input.artifactType === "preroll"
          ? run.renders.find(
              (item) =>
                item.id === input.artifactId &&
                item.status === "completed" &&
                item.videoUrl,
            )
          : undefined;
      const selectedComposition =
        input.artifactType === "final"
          ? run.compositions.find(
              (item) =>
                item.id === input.artifactId &&
                item.status === "completed" &&
                item.videoUrl,
            )
          : undefined;
      const selectedHighlight =
        input.artifactType === "highlight"
          ? run.highlights.find(
              (item) =>
                item.id === input.artifactId &&
                item.result?.videoUrls[
                  input.artifactIndex ?? 0
                ],
            )
          : undefined;
      const videoUrl =
        selectedRender?.videoUrl ??
        selectedComposition?.videoUrl ??
        selectedHighlight?.result?.videoUrls[
          input.artifactIndex ?? 0
        ];
      if (!videoUrl) {
        return NextResponse.json(
          { error: "视频产物不存在或尚未完成", requestId },
          { status: 404 },
        );
      }
      if (selectedHighlight) {
        const artifactIndex = input.artifactIndex ?? 0;
        const sourceArtifactId =
          `${selectedHighlight.id}:${artifactIndex}`;
        const variant =
          selectedHighlight.result?.variants?.[artifactIndex];
        data = await createHighlightAsset(projectId, {
          name: "Mediakit高光视频",
          objectKey:
            `pipeline/${input.runId}/${sourceArtifactId}.mp4`,
          sourceUrl: videoUrl,
          mimeType: "video/mp4",
          sizeBytes: 0,
          durationMs:
            variant?.duration
              ? Math.round(variant.duration * 1000)
              : null,
          metadata: {
            sourceType: "mediakit",
            sourceRunId: input.runId,
            sourceHighlightId: selectedHighlight.id,
            sourceArtifactId,
          },
        });
      } else {
        const render =
          selectedRender
            ? selectedRender
            : run.renders.find(
                (item) =>
                  item.id === selectedComposition?.renderId,
              );
        const script = run.scripts.find(
          (item) => item.id === render?.scriptId,
        );
        const kind =
          input.artifactType === "preroll"
            ? "preroll_video"
            : "final_video";
        data = await createCuratedVideoAsset(projectId, {
          kind,
          name:
            script?.title ??
            (kind === "preroll_video"
              ? "精选 AI 前贴视频"
              : "精选成片视频"),
          objectKey:
            `pipeline/${input.runId}/${input.artifactId}.mp4`,
          sourceUrl: videoUrl,
          mimeType: "video/mp4",
          sizeBytes: 0,
          durationMs:
            kind === "preroll_video" && script?.duration
              ? Math.round(script.duration * 1000)
              : null,
          metadata: {
            sourceType: "curated",
            sourceRunId: input.runId,
            sourceArtifactId: input.artifactId,
            sourceScriptId: script?.id,
            promptTitle: script?.title,
          },
        });
      }
    } else if (raw?.assetType === "character_image") {
      const input = characterImageInputSchema.parse(raw);
      data = await createImageAsset(projectId, {
        name: input.name,
        objectKey: input.objectKey,
        sourceUrl: input.sourceUrl,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        metadata: {
          characterId:
            input.characterId ??
            (input.isBaseline
              ? `character-${crypto.randomUUID()}`
              : undefined),
          characterName: input.characterName,
          lookName: input.lookName,
          sourceType: "upload",
          usableAsCharacterReference: true,
          viewType: input.viewType,
          isBaseline: input.isBaseline,
          referenceType: input.isBaseline ? "primary" : "appearance",
        },
      });
    } else if (raw?.assetType === "highlight") {
      const input = highlightInputSchema.parse(raw);
      data = await createHighlightAsset(projectId, {
        name: input.name,
        objectKey: input.objectKey,
        sourceUrl: input.sourceUrl,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        durationMs: input.durationMs,
        metadata: {
          sourceType: "user",
          sourceAssetId: input.sourceAssetId,
          summary: input.summary,
          characterNames: input.characterNames,
        },
      });
    } else {
      const input = sourceAssetInputSchema.parse(raw);
      data = await createSourceAsset(projectId, {
        ...input,
        episodeNumber: input.episodeNumber ?? null,
      });
    }
    if (!data) {
      return NextResponse.json({ error: "项目不存在", requestId }, { status: 404 });
    }
    return NextResponse.json({ data, requestId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "素材登记失败";
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = crypto.randomUUID();
  const { projectId } = await context.params;
  try {
    const raw = await request.json();
    if (raw?.action === "rename_image") {
      const input = imageRenameSchema.parse(raw);
      const updated = await updateImageAssetName(
        projectId,
        input.assetId,
        input.name,
      );
      if (!updated) {
        return NextResponse.json(
          { error: "图片不存在", requestId },
          { status: 404 },
        );
      }
      return NextResponse.json({
        data: {
          id: input.assetId,
          name: input.name,
        },
        requestId,
      });
    }
    const input = durationUpdateSchema.parse(raw);
    const updated = await updateSourceAssetDuration(
      projectId,
      input.assetId,
      input.durationMs,
    );
    if (!updated) {
      return NextResponse.json(
        { error: "素材不存在", requestId },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: input, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "素材时长更新失败";
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = crypto.randomUUID();
  const { projectId } = await context.params;
  try {
    const input = assetDeleteSchema.parse(
      await request.json(),
    );
    if (input.assetType === "character_image") {
      const asset = (
        await getImageAssetsByIdsIncludingIntermediate(
          projectId,
          [input.assetId],
        )
      )[0];
      if (!asset) {
        return NextResponse.json(
          { error: "素材不存在或已删除", requestId },
          { status: 404 },
        );
      }
      if (asset.metadata.avatarAssetId) {
        const client = getArkAssetsClient();
        const targetProjectName = client.getProjectName();
        const assetProjectName =
          asset.metadata.avatarProjectName ?? "default";
        if (assetProjectName !== targetProjectName) {
          throw new Error(
            `该图片属于方舟项目 ${assetProjectName}，当前配置为 ${targetProjectName}，无法安全删除远端素材`,
          );
        }
        try {
          await client.deleteAsset(
            asset.metadata.avatarAssetId,
          );
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : "未知错误";
          throw new Error(
            `Seedance 自定义人像删除失败，本地图片已保留：${detail}`,
          );
        }
      }
    }
    const deleted = await deleteProjectAsset(
      projectId,
      input.assetId,
      input.assetType,
    );
    if (!deleted) {
      return NextResponse.json(
        { error: "素材不存在或已删除", requestId },
        { status: 404 },
      );
    }
    return NextResponse.json({
      data: { id: input.assetId },
      requestId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "素材删除失败";
    return NextResponse.json(
      { error: message, requestId },
      { status: 400 },
    );
  }
}
