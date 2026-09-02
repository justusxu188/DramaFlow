import {
  createHighlightAsset,
  getProject,
  listHighlightAssets,
  type ImageAsset,
} from "@/lib/project-store";
import {
  claimNextPipelineJob,
  claimPipelineJob,
  commitRenderRevision,
  confirmScripts,
  enqueuePipelineJob,
  findReusableHighlightAnalysis,
  findReusableMediaUnderstanding,
  getPipelineProject,
  getPipelineProjectRun,
  listPipelineJobs,
  reclaimStalePipelineJobs,
  requeuePipelineJob,
  saveAnalysis,
  saveCompiledVideoPrompt,
  saveHighlightAnalysis,
  saveMediaUnderstanding,
  saveProductionPlan,
  saveScripts,
  saveSharedStoryContext,
  saveStoryArcs,
  saveTransitionAnchor,
  scriptContentHash,
  updatePipelineJob,
  upsertComposition,
  upsertHighlight,
  upsertRender,
  type PipelineJob,
  type RenderVariant,
  type ScriptVariant,
} from "@/lib/pipeline-store";
import {
  buildSharedStoryContext,
  mergeHighlightAnalyses,
} from "@/lib/highlight-analysis";
import {
  insertCharacterAssetMentions,
  resolveCharacterAssetMentionsForSubmission,
  resolveSubmittedSeedancePrompt,
  withSubmittedSeedancePrompts,
} from "@/lib/seedance-prompt";
import { ArkCreativeProvider } from "@/lib/providers/ark";
import { MediaKitProvider } from "@/lib/providers/mediakit";
import { getCreativeProvider } from "@/lib/providers";
import type {
  HighlightResult,
  ScriptDraft,
  StorylineResult,
} from "@/lib/providers/types";
import {
  allocateHighlightOutputs,
  highlightDurationRange,
  normalizeProductionConfig,
  recommendHighlightSettings,
  splitDurationByLimit,
  videoGenerationSegmentLimit,
  type ProductionConfig,
} from "@/lib/production-config";
import { transferRemoteFileToTos } from "@/lib/tos";
import {
  prepareVideoForSubtitleBurn,
  type SubtitleVideoPreparation,
} from "@/lib/subtitle-video-normalization";
import { verifyBurnedSubtitles } from "@/lib/subtitle-video-verification";
import { planVideoSegments } from "@/lib/video-shot-segmentation";
import { env } from "@/lib/env";
import { isTransientNetworkError } from "@/lib/network-errors";

export { planVideoSegments } from "@/lib/video-shot-segmentation";

/**
 * 瞬时网络错误（公网链路抖动）的退避重试上限。
 * 这类重试不消耗 attempts，指数退避 30s 起、上限 5 分钟，
 * 可覆盖约 30 分钟的故障窗口；超过后回落到常规 attempts 失败逻辑。
 */
const MAX_TRANSIENT_RETRIES = 8;

const ark = new ArkCreativeProvider();

function value<T>(input: Record<string, unknown>, key: string) {
  return input[key] as T;
}

function sourceVideoSnapshot(input: Record<string, unknown>, fallback: string[]) {
  const urls = input.videoUrls;
  if (Array.isArray(urls)) {
    const validUrls = urls.filter((url): url is string => typeof url === "string" && url.length > 0);
    if (validUrls.length) return validUrls.slice(0, 30);
  }
  return fallback.slice(0, 30);
}

function creativeSnapshot(input: Record<string, unknown>) {
  return {
    ...normalizeProductionConfig(input as Partial<ProductionConfig>),
    prerollType: value<string>(input, "prerollType") || "story_linked",
    prerollCreativeSystemPrompt:
      value<string>(
        input,
        "prerollCreativeSystemPrompt",
      ) || "",
    prerollScriptSystemPrompt:
      value<string>(input, "prerollScriptSystemPrompt") || "",
    videoPromptSystemPrompt:
      value<string>(input, "videoPromptSystemPrompt") || "",
  };
}

type UploadedHighlightSnapshot = {
  assetId: string;
  highlightId: string;
  name: string;
  videoUrl: string;
  duration: number;
  sizeBytes?: number;
};

export function uploadedHighlightSnapshot(
  input: Record<string, unknown>,
) {
  if (!Array.isArray(input.uploadedHighlights)) return [];
  return input.uploadedHighlights.filter(
    (item): item is UploadedHighlightSnapshot =>
      Boolean(
        item &&
        typeof item === "object" &&
        typeof item.assetId === "string" &&
        typeof item.highlightId === "string" &&
        typeof item.name === "string" &&
        typeof item.videoUrl === "string" &&
        typeof item.duration === "number",
      ),
  );
}

export function shouldContinueAfterHighlight(
  input: Record<string, unknown>,
) {
  return (
    value<boolean>(input, "autoRun") !== false &&
    normalizeProductionConfig(
      input as Partial<ProductionConfig>,
    ).productionEntry !== "batch_highlights"
  );
}

export function buildBatchHighlightAssetInput(input: {
  projectName: string;
  runId?: string;
  sourceHighlightId: string;
  index: number;
  objectKey: string;
  sourceUrl: string;
  sizeBytes?: number;
  durationSeconds?: number;
  summary: string;
}) {
  return {
    name: `${input.projectName}-高光-${input.index + 1}`,
    objectKey: input.objectKey,
    sourceUrl: input.sourceUrl,
    mimeType: "video/mp4",
    sizeBytes: input.sizeBytes ?? 0,
    durationMs: input.durationSeconds
      ? Math.round(input.durationSeconds * 1000)
      : null,
    metadata: {
      sourceType: "mediakit" as const,
      sourceRunId: input.runId,
      sourceHighlightId: input.sourceHighlightId,
      summary: input.summary,
    },
  };
}

export function resolveProductionConfig(
  jobInput: Record<string, unknown>,
  savedConfig?: ProductionConfig,
) {
  return normalizeProductionConfig({
    ...savedConfig,
    ...(jobInput as Partial<ProductionConfig>),
  });
}

export function resolveAgentScriptReferences(
  script: Pick<
    ScriptVariant,
    "shots"
  >,
  imageAssets: ImageAsset[],
) {
  const characterNames = [
    ...new Set(
      script.shots.flatMap(
        (shot) => shot.characters ?? [],
      ),
    ),
  ].filter(Boolean);
  const missingCharacterNames =
    characterNames.filter(
      (characterName) =>
        !imageAssets.some(
          (asset) =>
            asset.metadata.characterName ===
            characterName,
        ),
    );
  const referenceUrls = [
    ...new Set(
      imageAssets
        .filter((asset) =>
          characterNames.includes(
            asset.metadata.characterName,
          ),
        )
        .map((asset) => asset.sourceUrl),
    ),
  ].slice(0, 8);
  return {
    characterNames,
    missingCharacterNames,
    referenceUrls,
  };
}

export function splitVideoDuration(totalDuration: number, segmentLimit: number) {
  return splitDurationByLimit(totalDuration, segmentLimit);
}

async function waitForUpstream(job: PipelineJob) {
  if (!job.upstreamId) throw new Error("缺少供应商任务 ID");
  const task = await getCreativeProvider().getMediaTask(job.upstreamId);
  if (task.status === "failed" || task.status === "canceled") {
    throw new Error(task.error ?? "供应商任务失败");
  }
  if (task.status !== "completed") {
    await requeuePipelineJob(job.id, {
      upstreamId: job.upstreamId,
      progress: task.progress,
    });
    return null;
  }
  return task;
}

