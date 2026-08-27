import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaKitProvider } from "@/lib/providers/mediakit";
import { VodWatermarkProvider } from "@/lib/providers/vod-watermark";
import {
  createCuratedVideoAsset,
  createHighlightAsset,
  createSourceAsset,
  getProject,
} from "@/lib/project-store";
import {
  transferRemoteFileToTos,
  type TosStorageStage,
} from "@/lib/tos";
import {
  hasVodWatermarkConfig,
  vodWatermarkCapabilities,
} from "@/lib/env";
import {
  activateRenderRevision,
  enqueuePipelineJob,
  getPipelineProject,
  listPipelineJobs,
  upsertComposition,
} from "@/lib/pipeline-store";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
import { verifyBurnedSubtitles } from "@/lib/subtitle-video-verification";
import {
  clipSubtitlesToRanges,
} from "@/lib/subtitle-post-production";

const videoUrl = z.string().url();
const subtitleSchema = z.object({
  subtitleText: z.string().trim().min(1).max(500),
  startTime: z.number().min(0).max(12 * 60 * 60),
  endTime: z.number().positive().max(12 * 60 * 60),
}).refine(
  (subtitle) => subtitle.endTime > subtitle.startTime,
  {
    message: "结束时间必须晚于开始时间",
  },
);
const timeRangeSchema = z.object({
  startTime: z.number().min(0).max(12 * 60 * 60),
  endTime: z.number().positive().max(12 * 60 * 60),
})
  .refine(
    (range) => range.endTime > range.startTime,
    { message: "结束时间必须晚于开始时间" },
  )
  .refine(
    (range) => range.endTime - range.startTime >= 0.04,
    { message: "单个处理时间段不能短于 0.040 秒" },
  );
const eraseLocationSchema = z.object({
  topLeftX: z.number().min(0).max(1),
  topLeftY: z.number().min(0).max(1),
  bottomRightX: z.number().min(0).max(1),
  bottomRightY: z.number().min(0).max(1),
}).refine(
  (location) =>
    location.bottomRightX > location.topLeftX &&
    location.bottomRightY > location.topLeftY,
  { message: "擦除区域坐标无效" },
);
const sourceAssetContextSchema = z.object({
  sourceAssetId: z.string().min(1),
  sourceAssetType: z.enum([
    "source",
    "highlight",
    "preroll_video",
    "final_video",
  ]),
  sourceAssetName: z.string().trim().min(1).max(180),
});

