import { NextResponse } from "next/server";
import { z } from "zod";
import { getCreativeProvider } from "@/lib/providers";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import {
  createImageAsset,
  getImageAssetsByIdsIncludingIntermediate,
  getProject,
} from "@/lib/project-store";
import { transferRemoteFileToTos } from "@/lib/tos";

const inputSchema = z.object({
  baselineAssetId: z.string().min(1).optional(),
  generationMode: z
    .enum(["text_to_image", "capture_to_image", "reference_image"])
    .optional(),
  characterName: z.string().trim().min(1).max(120),
  lookName: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(4).max(1200),
  model: z
    .enum(["seedream_5_0_lite", "seedream_5_0_pro"])
    .optional(),
  viewType: z
    .enum(["front", "side", "half_body", "full_body", "other"])
    .default("front"),
  aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
  isBaseline: z.boolean().default(false),
});

const imageSizes = {
  seedream_5_0_lite: {
    "9:16": "2304x4096",
    "16:9": "4096x2304",
  },
  seedream_5_0_pro: {
    "9:16": "1152x2048",
    "16:9": "2048x1152",
  },
} as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = crypto.randomUUID();
  const { projectId } = await context.params;
  try {
    const input = inputSchema.parse(await request.json());
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: "项目不存在", requestId },
        { status: 404 },
      );
    }
    const baseline = input.baselineAssetId
      ? (
          await getImageAssetsByIdsIncludingIntermediate(projectId, [
            input.baselineAssetId,
          ])
        )[0]
      : undefined;
    if (input.baselineAssetId && !baseline) {
      return NextResponse.json(
        { error: "基准图不存在或不属于当前项目", requestId },
        { status: 404 },
      );
    }
    if (
      input.generationMode === "capture_to_image" &&
      baseline?.metadata.sourceType !== "video_capture"
    ) {
      return NextResponse.json(
        { error: "视频截图生成缺少有效的中间截帧", requestId },
        { status: 400 },
      );
    }
    const model =
      input.model ??
      (await getCreativeSettings()).imageModel;
    const size = imageSizes[model][input.aspectRatio];
    const generationMode =
      input.generationMode ??
      (baseline?.metadata.sourceType === "video_capture"
        ? "capture_to_image"
        : baseline
          ? "reference_image"
          : "text_to_image");
    const referenceInstruction =
      generationMode === "capture_to_image"
        ? "仅保留参考图中的目标人物身份、五官、年龄、体型和指定造型；完整移除背景、其他人物、字幕、水印、边框和无关物体，生成主体清晰、背景干净的单人角色图片。"
        : baseline
          ? "保持参考图人物身份、五官、年龄与体型完全一致。"
          : "";
    const result = await getCreativeProvider().generateImage({
      prompt:
        referenceInstruction +
        `角色：${input.characterName}。妆造：${input.lookName}。` +
        `${input.prompt}`,
      size,
      ...(baseline
        ? { referenceUrls: [baseline.sourceUrl] }
        : {}),
      model,
    });
    const remoteUrl = result.urls[0];
    if (!remoteUrl) throw new Error("Seedream 未返回图片");
    const nameSuffix =
      generationMode === "capture_to_image"
        ? "截帧生图"
        : generationMode === "text_to_image"
          ? "文生图"
          : "参考图生成";
    const stored = await transferRemoteFileToTos({
      remoteUrl,
      projectId,
      projectName: project.name,
      stage: "character_images",
      fileName:
        `${input.characterName}-${input.lookName}-${nameSuffix}.jpg`,
    });
    const sourceType =
      generationMode === "capture_to_image"
        ? "seedream_from_capture"
        : generationMode === "text_to_image"
          ? "seedream_text"
          : "seedream";
    const asset = await createImageAsset(projectId, {
      name: `${input.characterName}-${input.lookName}-${nameSuffix}`,
      objectKey: stored.objectKey,
      sourceUrl: stored.sourceUrl,
      mimeType: "image/jpeg",
      sizeBytes: stored.sizeBytes ?? 0,
      metadata: {
        characterId: baseline?.metadata.characterId,
        characterName: input.characterName,
        lookName: input.lookName,
        sourceType,
        usableAsCharacterReference: true,
        viewType: input.viewType,
        isBaseline: input.isBaseline,
        seedreamModel: model,
        aspectRatio: input.aspectRatio,
        imageSize: size,
        prompt: input.prompt,
        sourceAssetId:
          generationMode === "capture_to_image"
            ? baseline?.metadata.sourceAssetId
            : baseline?.metadata.sourceType === "seedream"
            ? baseline.metadata.sourceAssetId ??
              baseline.id
            : baseline?.id,
        sourceTimestamp:
          generationMode === "capture_to_image"
            ? baseline?.metadata.sourceTimestamp
            : undefined,
        sourceCaptureAssetId:
          generationMode === "capture_to_image"
            ? baseline?.id
            : undefined,
        referenceType: "appearance",
      },
    });
    return NextResponse.json({ data: asset, requestId }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "角色图片生成失败";
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }
}