async function processAnalysis(job: PipelineJob) {
  if (!job.upstreamId) {
    const project = await getProject(job.projectId);
    if (!project) throw new Error("项目不存在");
    const videoUrls = sourceVideoSnapshot(
      job.input,
      project.assets.map((asset) => asset.sourceUrl),
    );
    if (!videoUrls.length) throw new Error("请至少选择一个源视频");
    const task = await getCreativeProvider().analyzeStoryline({
      videoUrls,
      clientToken: `${job.projectId}-${job.id}`.slice(0, 64),
      enableSnapshot:
        normalizeProductionConfig(
          job.input as Partial<ProductionConfig>,
        ).characterMode === "drama_character",
    });
    await requeuePipelineJob(job.id, {
      upstreamId: task.id,
      progress: 3,
      input: { ...job.input, videoUrls },
    });
    return;
  }
  const task = await waitForUpstream(job);
  if (!task) return;
  const analysis = task.result as StorylineResult;
  if (!analysis?.clips?.length) throw new Error("故事线分析未返回剧情片段");
  const project = await getProject(job.projectId);
  const clips = await Promise.all(
    analysis.clips.map(async (clip) => {
      if (!clip.snapshotUrl) return clip;
      try {
        const stored = await transferRemoteFileToTos({
          remoteUrl: clip.snapshotUrl,
          projectId: job.projectId,
          projectName: project?.name,
          runId: job.runId,
          stage: "analysis",
          fileName: `storyline-clip-${clip.index + 1}.jpg`,
        });
        return { ...clip, snapshotUrl: stored.sourceUrl };
      } catch {
        return clip;
      }
    }),
  );
  const storedAnalysis = { ...analysis, clips };
  const productionConfig = normalizeProductionConfig(
    job.input as Partial<ProductionConfig>,
  );
  const highlightRecommendation = recommendHighlightSettings(
    storedAnalysis.duration,
    productionConfig,
  );
  const sourceAssetIds = Array.isArray(job.input.sourceAssetIds)
    ? job.input.sourceAssetIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  await saveAnalysis(
    job.projectId,
    storedAnalysis,
    value<boolean>(job.input, "autoRun") === false,
    sourceAssetIds,
    job.runId,
  );
  await saveProductionPlan(
    job.projectId,
    productionConfig,
    highlightRecommendation,
    undefined,
    sourceAssetIds,
    job.runId,
  );
  await updatePipelineJob(job.id, {
    status: "completed",
    progress: 100,
    result: storedAnalysis,
  });
  if (value<boolean>(job.input, "autoRun") === false) return;
  await enqueuePipelineJob({
    projectId: job.projectId,
    kind: "mine_arcs",
    input: {
      runId: job.runId,
      autoRun: value<boolean>(job.input, "autoRun") !== false,
      videoUrls: sourceVideoSnapshot(
        job.input,
        storedAnalysis.sourceVideoInfo.map((video) => video.url),
      ),
      uploadedHighlights:
        uploadedHighlightSnapshot(job.input),
      storyContextSource:
        value<string>(
          job.input,
          "storyContextSource",
        ),
      ...creativeSnapshot(job.input),
    },
    parentId: job.id,
  });
}

async function processHighlightAnalysis(job: PipelineJob) {
  const sourceHighlightAssetId = value<string>(
    job.input,
    "sourceHighlightAssetId",
  );
  const highlightId = value<string>(job.input, "highlightId");
  const sourceName = value<string>(job.input, "sourceName");
  const videoUrl = value<string>(job.input, "videoUrl");
  const assetRevisionKey = value<string>(
    job.input,
    "assetRevisionKey",
  );
  const analysisProfileHash = value<string>(
    job.input,
    "analysisProfileHash",
  );
  if (
    !job.runId ||
    !sourceHighlightAssetId ||
    !highlightId ||
    !sourceName ||
    !videoUrl
  ) {
    throw new Error("独立高光剧情理解缺少素材或批次信息");
  }
  if (!job.upstreamId) {
    const reusableMedia =
      assetRevisionKey && analysisProfileHash
        ? await findReusableMediaUnderstanding(
            job.projectId,
            assetRevisionKey,
            analysisProfileHash,
          )
        : null;
    if (reusableMedia) {
      await saveHighlightAnalysis(job.projectId, job.runId, {
        sourceHighlightAssetId,
        highlightId,
        sourceName,
        sourceVideoUrl: videoUrl,
        analysis: reusableMedia.understanding.analysis,
        reusedFromRunId: reusableMedia.runId,
      });
      await saveMediaUnderstanding(job.projectId, job.runId, {
        ...reusableMedia.understanding,
        assetId: sourceHighlightAssetId,
        sourceKind: "highlight",
        sourceName,
        sourceVideoUrl: videoUrl,
        reusedFromRunId: reusableMedia.runId,
      });
      await updatePipelineJob(job.id, {
        status: "completed",
        progress: 100,
        result: reusableMedia.understanding.analysis,
      });
      return;
    }
    const reusable = await findReusableHighlightAnalysis(
      job.projectId,
      sourceHighlightAssetId,
      videoUrl,
    );
    if (reusable) {
      await saveHighlightAnalysis(job.projectId, job.runId, {
        sourceHighlightAssetId,
        highlightId,
        sourceName,
        sourceVideoUrl: videoUrl,
        analysis: reusable.analysis.analysis,
        reusedFromRunId: reusable.runId,
      });
      if (assetRevisionKey && analysisProfileHash) {
        await saveMediaUnderstanding(job.projectId, job.runId, {
          assetId: sourceHighlightAssetId,
          assetRevisionKey,
          sourceKind: "highlight",
          sourceName,
          sourceVideoUrl: videoUrl,
          analysisProfileHash,
          analysis: reusable.analysis.analysis,
          reusedFromRunId: reusable.runId,
        });
      }
      await updatePipelineJob(job.id, {
        status: "completed",
        progress: 100,
        result: reusable.analysis.analysis,
      });
      return;
    }
    const task = await getCreativeProvider().analyzeStoryline({
      videoUrls: [videoUrl],
      clientToken: `${job.projectId}-${job.id}`.slice(0, 64),
      enableSnapshot:
        normalizeProductionConfig(
          job.input as Partial<ProductionConfig>,
        ).characterMode === "drama_character",
    });
    await requeuePipelineJob(job.id, {
      upstreamId: task.id,
      progress: 3,
    });
    return;
  }
  const task = await waitForUpstream(job);
  if (!task) return;
  const analysis = task.result as StorylineResult;
  if (!analysis?.clips?.length) {
    throw new Error("独立高光剧情理解未返回剧情片段");
  }
  const project = await getProject(job.projectId);
  const clips = await Promise.all(
    analysis.clips.map(async (clip) => {
      if (!clip.snapshotUrl) return clip;
      try {
        const stored = await transferRemoteFileToTos({
          remoteUrl: clip.snapshotUrl,
          projectId: job.projectId,
          projectName: project?.name,
          runId: job.runId,
          stage: "analysis",
          fileName:
            `${sourceHighlightAssetId}-clip-${clip.index + 1}.jpg`,
        });
        return { ...clip, snapshotUrl: stored.sourceUrl };
      } catch {
        return clip;
      }
    }),
  );
  const storedAnalysis = { ...analysis, clips };
  await saveHighlightAnalysis(job.projectId, job.runId, {
    sourceHighlightAssetId,
    highlightId,
    sourceName,
    sourceVideoUrl: videoUrl,
    analysis: storedAnalysis,
  });
  if (assetRevisionKey && analysisProfileHash) {
    await saveMediaUnderstanding(job.projectId, job.runId, {
      assetId: sourceHighlightAssetId,
      assetRevisionKey,
      sourceKind: "highlight",
      sourceName,
      sourceVideoUrl: videoUrl,
      analysisProfileHash,
      analysis: storedAnalysis,
    });
  }
  await updatePipelineJob(job.id, {
    status: "completed",
    progress: 100,
    result: storedAnalysis,
  });
}

async function processMediaAnalysis(job: PipelineJob) {
  const assetId = value<string>(job.input, "assetId");
  const assetRevisionKey = value<string>(
    job.input,
    "assetRevisionKey",
  );
  const analysisProfileHash = value<string>(
    job.input,
    "analysisProfileHash",
  );
  const sourceName = value<string>(job.input, "sourceName");
  const videoUrl = value<string>(job.input, "videoUrl");
  const sourceKind = value<"source" | "highlight">(
    job.input,
    "sourceKind",
  );
  if (
    !job.runId ||
    !assetId ||
    !assetRevisionKey ||
    !analysisProfileHash ||
    !sourceName ||
    !videoUrl ||
    !["source", "highlight"].includes(sourceKind)
  ) {
    throw new Error("素材剧情理解缺少素材、版本或批次信息");
  }
  if (!job.upstreamId) {
    const reusable = await findReusableMediaUnderstanding(
      job.projectId,
      assetRevisionKey,
      analysisProfileHash,
    );
    if (reusable) {
      await saveMediaUnderstanding(job.projectId, job.runId, {
        ...reusable.understanding,
        assetId,
        sourceKind,
        sourceName,
        sourceVideoUrl: videoUrl,
        reusedFromRunId: reusable.runId,
      });
      await updatePipelineJob(job.id, {
        status: "completed",
        progress: 100,
        result: reusable.understanding.analysis,
      });
      return;
    }
    const task = await getCreativeProvider().analyzeStoryline({
      videoUrls: [videoUrl],
      clientToken: `${job.projectId}-${job.id}`.slice(0, 64),
      enableSnapshot: false,
    });
    await requeuePipelineJob(job.id, {
      upstreamId: task.id,
      progress: 3,
    });
    return;
  }
  const task = await waitForUpstream(job);
  if (!task) return;
  const analysis = task.result as StorylineResult;
  if (!analysis?.clips?.length) {
    throw new Error("素材剧情理解未返回剧情片段");
  }
  await saveMediaUnderstanding(job.projectId, job.runId, {
    assetId,
    assetRevisionKey,
    sourceKind,
    sourceName,
    sourceVideoUrl: videoUrl,
    analysisProfileHash,
    analysis,
  });
  await updatePipelineJob(job.id, {
    status: "completed",
    progress: 100,
    result: analysis,
  });
}