const startSchema = z.union([
  z.object({
    action: z.literal("start"),
    operation: z.literal("enhance"),
    videoUrl,
    resolution: z.enum(["720p", "1080p", "2k"]),
    fps: z.number().int().min(1).max(120).optional(),
  }),
  z.object({
    action: z.literal("start"),
    operation: z.literal("erase_subtitles"),
    videoUrl,
    modelVersion: z.literal("v5").default("v5"),
    timeSegmentFilter: z.object({
      mode: z.enum(["selected", "skip"]),
      segments: z.array(timeRangeSchema).min(1).max(100),
    }).optional(),
    eraseRatioLocations: z
      .array(eraseLocationSchema)
      .min(1)
      .max(20)
      .optional(),
    subtitleFilter: z.object({
      minTextHeightRatio: z.number().min(0.001).max(0.5).optional(),
      maxTextHeightRatio: z.number().min(0.001).max(0.5).optional(),
      centerOffsetRatio: z.number().min(0).max(0.5).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal("start"),
    operation: z.literal("trim"),
    videoUrl,
    startTime: z.number().min(0).max(12 * 60 * 60),
    endTime: z.number().positive().max(12 * 60 * 60),
  }).refine(
    (input) => input.endTime > input.startTime,
    { message: "裁剪结束时间必须晚于开始时间" },
  ),
  z.object({
    action: z.literal("start"),
    operation: z.literal("concat"),
    videoUrls: z.array(videoUrl).min(1).max(100),
    transitions: z.array(z.string().regex(/^\d+$/)).optional(),
  }),
  z.object({
    action: z.literal("start"),
    operation: z.literal("speed"),
    videoUrl,
    speed: z.number().min(0.25).max(4),
  }),
  z.object({
    action: z.literal("start"),
    operation: z.literal("asr"),
    videoUrl,
    language: z.enum(["cmn-Hans-CN", "eng-US"]).optional(),
  }),
  z.object({
    action: z.literal("start"),
    operation: z.literal("add_subtitles"),
    confirmed: z.literal(true),
    videoUrl,
    subtitles: z.array(subtitleSchema).min(1).max(5000),
    fontType: z
      .enum(["sy_black", "pm_zhengdao", "zhanku_kuaile"])
      .optional(),
    fontSize: z.number().int().min(12).max(160).optional(),
    fontColor: z.string().regex(/^#[0-9A-Fa-f]{8}$/).optional(),
    position: z
      .enum(["bottom_center", "top_center", "center", "lower_third"])
      .optional(),
  }),
  z.object({
    action: z.literal("start"),
    operation: z.literal("watermark"),
    compositionId: z.string().min(1),
    sourceVideoUrl: videoUrl,
    watermarkMode: z.enum(["image", "text"]),
    text: z.string().trim().min(1).max(120).optional(),
  }).refine(
    (input) =>
      input.watermarkMode === "image" ||
      Boolean(input.text),
    { message: "请输入文字水印内容" },
  ),
]);

const statusSchema = z.union([
  z.object({
    action: z.literal("status"),
    operation: z.literal("add_subtitles"),
    taskId: z.string().min(1),
    sourceVideoUrl: videoUrl,
    subtitles: z.array(subtitleSchema).min(1).max(5000),
  }),
  z.object({
    action: z.literal("status"),
    operation: z.enum([
      "enhance",
      "erase_subtitles",
      "trim",
      "concat",
      "speed",
      "asr",
    ]),
    taskId: z.string().min(1),
  }).merge(sourceAssetContextSchema.partial()),
  z.object({
    action: z.literal("status"),
    operation: z.literal("watermark"),
    taskId: z.string().min(1),
    compositionId: z.string().min(1),
    sourceVideoUrl: videoUrl,
    watermarkMode: z.enum(["image", "text"]),
    text: z.string().trim().max(120).optional(),
  }),
]);

const enqueueSchema = z.object({
  action: z.literal("enqueue"),
  operation: z.enum([
    "asr",
    "erase_subtitles",
    "add_subtitles",
    "enhance",
  ]),
  renderId: z.string().min(1),
  videoUrl,
  language: z.enum(["cmn-Hans-CN", "eng-US"]).optional(),
  modelVersion: z.literal("v5").optional(),
  timeSegmentFilter: z.object({
    mode: z.enum(["selected", "skip"]),
    segments: z.array(timeRangeSchema).min(1).max(100),
  }).optional(),
  eraseRatioLocations: z
    .array(eraseLocationSchema)
    .min(1)
    .max(20)
    .optional(),
  subtitleFilter: z.object({
    minTextHeightRatio: z.number().min(0.001).max(0.5).optional(),
    maxTextHeightRatio: z.number().min(0.001).max(0.5).optional(),
    centerOffsetRatio: z.number().min(0).max(0.5).optional(),
  }).optional(),
  subtitleEraseConfig: z.record(z.string(), z.unknown()).optional(),
  subtitles: z.array(subtitleSchema).min(1).max(5000).optional(),
  scope: z.enum(["full", "erase_scope"]).optional(),
  ranges: z.array(timeRangeSchema).max(100).optional(),
  fontType: z
    .enum(["sy_black", "pm_zhengdao", "zhanku_kuaile"])
    .optional(),
  fontSize: z.number().int().min(12).max(160).optional(),
  fontColor: z.string().regex(/^#[0-9A-Fa-f]{8}$/).optional(),
  position: z
    .enum(["bottom_center", "top_center", "center", "lower_third"])
    .optional(),
  resolution: z.enum(["720p", "1080p", "2k"]).optional(),
  fps: z.number().int().min(1).max(120).optional(),
  operationSettings: z.record(z.string(), z.unknown()).optional(),
}).superRefine((input, context) => {
  if (
    input.operation === "add_subtitles" &&
    !input.subtitles?.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["subtitles"],
      message: "请先确认字幕内容",
    });
  }
  if (
    input.operation === "add_subtitles" &&
    input.scope === "erase_scope" &&
    !input.ranges?.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["ranges"],
      message: "部分添加字幕必须绑定有效的擦除时间段",
    });
  }
  if (
    input.operation === "enhance" &&
    !input.resolution
  ) {
    context.addIssue({
      code: "custom",
      path: ["resolution"],
      message: "请选择输出分辨率",
    });
  }
});