async function processHighlightContext(job: PipelineJob) {
  if (!job.runId) {
    throw new Error("共享剧情上下文任务缺少生产批次");
  }
  const analysisJobIds = Array.isArray(
    job.input.analysisJobIds,
  )
    ? job.input.analysisJobIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const backgroundAnalysisJobIds = Array.isArray(
    job.input.backgroundAnalysisJobIds,
  )
    ? job.input.backgroundAnalysisJobIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const requiredJobIds = [
    ...analysisJobIds,
    ...backgroundAnalysisJobIds,
  ];
  const childJobs = (await listPipelineJobs(job.projectId))
    .filter((candidate) => requiredJobIds.includes(candidate.id));
  const failed = childJobs.filter(
    (candidate) => candidate.status === "failed",
  );
  if (failed.length > 0) {
    throw new Error(
      `有 ${failed.length} 个素材剧情理解任务失败`,
    );
  }
  const completedCount = childJobs.filter(
    (candidate) => candidate.status === "completed",
  ).length;
  if (
    analysisJobIds.length === 0 ||
    completedCount < requiredJobIds.length
  ) {
    await requeuePipelineJob(job.id, {
      progress: requiredJobIds.length
        ? Math.max(
            1,
            Math.round(
              90 * completedCount / requiredJobIds.length,
            ),
          )
        : 1,
    });
    return;
  }
  const pipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  const uploadedHighlights = uploadedHighlightSnapshot(job.input);
  const analyses = uploadedHighlights.map((uploaded) =>
    pipeline?.highlightAnalyses?.find(
      (analysis) =>
        analysis.sourceHighlightAssetId === uploaded.assetId,
    ),
  );
  if (
    !pipeline ||
    analyses.some((analysis) => !analysis)
  ) {
    throw new Error("高光剧情理解结果不完整");
  }
  const completeAnalyses = analyses.filter(
    (analysis): analysis is NonNullable<typeof analysis> =>
      Boolean(analysis),
  );
  const backgroundAssetIds = Array.isArray(
    job.input.backgroundAssetIds,
  )
    ? job.input.backgroundAssetIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const backgroundAnalyses = backgroundAssetIds.map(
    (assetId) =>
      pipeline.mediaUnderstandings?.find(
        (understanding) =>
          understanding.assetId === assetId &&
          understanding.sourceKind === "source",
      ),
  );
  if (
    backgroundAnalyses.some((analysis) => !analysis)
  ) {
    throw new Error("原剧背景理解结果不完整");
  }
  const completeBackgroundAnalyses =
    backgroundAnalyses.filter(
      (
        analysis,
      ): analysis is NonNullable<typeof analysis> =>
        Boolean(analysis),
    );
  const baseContext = buildSharedStoryContext(
    completeAnalyses,
    completeBackgroundAnalyses,
  );
  let context = baseContext;
  try {
    const synthesized =
      await ark.synthesizeSharedStoryContext(
        completeAnalyses,
        completeBackgroundAnalyses,
      );
    context = {
      ...baseContext,
      ...synthesized,
      tags: [
        ...new Set([
          ...baseContext.tags,
          ...synthesized.tags,
        ]),
      ],
    };
  } catch {
    // Local analyses remain usable when shared-context synthesis fails.
  }
  const mergedAnalysis = mergeHighlightAnalyses(
    completeAnalyses,
  );
  await saveSharedStoryContext(
    job.projectId,
    job.runId,
    context,
    mergedAnalysis,
  );
  await updatePipelineJob(job.id, {
    status: "completed",
    progress: 100,
    result: context,
  });
  for (const uploaded of uploadedHighlights) {
    await enqueuePipelineJob({
      projectId: job.projectId,
      kind: "mine_arcs",
      input: {
        runId: job.runId,
        autoRun: true,
        sourceHighlightAssetId: uploaded.assetId,
        highlightId: uploaded.highlightId,
        uploadedHighlights: [uploaded],
        storyContextSource:
          value<string>(
            job.input,
            "storyContextSource",
          ) || "selected_highlights",
        ...creativeSnapshot(job.input),
      },
      parentId: job.id,
    });
  }
}

async function processMineArcs(job: PipelineJob) {
  const pipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  const project = await getProject(job.projectId);
  const sourceHighlightAssetId = value<string>(
    job.input,
    "sourceHighlightAssetId",
  );
  const highlightId = value<string>(
    job.input,
    "highlightId",
  );
  const localAnalysis = sourceHighlightAssetId
    ? pipeline?.highlightAnalyses?.find(
        (entry) =>
          entry.sourceHighlightAssetId ===
          sourceHighlightAssetId,
      )
    : undefined;
  const analysis = localAnalysis?.analysis ?? pipeline?.analysis;
  if (!analysis || !project) throw new Error("缺少剧情理解结果");
  const generatedArcs = await ark.mineStoryArcs({
    analysis,
    sharedStoryContext: pipeline?.sharedStoryContext,
    genre: project.genre,
    count: sourceHighlightAssetId
      ? 1
      : normalizeProductionConfig(
          job.input as Partial<ProductionConfig>,
        ).sellingPointCount,
  });
  const arcs = generatedArcs.map((arc, index) => ({
    ...arc,
    id: sourceHighlightAssetId
      ? `${highlightId}-arc-${index + 1}`
      : arc.id,
    sourceHighlightAssetId:
      sourceHighlightAssetId || undefined,
    highlightId: highlightId || undefined,
  }));
  if (!arcs.length) throw new Error("未提炼出有证据的爽点故事线");
  await saveStoryArcs(
    job.projectId,
    arcs,
    job.runId,
    Boolean(sourceHighlightAssetId),
  );
  await updatePipelineJob(job.id, { status: "completed", progress: 100, result: arcs });
  if (value<boolean>(job.input, "autoRun") !== false) {
    const config = normalizeProductionConfig(
      job.input as Partial<ProductionConfig>,
    );
    const uploadedHighlights =
      uploadedHighlightSnapshot(job.input);
    if (
      config.productionEntry === "uploaded_highlights" &&
      uploadedHighlights.length > 0
    ) {
      for (const [index, uploaded] of
        uploadedHighlights.entries()) {
        const arc = arcs[index % arcs.length];
        await upsertHighlight(job.projectId, {
          id: uploaded.highlightId,
          arcId: arc.id,
          mode: "uploaded",
          status: "completed",
          result: {
            duration: uploaded.duration,
            videoUrls: [uploaded.videoUrl],
            variants: [{
              index: 0,
              duration: uploaded.duration,
              size: uploaded.sizeBytes ?? 0,
              videoUrl: uploaded.videoUrl,
              clips: [],
            }],
            storyboard: [],
          },
        }, job.runId);
        await enqueuePipelineJob({
          projectId: job.projectId,
          kind: "transition",
          input: {
            runId: job.runId,
            arcId: arc.id,
            highlightId: uploaded.highlightId,
            autoRun: true,
            storyContextSource:
              value<string>(
                job.input,
                "storyContextSource",
              ),
            ...creativeSnapshot(job.input),
          },
          parentId: job.id,
        });
      }
      return;
    }
    const videoUrls = sourceVideoSnapshot(
      job.input,
      analysis.sourceVideoInfo.map((video) => video.url),
    );
    const allocations = allocateHighlightOutputs(
      config.highlightTargetCount,
      arcs.length,
    );
    const activeArcs = arcs.slice(0, allocations.length);
    for (const [arcIndex, arc] of activeArcs.entries()) {
      const highlightId = `highlight-${crypto.randomUUID()}`;
      const highlightOutputCount = allocations[arcIndex];
      await upsertHighlight(job.projectId, {
        id: highlightId,
        arcId: arc.id,
        mode: "montage",
        status: "queued",
      }, job.runId);
      await enqueuePipelineJob({
        projectId: job.projectId,
        kind: "highlight",
        input: {
          runId: job.runId,
          arcId: arc.id,
          highlightId,
          autoRun:
            normalizeProductionConfig(
              job.input as Partial<ProductionConfig>,
            ).productionEntry !== "batch_highlights",
          videoUrls,
          ...creativeSnapshot(job.input),
          highlightOutputCount,
        },
        parentId: job.id,
      });
    }
  }
}

async function processHighlight(job: PipelineJob) {
  const pipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  const project = await getProject(job.projectId);
  const arcId = value<string>(job.input, "arcId");
  const highlightId = value<string>(job.input, "highlightId");
  const arc = pipeline?.arcs.find((item) => item.id === arcId);
  const config = normalizeProductionConfig(
    job.input as Partial<ProductionConfig>,
  );
  const isBatchHighlights =
    config.productionEntry === "batch_highlights";
  if (!project) throw new Error("高光任务缺少项目信息");
  if (
    !isBatchHighlights &&
    (!pipeline?.analysis || !arc)
  ) {
    throw new Error("高光任务缺少故事线输入");
  }
  if (!job.upstreamId) {
    const durationRange =
      highlightDurationRange(config);
    const highlightOutputCount = Math.max(
      1,
      Math.round(
        value<number>(
          job.input,
          "highlightOutputCount",
        ) || config.highlightTargetCount,
      ),
    );
    const videoUrls = sourceVideoSnapshot(
      job.input,
      project.assets.map((asset) => asset.sourceUrl),
    );
    if (!videoUrls.length) throw new Error("高光任务没有可用的源视频");
    const task = await getCreativeProvider().createHighlight({
      videoUrls,
      mode: "montage",
      title: project.name,
      prompt:
        arc?.highlightPrompt ||
        config.highlightSegmentPrompt ||
        undefined,
      clientToken: `${job.projectId}-${highlightId}`.slice(0, 64),
      settings: {
        minDuration: durationRange.minDuration,
        maxDuration: durationRange.maxDuration,
        maxNumber: highlightOutputCount,
        cutMode: config.highlightCutMode,
        segmentPrompt:
          config.highlightSegmentPrompt ||
          arc?.highlightPrompt ||
          "自动识别剧情冲突、反转和高信息密度片段",
        startPrompt: config.highlightStartPrompt,
        endingPrompt: config.highlightEndingPrompt,
        enableOpeningHook: config.enableOpeningHook,
        openingHookMinDuration: config.openingHookMinDuration,
        openingHookMaxDuration: config.openingHookMaxDuration,
        openingHookMinScore: config.openingHookMinScore,
        openingHookPrompt: config.highlightStartPrompt,
        template: config.highlightTemplate,
        hint: config.highlightHint,
      },
    });
    await upsertHighlight(job.projectId, {
      id: highlightId,
      arcId,
      mode: "montage",
      status: "running",
      upstreamId: task.id,
    }, job.runId);
    await requeuePipelineJob(job.id, { upstreamId: task.id, progress: 3 });
    return;
  }
  const task = await waitForUpstream(job);
  if (!task) return;
  const result = task.result as HighlightResult;
  if (!result?.videoUrls?.length) {
    throw new Error(
      "MediaKit 未匹配到符合条件的高光片段，请放宽目标时长或筛选要求后重试",
    );
  }
  const outputLimit = Math.max(
    1,
    Math.round(
      value<number>(job.input, "highlightOutputCount") ||
      normalizeProductionConfig(job.input as Partial<ProductionConfig>).highlightTargetCount,
    ),
  );
  const outputUrls = result.videoUrls.slice(0, outputLimit);
  const storedUrls: string[] = [];
  const storedFiles: Array<{
    objectKey: string;
    sourceUrl: string;
    sizeBytes?: number;
  }> = [];
  for (const [index, remoteUrl] of outputUrls.entries()) {
    const stored = await transferRemoteFileToTos({
      remoteUrl,
      projectId: job.projectId,
      projectName: project.name,
      runId: job.runId,
      stage: "highlights",
      fileName: `mediakit-highlight-${highlightId}-${index + 1}.mp4`,
    });
    storedUrls.push(stored.sourceUrl);
    storedFiles.push(stored);
  }
  const storedResult: HighlightResult = {
    ...result,
    videoUrls: storedUrls,
    variants: result.variants.slice(0, outputLimit).map((variant, index) => ({
      ...variant,
      videoUrl: storedUrls[index] ?? variant.videoUrl,
    })),
  };
  const highlightBranches = storedUrls.map((videoUrl, index) => ({
    id: index === 0 ? highlightId : `${highlightId}-variant-${index + 1}`,
    result: {
      ...storedResult,
      videoUrls: [videoUrl],
      variants: storedResult.variants[index]
        ? [storedResult.variants[index]]
        : [],
    },
  }));
  for (const branch of highlightBranches) {
    await upsertHighlight(job.projectId, {
      id: branch.id,
      arcId,
      mode: "montage",
      status: "completed",
      upstreamId: job.upstreamId,
      result: branch.result,
    }, job.runId);
  }
  if (
    normalizeProductionConfig(
      job.input as Partial<ProductionConfig>,
    ).productionEntry === "batch_highlights"
  ) {
    const existing = await listHighlightAssets(job.projectId);
    for (const [index, stored] of storedFiles.entries()) {
      const sourceHighlightId =
        index === 0
          ? highlightId
          : `${highlightId}-variant-${index + 1}`;
      if (
        existing.some(
          (asset) =>
            asset.metadata.sourceHighlightId ===
            sourceHighlightId,
        )
      ) {
        continue;
      }
      await createHighlightAsset(
        job.projectId,
        buildBatchHighlightAssetInput({
          projectName: project.name,
          runId: job.runId,
          sourceHighlightId,
          index,
          objectKey: stored.objectKey,
          sourceUrl: stored.sourceUrl,
          sizeBytes: stored.sizeBytes,
          durationSeconds:
            storedResult.variants[index]?.duration,
          summary:
            arc?.pitch ??
            "MediaKit 高光智剪自动生成",
        }),
      );
    }
  }
  await updatePipelineJob(job.id, {
    status: "completed",
    progress: 100,
    result: storedResult,
  });
  if (shouldContinueAfterHighlight(job.input)) {
    for (const branch of highlightBranches) {
      await enqueuePipelineJob({
        projectId: job.projectId,
        kind: "transition",
        input: {
          runId: job.runId,
          arcId,
          highlightId: branch.id,
          autoRun: true,
          ...creativeSnapshot(job.input),
        },
        parentId: job.id,
      });
    }
  }
}

async function processTransition(job: PipelineJob) {
  const pipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  if (!pipeline) {
    throw new Error("过渡分析缺少生产批次");
  }
  const arcId = value<string>(job.input, "arcId");
  const highlightId = value<string>(job.input, "highlightId");
  const arc = pipeline?.arcs.find((item) => item.id === arcId);
  const highlight = pipeline?.highlights.find((item) => item.id === highlightId);
  const videoUrl = highlight?.result?.videoUrls[0];
  if (!pipeline?.analysis || !arc || !videoUrl) throw new Error("过渡分析缺少高光视频");
  let previewUrl = value<string>(
    job.input,
    "transitionPreviewUrl",
  );
  const trimTaskId = value<string>(
    job.input,
    "transitionTrimTaskId",
  );
  if (!previewUrl && !trimTaskId) {
    const trimTask = await getCreativeProvider().trimVideo({
      videoUrl,
      startTime: 0,
      endTime: 10,
    });
    await requeuePipelineJob(job.id, {
      progress: 3,
      input: {
        ...job.input,
        transitionTrimTaskId: trimTask.id,
      },
    });
    return;
  }
  if (!previewUrl && trimTaskId) {
    const trimTask =
      await getCreativeProvider().getMediaTask(trimTaskId);
    if (
      trimTask.status === "failed" ||
      trimTask.status === "canceled"
    ) {
      throw new Error(
        trimTask.error ?? "开头 10 秒裁剪失败",
      );
    }
    if (trimTask.status !== "completed") {
      await requeuePipelineJob(job.id, {
        progress: Math.min(45, trimTask.progress),
        input: job.input,
      });
      return;
    }
    if (!trimTask.videoUrl) {
      throw new Error("开头 10 秒裁剪未返回视频");
    }
    previewUrl = trimTask.videoUrl;
    await requeuePipelineJob(job.id, {
      progress: 50,
      input: {
        ...job.input,
        transitionPreviewUrl: previewUrl,
      },
    });
    return;
  }
  const anchor = await ark.analyzeTransition({
    videoUrl: previewUrl,
    seconds: 10,
    storylineContext: `${arc.title}：${arc.pitch}`,
  });
  await saveTransitionAnchor(
    job.projectId,
    highlightId,
    anchor,
    job.runId,
  );
  await updatePipelineJob(job.id, { status: "completed", progress: 100, result: anchor });
  if (value<boolean>(job.input, "autoRun") !== false) {
    await enqueuePipelineJob({
      projectId: job.projectId,
      kind: "scripts",
      input: {
        runId: job.runId,
        arcId,
        highlightId,
        autoRun: true,
        ...creativeSnapshot(job.input),
      },
      parentId: job.id,
    });
  }
}