const activateRevisionSchema = z.object({
  action: z.literal("activate_revision"),
  renderId: z.string().min(1),
  revisionId: z.string().min(1),
  currentVideoUrl: videoUrl,
});

const inputSchema = z.union([
  startSchema,
  statusSchema,
  enqueueSchema,
  activateRevisionSchema,
]);

function asrSubtitles(result: unknown) {
  if (!result || typeof result !== "object") return [];
  const subtitles = (result as Record<string, unknown>).subtitles;
  if (!Array.isArray(subtitles)) return [];
  return subtitles.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const subtitleText = String(record.subtitle_text ?? "").trim();
    const startTime = Number(record.start_time);
    const endTime = Number(record.end_time);
    if (
      !subtitleText ||
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      endTime <= startTime
    ) {
      return [];
    }
    return [{
      id: `subtitle-${index + 1}`,
      subtitleText,
      startTime,
      endTime,
      speaker:
        typeof record.speaker === "string"
          ? record.speaker
          : undefined,
    }];
  });
}

function storageStageForAsset(
  kind: z.infer<
    typeof sourceAssetContextSchema
  >["sourceAssetType"],
): TosStorageStage {
  if (kind === "source") return "sources";
  if (kind === "highlight") return "highlights";
  if (kind === "preroll_video") return "prerolls";
  return "compositions";
}