async function processScripts(job: PipelineJob) {
  const pipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  if (!pipeline) {
    throw new Error("脚本生成缺少生产批次");
  }
  const arcId = value<string>(job.input, "arcId");
  const highlightId = value<string>(job.input, "highlightId");
  const arc = pipeline?.arcs.find((item) => item.id === arcId);
  const highlight = pipeline?.highlights.find((item) => item.id === highlightId);
  const localAnalysis = arc?.sourceHighlightAssetId
    ? pipeline?.highlightAnalyses?.find(
        (entry) =>
          entry.sourceHighlightAssetId ===
          arc.sourceHighlightAssetId,
      )?.analysis
    : undefined;
  const scriptAnalysis = localAnalysis ?? pipeline?.analysis;
  if (!scriptAnalysis || !arc || !highlight?.anchor) {
    throw new Error("脚本生成缺少故事线或过渡锚点");
  }
  const activeConfig = resolveProductionConfig(
    job.input,
    pipeline.productionConfig,
  );
  await updatePipelineJob(job.id, {
    progress: Math.max(job.progress, 5),
    error: undefined,
  });
  const completedScripts = new Map<
    number,
    ScriptVariant
  >();
  const toScriptVariant = (
    draft: ScriptDraft,
    index: number,
  ): ScriptVariant => {
    const now = new Date().toISOString();
    return {
      ...draft,
      id:
        `script-${job.id.replace(/^pipeline-job-/, "")}` +
        `-${index + 1}`,
      projectId: job.projectId,
      arcId,
      highlightId,
      reviewStatus: "draft",
      videoPrompt: "",
      videoPromptStatus: "pending",
      createdAt: now,
      updatedAt: now,
    };
  };
  const drafts = await ark.generatePrerollScripts({
    arc: {
      ...arc,
      prerollType:
        pipeline.prerollType ||
        value<string>(job.input, "prerollType") ||
        arc.prerollType,
    },
    relatedArcs: pipeline.arcs.filter(
      (candidate) =>
        candidate.id === arc.id ||
        (
          Boolean(arc.sourceHighlightAssetId) &&
          candidate.sourceHighlightAssetId ===
            arc.sourceHighlightAssetId
        ),
    ),
    anchor: highlight.anchor,
    analysis: scriptAnalysis,
    sharedStoryContext: pipeline.sharedStoryContext,
    count: activeConfig.scriptCount,
    durationMin: activeConfig.scriptDurationMin,
    durationMax: activeConfig.scriptDurationMax,
    creativeSystemPrompt:
      value<string>(
        job.input,
        "prerollCreativeSystemPrompt",
      ),
    scriptSystemPrompt:
      value<string>(
        job.input,
        "prerollScriptSystemPrompt",
      ),
    expressionType: activeConfig.expressionType,
    expressionTypes: activeConfig.expressionTypes,
    customExpressionType:
      activeConfig.customExpressionType,
    prerollTypes: activeConfig.prerollTypes,
    selectionSeed: job.id,
    previousScripts: pipeline.scripts
      .map((script) => ({
        title: script.title,
        voiceover: script.voiceover,
        shots: script.shots,
      })),
    onScriptComplete: async (draft, index) => {
      const script = toScriptVariant(draft, index);
      completedScripts.set(index, script);
      await saveScripts(job.projectId, [script], job.runId);
      await updatePipelineJob(job.id, {
        result: [...completedScripts.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, completed]) => completed),
      });
    },
    onProgress: async (progress) => {
      await updatePipelineJob(job.id, {
        progress,
        error: undefined,
      });
    },
  });
  const scripts = drafts.map(
    (draft, index) =>
      completedScripts.get(index) ??
      toScriptVariant(draft, index),
  );
  await saveScripts(job.projectId, scripts, job.runId);
  if (
    activeConfig.executionMode === "agent" &&
    scripts.length > 0
  ) {
    const project = await getProject(job.projectId);
    if (!project) {
      throw new Error("Agent 模式无法读取项目素材");
    }
    const referenceUrlsByScript = new Map<
      string,
      string[]
    >();
    if (
      activeConfig.characterMode ===
      "drama_character"
    ) {
      for (const script of scripts) {
        const references =
          resolveAgentScriptReferences(
            script,
            project.imageAssets,
          );
        if (
          references.missingCharacterNames.length >
          0
        ) {
          throw new Error(
            `Agent 模式已暂停，“${script.title}”缺少人物图像资产：${references.missingCharacterNames.join("、")}`,
          );
        }
        referenceUrlsByScript.set(
          script.id,
          references.referenceUrls,
        );
      }
    }
    await confirmScripts(
      job.projectId,
      scripts.map((script) => script.id),
      job.runId,
    );
    for (const script of scripts) {
      const prerollJob =
        await enqueuePipelineJob({
          projectId: job.projectId,
          kind: "preroll",
          input: {
            runId: job.runId,
            scriptId: script.id,
            highlightId: script.highlightId,
            characterMode:
              activeConfig.characterMode,
            videoModel: activeConfig.videoModel,
            videoResolution:
              activeConfig.videoResolution,
            videoRatio: activeConfig.videoRatio,
            generateSubtitles:
              activeConfig.generateSubtitles,
            referenceUrls:
              referenceUrlsByScript.get(
                script.id,
              ) ?? [],
            videoPromptSystemPrompt:
              value<string>(
                job.input,
                "videoPromptSystemPrompt",
              ),
            prerollPhase: "compile_prompt",
            autoRun: true,
          },
          parentId: job.id,
        });
      void runPipelineJobNow(prerollJob.id);
    }
  }
  await updatePipelineJob(job.id, {
    status: "completed",
    progress: 100,
    result: scripts,
  });
}