async function saveSubtitleErasedAsset(input: {
  project: NonNullable<Awaited<ReturnType<typeof getProject>>>;
  sourceAssetId: string;
  sourceAssetType: z.infer<
    typeof sourceAssetContextSchema
  >["sourceAssetType"];
  sourceAssetName: string;
  taskId: string;
  stored: {
    sourceUrl: string;
    objectKey: string;
    sizeBytes?: number;
  };
}) {
  const name = `${input.sourceAssetName}-字幕擦除`;
  if (input.sourceAssetType === "source") {
    const source = input.project.assets.find(
      (asset) => asset.id === input.sourceAssetId,
    );
    if (!source) throw new Error("原视频资产不存在");
    return createSourceAsset(input.project.id, {
      name,
      objectKey: input.stored.objectKey,
      sourceUrl: input.stored.sourceUrl,
      mimeType: "video/mp4",
      sizeBytes: input.stored.sizeBytes ?? 0,
      durationMs: source.durationMs,
      uploadMode: source.uploadMode,
      episodeNumber: source.episodeNumber,
    });
  }
  if (input.sourceAssetType === "highlight") {
    const source = input.project.highlightAssets.find(
      (asset) => asset.id === input.sourceAssetId,
    );
    if (!source) throw new Error("高光资产不存在");
    return createHighlightAsset(input.project.id, {
      name,
      objectKey: input.stored.objectKey,
      sourceUrl: input.stored.sourceUrl,
      mimeType: "video/mp4",
      sizeBytes: input.stored.sizeBytes ?? 0,
      durationMs: source.durationMs,
      metadata: {
        ...source.metadata,
        sourceAssetId: source.id,
        summary: "字幕擦除处理结果",
      },
    });
  }
  const sourceAssets =
    input.sourceAssetType === "preroll_video"
      ? input.project.prerollAssets
      : input.project.finalAssets;
  const source = sourceAssets.find(
    (asset) => asset.id === input.sourceAssetId,
  );
  if (!source) throw new Error("精选视频资产不存在");
  return createCuratedVideoAsset(input.project.id, {
    kind: input.sourceAssetType,
    name,
    objectKey: input.stored.objectKey,
    sourceUrl: input.stored.sourceUrl,
    mimeType: "video/mp4",
    sizeBytes: input.stored.sizeBytes ?? 0,
    durationMs: source.durationMs,
    metadata: {
      sourceType: "postproduction",
      sourceRunId: source.metadata.sourceRunId,
      sourceArtifactId:
        `${source.metadata.sourceArtifactId}:erase:${input.taskId}`,
      sourceScriptId: source.metadata.sourceScriptId,
      promptTitle: source.metadata.promptTitle,
      sourceAssetId: source.id,
      processingType: "erase_subtitles",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json(
      { error: "项目不存在" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    data: {
      vodWatermarkConfigured: hasVodWatermarkConfig(),
      vodWatermarkCapabilities:
        vodWatermarkCapabilities(),
      watermarkRequiresVodMediaImport: true,
    },
  });
}

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
    if (input.action === "activate_revision") {
      const activeJob = (await listPipelineJobs(projectId)).find(
        (job) =>
          job.kind === "post_production" &&
          job.input.renderId === input.renderId &&
          ["queued", "running"].includes(job.status),
      );
      if (activeJob) {
        return NextResponse.json(
          {
            error: "当前视频仍有处理任务，请完成后再回退版本",
            requestId,
          },
          { status: 409 },
        );
      }
      try {
        const render = await activateRenderRevision(
          projectId,
          {
            renderId: input.renderId,
            revisionId: input.revisionId,
            expectedVideoUrl: input.currentVideoUrl,
          },
        );
        return NextResponse.json({
          data: render,
          requestId,
        });
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : "视频版本回退失败";
        return NextResponse.json(
          { error: message, requestId },
          {
            status: message.includes("已更新")
              ? 409
              : 404,
          },
        );
      }
    }
    if (input.action === "enqueue") {
      const pipeline = await getPipelineProject(projectId);
      const render = pipeline?.renders.find(
        (item) => item.id === input.renderId,
      );
      if (!render?.videoUrl) {
        return NextResponse.json(
          { error: "AI 前贴视频不存在", requestId },
          { status: 404 },
        );
      }
      const currentVideoUrl = render.videoUrl;
      if (currentVideoUrl !== input.videoUrl) {
        return NextResponse.json(
          {
            error: "AI 前贴视频版本已更新，请刷新后重新处理",
            requestId,
          },
          { status: 409 },
        );
      }
      const activeJob = (await listPipelineJobs(projectId)).find(
        (job) =>
          job.kind === "post_production" &&
          job.input.renderId === render.id &&
          ["queued", "running"].includes(job.status),
      );
      if (activeJob) {
        const sameOperation =
          activeJob.input.operation === input.operation;
        const sameSource =
          activeJob.input.sourceVideoUrl === currentVideoUrl &&
          activeJob.input.sourceRevisionId ===
            render.currentRevisionId;
        if (!sameOperation || !sameSource) {
          return NextResponse.json(
            {
              error:
                "当前视频已有其他处理任务，请完成后再执行下一步",
              requestId,
            },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { data: activeJob, reused: true, requestId },
          { status: 202 },
        );
      }
      const { action: _action, videoUrl: sourceVideoUrl, ...settings } =
        input;
      if (
        input.operation === "add_subtitles" &&
        input.scope === "erase_scope"
      ) {
        const clippedSubtitles = clipSubtitlesToRanges(
          (input.subtitles ?? []).map((subtitle, index) => ({
            id: `subtitle-${index + 1}`,
            ...subtitle,
          })),
          input.ranges ?? [],
        );
        if (!clippedSubtitles.length) {
          return NextResponse.json(
            {
              error: "擦除时间段内没有可添加的字幕",
              requestId,
            },
            { status: 400 },
          );
        }
        settings.subtitles = clippedSubtitles.map(
          ({ id: _id, ...subtitle }) => subtitle,
        );
      }
      const job = await enqueuePipelineJob({
        projectId,
        kind: "post_production",
        input: {
          ...settings,
          runId: pipeline?.currentRunId,
          scriptId: render.scriptId,
          sourceRevisionId: render.currentRevisionId,
          sourceVideoUrl,
          productionEntry:
            pipeline?.productionConfig?.productionEntry,
        },
      });
      void runPipelineJobNow(job.id);
      return NextResponse.json(
        { data: job, requestId },
        { status: 202 },
      );
    }
    if (input.operation === "watermark") {
      const pipeline = await getPipelineProject(projectId);
      const composition = pipeline?.compositions.find(
        (item) => item.id === input.compositionId,
      );
      if (!composition?.videoUrl) {
        return NextResponse.json(
          { error: "最终成片不存在", requestId },
          { status: 404 },
        );
      }
      if (composition.videoUrl !== input.sourceVideoUrl) {
        return NextResponse.json(
          {
            error: "最终成片版本已更新，请刷新后重新处理",
            requestId,
          },
          { status: 409 },
        );
      }
      const vod = new VodWatermarkProvider();
      if (input.action === "start") {
        const objectKey =
          composition.objectKey ??
          decodeURIComponent(
            new URL(composition.videoUrl).pathname,
          ).replace(/^\/+/, "");
        const task = await vod.start({
          objectKey,
          mode: input.watermarkMode,
          text: input.text,
          clientToken:
            `${projectId}-${composition.id}-${crypto.randomUUID()}`
              .slice(0, 64),
        });
        return NextResponse.json(
          { data: task, requestId },
          { status: 202 },
        );
      }
      const task = await vod.getTask(input.taskId);
      if (task.status !== "completed") {
        return NextResponse.json(
          { data: task, requestId },
          { status: task.status === "failed" ? 400 : 202 },
        );
      }
      const updated = await upsertComposition(projectId, {
        id: composition.id,
        renderId: composition.renderId,
        highlightId: composition.highlightId,
        status: "completed",
        upstreamId: input.taskId,
        videoUrl: task.videoUrl,
        objectKey: composition.objectKey,
        originalVideoUrl:
          composition.originalVideoUrl ??
          input.sourceVideoUrl,
        processedOperation:
          input.watermarkMode === "image"
            ? "image_watermark"
            : "text_watermark",
        watermarkText:
          input.watermarkMode === "text"
            ? input.text
            : undefined,
        sourceRenderVideoUrl:
          composition.sourceRenderVideoUrl,
        sourceRenderSubtitleVerified:
          composition.sourceRenderSubtitleVerified,
      });
      return NextResponse.json({
        data: { ...task, composition: updated },
        requestId,
      });
    }

    const provider = new MediaKitProvider();
    if (input.action === "status") {
      const task = await provider.getMediaTask(input.taskId);
      if (task.status !== "completed") {
        return NextResponse.json(
          { data: task, requestId },
          { status: task.status === "failed" ? 400 : 202 },
        );
      }
      if (input.operation === "asr") {
        return NextResponse.json({
          data: {
            ...task,
            subtitles: asrSubtitles(task.result),
          },
          requestId,
        });
      }
      if (!task.videoUrl) {
        throw new Error("MediaKit 未返回视频地址");
      }
      const subtitleVerification =
        input.operation === "add_subtitles"
          ? await verifyBurnedSubtitles({
              sourceVideoUrl: input.sourceVideoUrl,
              outputVideoUrl: task.videoUrl,
              subtitles: input.subtitles,
            })
          : undefined;
      const shouldSaveDerivedAsset =
        input.operation === "erase_subtitles" &&
        input.sourceAssetId &&
        input.sourceAssetType &&
        input.sourceAssetName;
      const stored = await transferRemoteFileToTos({
        remoteUrl: task.videoUrl,
        projectId,
        projectName: project.name,
        stage: shouldSaveDerivedAsset
          ? storageStageForAsset(input.sourceAssetType!)
          : "postproduction",
        fileName: shouldSaveDerivedAsset
          ? `${input.sourceAssetName}-字幕擦除.mp4`
          : `${input.operation}-${input.taskId}.mp4`,
      });
      const derivedAsset = shouldSaveDerivedAsset
        ? await saveSubtitleErasedAsset({
            project,
            sourceAssetId: input.sourceAssetId!,
            sourceAssetType: input.sourceAssetType!,
            sourceAssetName: input.sourceAssetName!,
            taskId: input.taskId,
            stored,
          })
        : undefined;
      return NextResponse.json({
        data: {
          ...task,
          videoUrl: stored.sourceUrl,
          objectKey: stored.objectKey,
          derivedAsset,
          subtitleVerification,
        },
        requestId,
      });
    }

    let task;
    switch (input.operation) {
      case "enhance":
        task = await provider.enhanceVideo(input);
        break;
      case "erase_subtitles":
        task = await provider.eraseVideoSubtitles(input);
        break;
      case "trim":
        task = await provider.trimVideo(input);
        break;
      case "concat":
        task = await provider.concatVideos({
          videoUrls: input.videoUrls,
          transitions: input.transitions,
          clientToken: `post-${projectId}-${crypto.randomUUID()}`.slice(0, 64),
        });
        break;
      case "speed":
        task = await provider.adjustVideoSpeed(input);
        break;
      case "asr":
        task = await provider.createAsrSubtitles({
          ...input,
          enableSpeakerInfo: true,
        });
        break;
      case "add_subtitles":
        task = await provider.addSubtitlesToVideo(input);
        break;
    }
    return NextResponse.json(
      { data: task, requestId },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "后期处理请求失败",
        requestId,
      },
      { status: 400 },
    );
  }
}