async function processPreroll(job: PipelineJob) {
  const pipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  const project = await getProject(job.projectId);
  const scriptId = value<string>(job.input, "scriptId");
  const highlightId = value<string>(job.input, "highlightId");
  const script = pipeline?.scripts.find((item) => item.id === scriptId);
  const renderId = value<string>(job.input, "renderId") || `render-${scriptId}`;
  if (!script || !project) throw new Error("前贴生成缺少脚本或项目");
  const videoModel =
    value<ProductionConfig["videoModel"]>(job.input, "videoModel") ||
    pipeline?.productionConfig?.videoModel ||
    "default";
  const maxClipDurationSec =
    videoGenerationSegmentLimit(videoModel);
  const targetDuration =
    value<number>(job.input, "targetDuration") ||
    script.aiSegmentSec ||
    script.duration;
  const plannedSegmentDurations = planVideoSegments(
    script.shots.filter(
      (shot) => shot.segmentType !== "original_footage",
    ),
    targetDuration,
    maxClipDurationSec,
  ).map((segment) => segment.duration);
  const videoPromptPlan =
    script.videoPromptPlan?.maxClipDurationSec === maxClipDurationSec &&
    script.videoPromptPlan.segments.length ===
      plannedSegmentDurations.length &&
    script.videoPromptPlan.segments.every(
      (segment, index) =>
        segment.duration === plannedSegmentDurations[index],
    )
      ? script.videoPromptPlan
      : undefined;
  const segmentDurations =
    videoPromptPlan?.segments.map((segment) => segment.duration) ??
    plannedSegmentDurations;
  const segmentIndex = value<number>(job.input, "segmentIndex") ?? 0;
  const storedSegmentUrls =
    value<Array<string | null>>(
      job.input,
      "segmentUrls",
    ) ?? [];
  const storedSegmentTaskIds =
    value<Array<string | null>>(
      job.input,
      "segmentTaskIds",
    ) ?? [];
  const segmentUrls = Array.from(
    { length: segmentDurations.length },
    (_, index) => storedSegmentUrls[index] ?? null,
  );
  const segmentTaskIds = Array.from(
    { length: segmentDurations.length },
    (_, index) =>
      storedSegmentTaskIds[index] ??
      (
        job.upstreamId && index === segmentIndex
          ? job.upstreamId
          : null
      ),
  );
  const phase = value<string>(job.input, "prerollPhase") ?? "segments";

  if (phase === "compile_prompt") {
    const highlight = pipeline?.highlights.find(
      (item) => item.id === highlightId,
    );
    const characterMode =
      value<ProductionConfig["characterMode"]>(
        job.input,
        "characterMode",
      ) ||
      pipeline?.productionConfig?.characterMode ||
      "text_to_video";
    const videoResolution =
      value<ProductionConfig["videoResolution"]>(
        job.input,
        "videoResolution",
      ) ||
      pipeline?.productionConfig?.videoResolution ||
      "720p";
    const videoRatio =
      value<ProductionConfig["videoRatio"]>(
        job.input,
        "videoRatio",
      ) ||
      pipeline?.productionConfig?.videoRatio ||
      "9:16";
    const generateSubtitles =
      value<boolean>(
        job.input,
        "generateSubtitles",
      ) ??
      pipeline?.productionConfig?.generateSubtitles ??
      false;
    const referenceUrls =
      value<string[]>(
        job.input,
        "referenceUrls",
      ) ?? [];
    let highlightStyle = highlight?.anchor?.visualStyle;
    if (characterMode === "text_to_video" && !highlightStyle) {
      const highlightVideoUrl = highlight?.result?.videoUrls[0];
      const stylePreviewUrl = value<string>(
        job.input,
        "stylePreviewUrl",
      );
      const styleTrimTaskId = value<string>(
        job.input,
        "styleTrimTaskId",
      );
      if (!highlight || !highlightVideoUrl) {
        throw new Error("文生视频缺少关联高光，无法分析视觉风格");
      }
      if (!stylePreviewUrl && !styleTrimTaskId) {
        const trimTask = await getCreativeProvider().trimVideo({
          videoUrl: highlightVideoUrl,
          startTime: 0,
          endTime: 10,
        });
        await requeuePipelineJob(job.id, {
          progress: 2,
          input: {
            ...job.input,
            styleTrimTaskId: trimTask.id,
          },
        });
        return;
      }
      if (!stylePreviewUrl && styleTrimTaskId) {
        const trimTask =
          await getCreativeProvider().getMediaTask(styleTrimTaskId);
        if (
          trimTask.status === "failed" ||
          trimTask.status === "canceled"
        ) {
          throw new Error(
            trimTask.error ?? "高光视觉风格分析片段裁剪失败",
          );
        }
        if (trimTask.status !== "completed") {
          await requeuePipelineJob(job.id, {
            progress: Math.min(35, trimTask.progress),
            input: job.input,
          });
          return;
        }
        if (!trimTask.videoUrl) {
          throw new Error("高光视觉风格分析片段未返回视频");
        }
        await requeuePipelineJob(job.id, {
          progress: 40,
          input: {
            ...job.input,
            stylePreviewUrl: trimTask.videoUrl,
          },
        });
        return;
      }
      const arc = pipeline?.arcs.find(
        (item) => item.id === highlight.arcId,
      );
      const analyzedAnchor = await ark.analyzeTransition({
        videoUrl: stylePreviewUrl,
        seconds: 10,
        storylineContext:
          `${arc?.title ?? script.title}：` +
          `${arc?.pitch ?? script.transition}`,
      });
      if (!analyzedAnchor.visualStyle) {
        throw new Error(
          "高光视觉风格分析未返回人物、道具和场景风格",
        );
      }
      await saveTransitionAnchor(
        job.projectId,
        highlight.id,
        analyzedAnchor,
        job.runId,
      );
      highlightStyle = analyzedAnchor.visualStyle;
    }
    if (
      characterMode === "new_character_assets" &&
      !referenceUrls.length
    ) {
      const image = await ark.generateImage({
        prompt:
          `短剧 AI 前贴角色与场景资产定妆图，竖屏写实电影感，保持角色造型统一。` +
          `标题：${script.title}。口播：${script.voiceover}。` +
          `关键画面：${script.shots.map((shot) => shot.visual).join("；")}`,
        size: "1600x2848",
        model:
          pipeline?.productionConfig?.imageModel ??
          "seedream_5_0_pro",
      });
      await requeuePipelineJob(job.id, {
        progress: 1,
        input: {
          ...job.input,
          referenceUrls: image.urls,
          prerollPhase: "compile_prompt",
        },
      });
      return;
    }
    const compiledPlan = await ark.compileVideoPrompt({
      script: {
        ...script,
        aiSegmentSec: targetDuration,
      },
      sourceRevision: scriptContentHash(
        script,
        generateSubtitles,
      ),
      anchor: highlight?.anchor,
      systemPrompt:
        value<string>(
          job.input,
          "videoPromptSystemPrompt",
        ),
      characterMode,
      videoModel,
      resolution: videoResolution,
      ratio: videoRatio,
      referenceUrls,
      maxClipDurationSec,
      generateSubtitles,
      highlightStyle,
    });
    const referenceBindings =
      value<
        Array<{
          characterName: string;
          assetIds: string[];
          useTextToVideo?: boolean;
        }>
      >(job.input, "characterSelections") ?? [];
    const submittedPlan = withSubmittedSeedancePrompts({
      ...compiledPlan,
      targetModel: videoModel,
      targetDuration,
      resolution: videoResolution,
      aspectRatio: videoRatio,
      generateSubtitles,
      referenceBindings,
    });
    const selectedCharacterNames = referenceBindings
      .filter(
        (binding) =>
          !binding.useTextToVideo &&
          binding.assetIds.length > 0,
      )
      .map((binding) => binding.characterName);
    const plan = {
      ...submittedPlan,
      segments: submittedPlan.segments.map((segment) => {
        const names = selectedCharacterNames.filter(
          (characterName) =>
            script.shots.some(
              (shot) =>
                (
                  !segment.sourceBeats?.length ||
                  (
                    shot.beatId &&
                    segment.sourceBeats.includes(shot.beatId)
                  )
                ) &&
                shot.characters?.includes(characterName),
            ),
        );
        return {
          ...segment,
          prompt: insertCharacterAssetMentions(
            segment.prompt,
            names,
          ),
          submittedPrompt: insertCharacterAssetMentions(
            segment.submittedPrompt ?? segment.prompt,
            names,
          ),
        };
      }),
    };
    await saveCompiledVideoPrompt(
      job.projectId,
      scriptId,
      plan,
      job.runId,
    );
    if (value<boolean>(job.input, "autoRun") === false) {
      await updatePipelineJob(job.id, {
        status: "completed",
        progress: 100,
        result: {
          scriptId,
          phase: "prompt_ready",
          segmentCount: plan.segments.length,
        },
      });
      return;
    }
    await requeuePipelineJob(job.id, {
      progress: 2,
      input: {
        ...job.input,
        prerollPhase: "segments",
        segmentDurations: plan.segments.map(
          (segment) => segment.duration,
        ),
        referenceUrls,
      },
    });
    return;
  }

  async function completeRender(remoteUrl: string, upstreamId?: string) {
    const stored = await transferRemoteFileToTos({
      remoteUrl,
      projectId: job.projectId,
      projectName: project!.name,
      runId: job.runId,
      stage: "prerolls",
      fileName: `${renderId}.mp4`,
    });
    await upsertRender(job.projectId, {
      id: renderId,
      scriptId,
      status: "completed",
      sourceJobId: job.id,
      upstreamId,
      videoUrl: stored.sourceUrl,
    }, job.runId);
    await updatePipelineJob(job.id, {
      status: "completed",
      progress: 100,
      result: {
        videoUrl: stored.sourceUrl,
        segmentCount: segmentDurations.length,
      },
    });
  }

  if (phase === "concat") {
    const task = await waitForUpstream(job);
    if (!task) return;
    const remoteUrl =
      task.videoUrl ||
      (task.result && typeof task.result === "object"
        ? String((task.result as Record<string, unknown>).video_url ?? "")
        : "");
    if (!remoteUrl) throw new Error("前贴分段拼接未返回视频地址");
    await completeRender(remoteUrl, job.upstreamId);
    return;
  }

  if (segmentTaskIds.every((taskId) => !taskId)) {
    const characterMode =
      value<ProductionConfig["characterMode"]>(job.input, "characterMode") ||
      pipeline?.productionConfig?.characterMode ||
      "text_to_video";
    const videoResolution =
      value<ProductionConfig["videoResolution"]>(
        job.input,
        "videoResolution",
      ) ||
      pipeline?.productionConfig?.videoResolution ||
      "720p";
    const videoRatio =
      value<ProductionConfig["videoRatio"]>(
        job.input,
        "videoRatio",
      ) ||
      pipeline?.productionConfig?.videoRatio ||
      "9:16";
    const referenceUrls = value<string[]>(job.input, "referenceUrls") ?? [];
    if (characterMode === "new_character_assets" && !referenceUrls.length) {
      const image = await ark.generateImage({
        prompt: `短剧 AI 前贴人物与场景资产图，竖屏写实电影感，角色造型统一。脚本：${script.voiceover}。画面要求：${script.shots.map((shot) => shot.visual).join("；")}`,
        size: "1600x2848",
        model:
          pipeline?.productionConfig?.imageModel ??
          "seedream_5_0_pro",
      });
      await requeuePipelineJob(job.id, {
        progress: 2,
        input: { ...job.input, renderId, referenceUrls: image.urls },
      });
      return;
    }
    const provider = getCreativeProvider();
    const tasks = await Promise.all(
      segmentDurations.map(async (duration, index) => {
        const compiledSegment =
          videoPromptPlan?.segments[index];
        if (videoPromptPlan && !compiledSegment) {
          throw new Error(
            `生视频提示词缺少第 ${index + 1} 段`,
          );
        }
        return provider.createPreroll({
          prompt:
            resolveCharacterAssetMentionsForSubmission(
              (compiledSegment && videoPromptPlan
                ? resolveSubmittedSeedancePrompt({
                    globalVisualStyle:
                      videoPromptPlan.globalVisualStyle,
                    characterLock:
                      videoPromptPlan.characterLock,
                    sceneLock:
                      videoPromptPlan.sceneLock,
                    voiceCards:
                      videoPromptPlan.voiceCards,
                    musicLine:
                      videoPromptPlan.musicLine,
                    soundPrinciple:
                      videoPromptPlan.soundPrinciple,
                    persistentText:
                      videoPromptPlan.persistentText,
                    subtitleStyle:
                      videoPromptPlan.subtitleStyle,
                    negativePrompt:
                      videoPromptPlan.negativePrompt,
                    segment: compiledSegment,
                  })
                : undefined) ||
                script.videoPrompt ||
                `竖屏短剧投流 AI 前贴。${script.voiceover}\n结尾过渡：${script.transition}`,
              videoPromptPlan?.referenceBindings ?? [],
            ),
          duration:
            compiledSegment?.duration ??
            duration,
          ratio: videoRatio,
          referenceUrls,
          model: videoModel,
          resolution: videoResolution,
        });
      }),
    );
    const submittedTaskIds = tasks.map((task) => task.id);
    await upsertRender(job.projectId, {
      id: renderId,
      scriptId,
      status: "running",
      sourceJobId: job.id,
      upstreamId: submittedTaskIds[0],
      referenceUrls,
    }, job.runId);
    await requeuePipelineJob(job.id, {
      upstreamId: undefined,
      progress: 3,
      input: {
        ...job.input,
        renderId,
        segmentDurations,
        segmentTaskIds: submittedTaskIds,
        segmentUrls,
        prerollPhase: "segments",
      },
    });
    return;
  }

  const provider = getCreativeProvider();
  const polledTasks = await Promise.all(
    segmentTaskIds.map((taskId, index) =>
      taskId && !segmentUrls[index]
        ? provider.getPrerollTask(taskId)
        : null,
    ),
  );
  for (const [index, task] of polledTasks.entries()) {
    if (!task) continue;
    if (
      task.status === "failed" ||
      task.status === "canceled"
    ) {
      throw new Error(
        `Seedance 第 ${index + 1} 段生成失败：` +
          (task.error ?? "供应商未返回失败原因"),
      );
    }
    if (task.status === "completed" && task.videoUrl) {
      const storedSegment =
        await transferRemoteFileToTos({
          remoteUrl: task.videoUrl,
          projectId: job.projectId,
          projectName: project.name,
          runId: job.runId,
          stage: "prerolls",
          fileName: `${renderId}-segment-${index + 1}.mp4`,
        });
      segmentUrls[index] = storedSegment.sourceUrl;
    }
  }
  const completedCount = segmentUrls.filter(Boolean).length;
  if (completedCount < segmentDurations.length) {
    const progressValues = polledTasks
      .filter((task): task is NonNullable<typeof task> =>
        Boolean(task),
      )
      .map((task) => task.progress);
    await requeuePipelineJob(job.id, {
      upstreamId: undefined,
      progress: Math.max(
        3,
        Math.round(
          (completedCount / segmentDurations.length) *
            80,
        ),
        ...progressValues.map((progress) =>
          Math.min(80, progress),
        ),
      ),
      input: {
        ...job.input,
        renderId,
        segmentDurations,
        segmentTaskIds,
        segmentUrls,
        prerollPhase: "segments",
      },
    });
    return;
  }
  const completedSegmentUrls = segmentUrls.filter(
    (url): url is string => Boolean(url),
  );
  if (completedSegmentUrls.length === 1) {
    await completeRender(
      completedSegmentUrls[0],
      segmentTaskIds[0] ?? undefined,
    );
    return;
  }
    const concatTask = await getCreativeProvider().concatVideos({
      videoUrls: completedSegmentUrls,
      transitions: Array.from(
        { length: completedSegmentUrls.length - 1 },
        () => "none",
      ),
      clientToken: `${job.projectId}-${renderId}-preroll`.slice(0, 64),
    });
    await upsertRender(job.projectId, {
      id: renderId,
      scriptId,
      status: "running",
      upstreamId: concatTask.id,
    }, job.runId);
    await requeuePipelineJob(job.id, {
      upstreamId: concatTask.id,
      progress: 85,
      input: {
        ...job.input,
        renderId,
        segmentDurations,
        segmentTaskIds,
        segmentUrls: completedSegmentUrls,
        prerollPhase: "concat",
      },
    });
}

async function processCompose(job: PipelineJob) {
  const pipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  const project = await getProject(job.projectId);
  const renderId = value<string>(job.input, "renderId");
  const highlightId = value<string>(job.input, "highlightId");
  const render = pipeline?.renders.find((item) => item.id === renderId);
  const highlight = pipeline?.highlights.find((item) => item.id === highlightId);
  const highlightUrl = highlight?.result?.videoUrls[0];
  const compositionId =
    value<string>(job.input, "compositionId") || `composition-${renderId}`;
  const renderVideoUrl =
    value<string>(job.input, "renderVideoUrl") ||
    render?.videoUrl;
  const usesSubtitleProcessedVersion =
    render?.videoUrl === renderVideoUrl &&
    Boolean(
      render?.processedOperation === "add_subtitles" ||
      renderVideoUrl?.includes("add_subtitles")
    );
  if (!project || !renderVideoUrl || !highlightUrl) {
    throw new Error("合成缺少项目、前贴或高光视频");
  }
  if (
    usesSubtitleProcessedVersion &&
    render?.subtitleVerificationStatus !== "verified"
  ) {
    throw new Error(
      "AI 前贴字幕未通过画面验收，禁止执行拼接",
    );
  }
  const sourceRenderSubtitleVerified =
    usesSubtitleProcessedVersion === true;
  if (!job.upstreamId) {
    const task = await getCreativeProvider().concatVideos({
      videoUrls: [renderVideoUrl, highlightUrl],
      transitions: ["none"],
      clientToken: `${job.projectId}-${compositionId}`.slice(0, 64),
    });
    await upsertComposition(job.projectId, {
      id: compositionId,
      renderId,
      highlightId,
      status: "running",
      upstreamId: task.id,
      videoUrl: undefined,
      sourceRenderVideoUrl: renderVideoUrl,
      sourceRenderSubtitleVerified,
    }, job.runId);
    await requeuePipelineJob(job.id, {
      upstreamId: task.id,
      progress: 3,
      input: { ...job.input, compositionId },
    });
    return;
  }
  const task = await waitForUpstream(job);
  if (!task) return;
  const remoteUrl =
    task.videoUrl ||
    (task.result && typeof task.result === "object"
      ? String((task.result as Record<string, unknown>).video_url ?? "")
      : "");
  if (!remoteUrl) throw new Error("合成任务未返回视频地址");
  const stored = await transferRemoteFileToTos({
    remoteUrl,
    projectId: job.projectId,
    projectName: project.name,
    runId: job.runId,
    stage: "compositions",
    fileName: `${compositionId}.mp4`,
  });
  await upsertComposition(job.projectId, {
    id: compositionId,
    renderId,
    highlightId,
    status: "completed",
    upstreamId: job.upstreamId,
    videoUrl: stored.sourceUrl,
    objectKey: stored.objectKey,
    sourceRenderVideoUrl: renderVideoUrl,
    sourceRenderSubtitleVerified,
  }, job.runId);
  await updatePipelineJob(job.id, {
    status: "completed",
    progress: 100,
    result: { videoUrl: stored.sourceUrl },
  });
}

function mediaKitAsrSubtitles(result: unknown) {
  if (!result || typeof result !== "object") return [];
  const subtitles = (result as Record<string, unknown>).subtitles;
  if (!Array.isArray(subtitles)) return [];
  return subtitles.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const subtitleText = String(
      record.subtitle_text ?? record.subtitleText ?? "",
    ).trim();
    const startTime = Number(
      record.start_time ?? record.startTime,
    );
    const endTime = Number(record.end_time ?? record.endTime);
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

async function processPostProduction(job: PipelineJob) {
  const pipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  const project = await getProject(job.projectId);
  const renderId = value<string>(job.input, "renderId");
  const operation = value<
    "asr" | "erase_subtitles" | "add_subtitles" | "enhance"
  >(job.input, "operation");
  const sourceVideoUrl = value<string>(
    job.input,
    "sourceVideoUrl",
  );
  const sourceRevisionId = value<string>(
    job.input,
    "sourceRevisionId",
  );
  const render = pipeline?.renders.find(
    (item) => item.id === renderId,
  );
  if (!project || !render?.videoUrl) {
    throw new Error("后期处理缺少项目或 AI 前贴视频");
  }
  const currentVideoUrl = render.videoUrl;
  if (
    currentVideoUrl !== sourceVideoUrl ||
    (
      sourceRevisionId &&
      render.currentRevisionId !== sourceRevisionId
    )
  ) {
    throw new Error("AI 前贴视频版本已更新，后台任务已停止");
  }

  const provider = new MediaKitProvider();
  if (!job.upstreamId) {
    let task;
    let subtitleVideoPreparation = value<
      SubtitleVideoPreparation | undefined
    >(job.input, "subtitleVideoPreparation");
    if (operation === "asr") {
      task = await provider.createAsrSubtitles({
        videoUrl: sourceVideoUrl,
        language:
          value<"cmn-Hans-CN" | "eng-US">(
            job.input,
            "language",
          ) ?? "cmn-Hans-CN",
        enableSpeakerInfo: true,
      });
    } else if (operation === "erase_subtitles") {
      task = await provider.eraseVideoSubtitles({
        videoUrl: sourceVideoUrl,
        modelVersion: "v5",
        timeSegmentFilter: value(
          job.input,
          "timeSegmentFilter",
        ),
        eraseRatioLocations: value(
          job.input,
          "eraseRatioLocations",
        ),
        subtitleFilter: value(job.input, "subtitleFilter"),
      });
    } else if (operation === "add_subtitles") {
      subtitleVideoPreparation ??=
        await prepareVideoForSubtitleBurn({
          sourceVideoUrl,
          projectId: job.projectId,
          projectName: project.name,
          runId: job.runId,
          fileName: `${renderId}-subtitle-input-${job.id}.mp4`,
        });
      task = await provider.addSubtitlesToVideo({
        videoUrl: subtitleVideoPreparation.videoUrl,
        subtitles: value(job.input, "subtitles"),
        fontType: value(job.input, "fontType"),
        fontSize: value(job.input, "fontSize"),
        fontColor: value(job.input, "fontColor"),
        position: value(job.input, "position"),
        clientToken: job.id,
      });
    } else {
      task = await provider.enhanceVideo({
        videoUrl: sourceVideoUrl,
        resolution: value(job.input, "resolution"),
        fps: value(job.input, "fps"),
      });
    }
    await requeuePipelineJob(job.id, {
      upstreamId: task.id,
      progress: task.progress ?? 5,
      input:
        operation === "add_subtitles"
          ? {
              ...job.input,
              subtitleVideoPreparation,
            }
          : job.input,
    });
    return;
  }

  const task = await provider.getMediaTask(job.upstreamId);
  if (task.status === "failed") {
    throw new Error(task.error ?? "MediaKit 后期处理失败");
  }
  if (task.status !== "completed") {
    await requeuePipelineJob(job.id, {
      progress: Math.max(5, task.progress ?? job.progress),
    });
    return;
  }

  if (operation === "asr") {
    const subtitles = mediaKitAsrSubtitles(task.result);
    if (!subtitles.length) {
      throw new Error("未识别到可编辑字幕");
    }
    await updatePipelineJob(job.id, {
      status: "completed",
      progress: 100,
      result: { subtitles, sourceVideoUrl },
    });
    return;
  }

  if (!task.videoUrl) {
    throw new Error("MediaKit 未返回处理后视频地址");
  }
  const subtitles = value<Array<{
    subtitleText: string;
    startTime: number;
    endTime: number;
  }>>(job.input, "subtitles") ?? [];
  const subtitleVerificationEvidence =
    operation === "add_subtitles"
      ? await verifyBurnedSubtitles({
          sourceVideoUrl:
            value<SubtitleVideoPreparation | undefined>(
              job.input,
              "subtitleVideoPreparation",
            )?.videoUrl ?? sourceVideoUrl,
          outputVideoUrl: task.videoUrl,
          subtitles,
        })
      : undefined;
  const stored = await transferRemoteFileToTos({
    remoteUrl: task.videoUrl,
    projectId: job.projectId,
    projectName: project.name,
    runId: job.runId,
    stage: "postproduction",
    fileName: `${renderId}-${operation}-${job.id}.mp4`,
  });

  const latestPipeline = await getPipelineProjectRun(
    job.projectId,
    job.runId,
  );
  const latestRender = latestPipeline?.renders.find(
    (item) => item.id === renderId,
  );
  const latestVideoUrl = latestRender?.videoUrl;
  if (
    !latestRender ||
    latestVideoUrl !== sourceVideoUrl ||
    (
      sourceRevisionId &&
      latestRender.currentRevisionId !== sourceRevisionId
    )
  ) {
    throw new Error("AI 前贴视频版本已更新，处理结果未覆盖当前版本");
  }
  const subtitleEraseConfig = value<
    RenderVariant["subtitleEraseConfig"]
  >(job.input, "subtitleEraseConfig");
  const updatedRender = await commitRenderRevision(
    job.projectId,
    {
      renderId: latestRender.id,
      sourceVideoUrl,
      sourceRevisionId,
      outputVideoUrl: stored.sourceUrl,
      operation,
      settings: value(job.input, "operationSettings"),
      sourceJobId: job.id,
      subtitleEraseConfig:
        operation === "erase_subtitles"
          ? subtitleEraseConfig
          : undefined,
      subtitleVerificationStatus:
        subtitleVerificationEvidence?.status,
      subtitleVerificationEvidence,
    },
    job.runId,
  );
  await updatePipelineJob(job.id, {
    status: "completed",
    progress: 100,
    result: {
      videoUrl: stored.sourceUrl,
      renderId,
      revisionId: updatedRender.currentRevisionId,
      operation,
      subtitleVerification: subtitleVerificationEvidence,
      providerTask: {
        taskId: job.upstreamId,
        requestId: task.requestId,
        outputVideoUrl: task.videoUrl,
        resolution: task.resolution,
        duration: task.duration,
      },
      subtitleVideoPreparation: value(
        job.input,
        "subtitleVideoPreparation",
      ),
    },
  });
}

async function processJob(job: PipelineJob) {
  if (job.kind === "analysis") return processAnalysis(job);
  if (job.kind === "media_analysis") {
    return processMediaAnalysis(job);
  }
  if (job.kind === "highlight_analysis") {
    return processHighlightAnalysis(job);
  }
  if (job.kind === "highlight_context") {
    return processHighlightContext(job);
  }
  if (job.kind === "mine_arcs") return processMineArcs(job);
  if (job.kind === "highlight") return processHighlight(job);
  if (job.kind === "transition") return processTransition(job);
  if (job.kind === "scripts") return processScripts(job);
  if (job.kind === "preroll") return processPreroll(job);
  if (job.kind === "post_production") {
    return processPostProduction(job);
  }
  if (job.kind === "compose") return processCompose(job);
  throw new Error(`未知流水线任务：${job.kind}`);
}

async function executeClaimedJob(job: PipelineJob) {
  try {
    await processJob(job);
    return { processed: true, jobId: job.id, kind: job.kind };
  } catch (error) {
    const message = error instanceof Error ? error.message : "流水线任务失败";
    const transientRetries = Number(job.input._transientRetries ?? 0);
    if (
      isTransientNetworkError(error) &&
      Number.isFinite(transientRetries) &&
      transientRetries < MAX_TRANSIENT_RETRIES
    ) {
      const backoffMs = Math.min(
        30_000 * 2 ** transientRetries,
        300_000,
      );
      await requeuePipelineJob(job.id, {
        attempts: job.attempts,
        progress: job.progress,
        error: `网络波动，${Math.round(backoffMs / 1000)} 秒后自动重试（第 ${transientRetries + 1} 次）：${message}`,
        runAfter: new Date(Date.now() + backoffMs).toISOString(),
        input: { ...job.input, _transientRetries: transientRetries + 1 },
      });
      console.warn(
        `[pipeline] transient network error on ${job.id} (${job.kind}), retry ${transientRetries + 1}/${MAX_TRANSIENT_RETRIES} in ${Math.round(backoffMs / 1000)}s: ${message}`,
      );
      return {
        processed: true,
        jobId: job.id,
        kind: job.kind,
        error: message,
        retried: true,
      };
    }
    const attempts = job.attempts + 1;
    if (attempts < 3) {
      await requeuePipelineJob(job.id, {
        attempts,
        error: message,
        progress: job.progress,
        input: { ...job.input, _transientRetries: 0 },
      });
    } else {
      const renderId = value<string>(
        job.input,
        "renderId",
      );
      if (
        job.kind === "preroll" &&
        value<string>(
          job.input,
          "prerollPhase",
        ) !== "compile_prompt" &&
        renderId
      ) {
        await upsertRender(job.projectId, {
          id: renderId,
          scriptId: value<string>(
            job.input,
            "scriptId",
          ),
          status: "failed",
          sourceJobId: job.id,
        }, job.runId);
      }
      await updatePipelineJob(job.id, {
        attempts,
        status: "failed",
        error: message,
      });
    }
    return {
      processed: true,
      jobId: job.id,
      kind: job.kind,
      error: message,
    };
  }
}

export async function runPipelineJobNow(jobId: string) {
  let lastResult:
    | Awaited<ReturnType<typeof executeClaimedJob>>
    | undefined;
  for (let retry = 0; retry < 3; retry += 1) {
    const job = await claimPipelineJob(jobId);
    if (!job) {
      return lastResult ?? { processed: false, jobId };
    }
    lastResult = await executeClaimedJob(job);
    if (
      !("error" in lastResult) ||
      !lastResult.error
    ) {
      return lastResult;
    }
    if (retry < 2) {
      await new Promise((resolve) =>
        setTimeout(resolve, (retry + 1) * 500),
      );
    }
  }
  return lastResult ?? { processed: false, jobId };
}

// 进程级互斥锁：worker 可能在 tick 仍在执行时（fetch 超时后）发起下一次 tick，
// 而服务端 handler 不会随客户端 abort 终止。若不加锁，多个 tick 会在同一 Node
// 进程内并发执行任务（如跨区 TOS 转存），争抢上行带宽导致全部超时。
// 加锁后未拿到锁的 tick 立即返回 busy，保证任务严格串行执行。
let tickInProgress = false;

export async function runPipelineTick() {
  if (tickInProgress) {
    return { processed: false, reclaimed: [], busy: true };
  }
  tickInProgress = true;
  try {
    const reclaimed = await reclaimStalePipelineJobs(
      env.PIPELINE_JOB_STALE_MS,
    );
    for (const stale of reclaimed) {
      console.warn(
        `[pipeline] reclaimed stale job ${stale.id} (${stale.kind}): ${stale.action} after ${stale.attempts} attempt(s)`,
      );
    }
    const job = await claimNextPipelineJob();
    if (!job) {
      return { processed: false, reclaimed };
    }
    const result = await executeClaimedJob(job);
    return { ...result, reclaimed };
  } finally {
    tickInProgress = false;
  }
}
