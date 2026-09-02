import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { mergeHighlightAnalyses } from "@/lib/highlight-analysis";
import type {
  HighlightResult,
  ScriptDraft,
  StorylineResult,
} from "@/lib/providers/types";
import type { PrerollType } from "@/lib/domain";
import {
  productionEntries,
  videoGenerationSegmentLimit,
  type ProductionConfig,
} from "@/lib/production-config";
import type { SubtitleVerificationEvidence } from "@/lib/subtitle-video-verification";
import type { MediaUnderstanding } from "@/lib/media-understanding";

export type StoryArc = {
  id: string;
  sourceHighlightAssetId?: string;
  highlightId?: string;
  title: string;
  pitch: string;
  audience: "male" | "female" | "general";
  payoffType: string;
  conflict: string;
  hookType: string;
  prerollType: string;
  evidenceClipIndexes: number[];
  highlightPrompt: string;
  scores: {
    relevance: number;
    visuality: number;
    novelty: number;
    risk: number;
  };
};

export type HighlightAnalysis = {
  sourceHighlightAssetId: string;
  highlightId: string;
  sourceName: string;
  sourceVideoUrl: string;
  analysis: StorylineResult;
  reusedFromRunId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SharedStoryContext = {
  sourceHighlightAssetIds: string[];
  backgroundSourceAssetIds?: string[];
  sourceVideoInfo: Array<{
    sourceHighlightAssetId: string;
    highlightId: string;
    url: string;
    title: string;
    summary: string;
    tags: string[];
  }>;
  summary: string;
  tags: string[];
  characters?: Array<{
    name: string;
    aliases: string[];
    role: string;
    relationships: string[];
  }>;
  setting?: string;
  visualStyle?: string;
  updatedAt: string;
};

export type HighlightVisualStyle = {
  visualMedium: string;
  characterStyle: string;
  wardrobeStyle: string;
  propStyle: string;
  sceneStyle: string;
  lightingStyle: string;
  colorStyle: string;
  cameraStyle: string;
  textureStyle: string;
};

export type TransitionAnchor = {
  openingSummary: string;
  firstAction: string;
  firstDialogue: string;
  characters: string[];
  emotion: string;
  continuityRequirements: string[];
  recommendedTransition: string;
  forbiddenConflicts: string[];
  visualStyle?: HighlightVisualStyle;
};

export type CharacterAppearance = {
  id: string;
  clipIndex: number;
  sourceVideoIndex: number;
  timestamp: number;
  imageUrl: string;
};

export type CharacterBinding = {
  id: string;
  name: string;
  role: string;
  aliases: string[];
  status: "candidate" | "confirmed" | "unknown";
  appearances: CharacterAppearance[];
  primaryAppearanceId?: string;
  referenceAssetIds: string[];
  confirmedAt?: string;
  updatedAt: string;
};

export type PipelineJobKind =
  | "analysis"
  | "media_analysis"
  | "highlight_analysis"
  | "highlight_context"
  | "mine_arcs"
  | "highlight"
  | "transition"
  | "scripts"
  | "preroll"
  | "post_production"
  | "compose";

export type PipelineJob = {
  id: string;
  projectId: string;
  runId?: string;
  kind: PipelineJobKind;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  upstreamId?: string;
  parentId?: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  /** 退避重试：排队任务在此 ISO 时间之前不会被 worker 领取 */
  runAfter?: string;
  attempts: number;
  createdAt: string;
  completedAt?: string;
  updatedAt: string;
};

export type HighlightVariant = {
  id: string;
  projectId: string;
  arcId: string;
  mode: string;
  status: string;
  upstreamId?: string;
  result?: HighlightResult;
  anchor?: TransitionAnchor;
  createdAt: string;
  updatedAt: string;
};

export type ScriptVariant = ScriptDraft & {
  projectId: string;
  arcId: string;
  highlightId: string;
  reviewStatus: "draft" | "confirmed";
  videoPrompt: string;
  videoPromptStatus?:
    | "pending"
    | "compiling"
    | "ready"
    | "stale"
    | "failed";
  videoPromptSourceHash?: string;
  videoPromptCompiledAt?: string;
  videoPromptPlan?: VideoPromptPlan;
  prerollOpenedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type VideoPromptSegment = {
  index: number;
  clipId?: string;
  sourceBeats?: string[];
  duration: number;
  referenceAssets: string[];
  prompt: string;
  submittedPrompt?: string;
  sound: string;
};

export type VideoPromptPlan = {
  sourceScriptId: string;
  sourceRevision: string;
  systemPromptHash?: string;
  generateSubtitles?: boolean;
  scriptVersion?: string;
  conceptId?: string;
  mode?: string;
  prepatchType?: string;
  templateMode?: string;
  targetModel?: string;
  targetDuration?: number;
  resolution?: string;
  aspectRatio?: string;
  maxClipDurationSec?: number;
  reviewStatus?: "draft" | "confirmed";
  editedAt?: string;
  confirmedAt?: string;
  referenceBindings?: Array<{
    characterName: string;
    assetIds: string[];
    useTextToVideo?: boolean;
  }>;
  globalVisualStyle: string;
  characterLock: string;
  sceneLock: string;
  cameraPrinciple?: string;
  lightColor?: string;
  voiceCards?: string;
  musicLine?: string;
  soundPrinciple?: string;
  persistentText?: string;
  subtitleStyle?: string;
  textOverlayPrinciple?: string;
  negativePrompt: string;
  segments: VideoPromptSegment[];
  missingInformation: string[];
  originalFootageNote?: string;
  mainfilmHandoffPrompt?: string;
};

export function scriptContentHash(
  script: Pick<
    ScriptVariant,
    | "title"
    | "duration"
    | "hookTitleCard"
    | "voiceover"
    | "transition"
    | "shots"
  >,
  generateSubtitles = false,
) {
  return createHash("sha256")
    .update(JSON.stringify({
      title: script.title,
      duration: script.duration,
      hookTitleCard: script.hookTitleCard,
      voiceover: script.voiceover,
      transition: script.transition,
      shots: script.shots,
      generateSubtitles,
    }))
    .digest("hex");
}

export function videoPromptSystemPromptHash(systemPrompt: string) {
  return createHash("sha256")
    .update(systemPrompt.trim())
    .digest("hex");
}

// Prompts compiled before `generateSubtitles` joined the fingerprint stored a
// hash without that field. Treat those legacy hashes as still valid so an
// algorithm change never silently marks every confirmed prompt as stale (which
// blocks preroll generation with a false "请先确认脚本" rejection). New prompts
// always store the current hash, so real subtitle-mode changes still invalidate.
function legacyScriptContentHash(
  script: Pick<
    ScriptVariant,
    | "title"
    | "duration"
    | "hookTitleCard"
    | "voiceover"
    | "transition"
    | "shots"
  >,
) {
  return createHash("sha256")
    .update(JSON.stringify({
      title: script.title,
      duration: script.duration,
      hookTitleCard: script.hookTitleCard,
      voiceover: script.voiceover,
      transition: script.transition,
      shots: script.shots,
    }))
    .digest("hex");
}

export function videoPromptMatchesScript(
  script: Pick<
    ScriptVariant,
    | "title"
    | "duration"
    | "hookTitleCard"
    | "voiceover"
    | "transition"
    | "shots"
    | "videoPromptSourceHash"
    | "videoPromptPlan"
  >,
  generateSubtitles = false,
  systemPromptHash?: string,
) {
  const stored = script.videoPromptSourceHash;
  if (!stored) return false;
  const contentMatches = (
    stored === scriptContentHash(script, generateSubtitles) ||
    stored === legacyScriptContentHash(script)
  );
  if (!contentMatches) return false;
  if (systemPromptHash === undefined) return true;
  return (
    script.videoPromptPlan?.systemPromptHash === systemPromptHash &&
    script.videoPromptPlan.generateSubtitles === generateSubtitles
  );
}

export type RenderRevisionOperation =
  | "generated"
  | "baseline"
  | "erase_subtitles"
  | "add_subtitles"
  | "enhance";

export type SubtitleEraseConfig = {
  rangeMode: "all" | "selected" | "skip";
  segments: Array<{
    startTime: number;
    endTime: number;
  }>;
  eraseRatioLocations?: Array<{
    topLeftX: number;
    topLeftY: number;
    bottomRightX: number;
    bottomRightY: number;
  }>;
  subtitleFilter?: {
    minTextHeightRatio?: number;
    maxTextHeightRatio?: number;
    centerOffsetRatio?: number;
  };
};

export type RenderRevision = {
  id: string;
  parentRevisionId?: string;
  videoUrl: string;
  operation: RenderRevisionOperation;
  settings?: Record<string, unknown>;
  sourceJobId?: string;
  subtitleEraseConfig?: SubtitleEraseConfig;
  subtitleVerificationStatus?: "verified" | "failed";
  subtitleVerificationEvidence?: SubtitleVerificationEvidence;
  createdAt: string;
};

export type RenderVariant = {
  id: string;
  projectId: string;
  scriptId: string;
  status: string;
  sourceJobId?: string;
  upstreamId?: string;
  videoUrl?: string;
  currentRevisionId?: string;
  revisions?: RenderRevision[];
  processedOperation?: Exclude<
    RenderRevisionOperation,
    "generated" | "baseline"
  >;
  subtitleEraseConfig?: SubtitleEraseConfig;
  subtitleVerificationStatus?: "verified" | "failed";
  subtitleVerificationEvidence?:
    SubtitleVerificationEvidence;
  referenceUrls?: string[];
  createdAt: string;
  updatedAt: string;
};

export function ensureRenderRevisionHistory(
  render: RenderVariant,
) {
  render.revisions ??= [];
  if (!render.videoUrl) return;

  const current = render.revisions.find(
    (revision) => revision.id === render.currentRevisionId,
  );
  if (current?.videoUrl === render.videoUrl) return;

  const matching = [...render.revisions]
    .reverse()
    .find((revision) => revision.videoUrl === render.videoUrl);
  if (matching) {
    render.currentRevisionId = matching.id;
    return;
  }

  const revision: RenderRevision = {
    id: `${render.id}-revision-${render.revisions.length + 1}`,
    videoUrl: render.videoUrl,
    operation: render.processedOperation ?? "generated",
    sourceJobId: render.sourceJobId,
    subtitleEraseConfig: render.subtitleEraseConfig,
    subtitleVerificationStatus:
      render.subtitleVerificationStatus,
    subtitleVerificationEvidence:
      render.subtitleVerificationEvidence,
    createdAt: render.updatedAt || render.createdAt,
  };
  render.revisions.push(revision);
  render.currentRevisionId = revision.id;
}

function applyRevisionMetadata(
  render: RenderVariant,
  revision: RenderRevision,
  updatedAt: string,
) {
  render.currentRevisionId = revision.id;
  render.videoUrl = revision.videoUrl;
  render.processedOperation =
    revision.operation === "generated" ||
    revision.operation === "baseline"
      ? undefined
      : revision.operation;
  render.subtitleEraseConfig = revision.subtitleEraseConfig;
  render.subtitleVerificationStatus =
    revision.subtitleVerificationStatus;
  render.subtitleVerificationEvidence =
    revision.subtitleVerificationEvidence;
  render.updatedAt = updatedAt;
}

export function appendRenderRevision(
  render: RenderVariant,
  revision: Omit<
    RenderRevision,
    "parentRevisionId" | "createdAt"
  >,
  createdAt: string,
) {
  ensureRenderRevisionHistory(render);
  const next: RenderRevision = {
    ...revision,
    parentRevisionId: render.currentRevisionId,
    createdAt,
  };
  render.revisions = [...(render.revisions ?? []), next];
  applyRevisionMetadata(render, next, createdAt);
  return next;
}

export function activateRenderRevisionState(
  render: RenderVariant,
  revisionId: string,
  updatedAt: string,
) {
  ensureRenderRevisionHistory(render);
  const revision = render.revisions?.find(
    (item) => item.id === revisionId,
  );
  if (!revision) {
    throw new Error("视频版本不存在");
  }
  applyRevisionMetadata(render, revision, updatedAt);
  return revision;
}

export function mergeRenderVersion(
  current: RenderVariant,
  render: Partial<RenderVariant>,
  updatedAt: string,
) {
  ensureRenderRevisionHistory(current);
  const previousVideoUrl = current.videoUrl;
  const { videoUrl, ...patch } = render;
  Object.assign(current, patch, { updatedAt });
  if (videoUrl && videoUrl !== previousVideoUrl) {
    appendRenderRevision(
      current,
      {
        id: `${current.id}-revision-${(current.revisions?.length ?? 0) + 1}`,
        videoUrl,
        operation: "generated",
        sourceJobId: current.sourceJobId,
      },
      updatedAt,
    );
  } else if (videoUrl !== undefined) {
    current.videoUrl = videoUrl;
  }
  return current;
}

export type Composition = {
  id: string;
  projectId: string;
  renderId: string;
  highlightId: string;
  status: string;
  upstreamId?: string;
  videoUrl?: string;
  objectKey?: string;
  originalVideoUrl?: string;
  processedOperation?:
    | "image_watermark"
    | "text_watermark";
  watermarkText?: string;
  sourceRenderVideoUrl?: string;
  sourceRenderSubtitleVerified?: boolean;
  rejectedVideoUrl?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeRenderArtifacts(
  renders: RenderVariant[],
  compositions: Composition[],
) {
  const currentByScript = new Map<string, RenderVariant>();
  for (const render of renders) {
    const current = currentByScript.get(render.scriptId);
    if (
      !current ||
      render.createdAt.localeCompare(current.createdAt) > 0
    ) {
      currentByScript.set(render.scriptId, render);
    }
  }
  renders.splice(0, renders.length, ...currentByScript.values());
  renders.forEach(ensureRenderRevisionHistory);
  const currentRenderIds = new Set(renders.map((render) => render.id));

  for (const composition of compositions) {
    if (
      currentRenderIds.has(composition.renderId) ||
      composition.status === "stale"
    ) {
      continue;
    }
    composition.status = "stale";
  }

  for (const render of renders) {
    for (const composition of compositions) {
      if (
        composition.renderId !== render.id ||
        composition.status === "stale"
      ) {
        continue;
      }
      if (
        composition.sourceRenderVideoUrl === render.videoUrl
      ) {
        continue;
      }
      if (
        !composition.sourceRenderVideoUrl &&
        composition.updatedAt >= render.updatedAt
      ) {
        composition.sourceRenderVideoUrl = render.videoUrl;
        continue;
      }

      composition.status = "stale";
    }
  }
}

export function invalidateCompositionsForRenderVersion(
  compositions: Composition[],
  render: RenderVariant,
  previousVideoUrl: string | undefined,
  updatedAt: string,
) {
  if (
    !render.videoUrl ||
    render.videoUrl === previousVideoUrl
  ) {
    return;
  }

  for (const composition of compositions) {
    if (
      composition.renderId !== render.id ||
      composition.sourceRenderVideoUrl === render.videoUrl
    ) {
      continue;
    }
    composition.status = "stale";
    composition.updatedAt = updatedAt;
  }
}

export function resolveCompositionVersion<
  T extends Pick<
    Composition,
    "sourceRenderVideoUrl" | "status" | "videoUrl"
  >,
>(
  composition: T,
  render: Pick<RenderVariant, "videoUrl"> | undefined,
) {
  if (
    !composition.sourceRenderVideoUrl ||
    !render?.videoUrl ||
    composition.sourceRenderVideoUrl === render.videoUrl
  ) {
    return composition;
  }
  return {
    ...composition,
    status: "stale",
  };
}

export type PipelineRun = {
  id: string;
  sequence?: number;
  projectId: string;
  sourceAssetIds: string[];
  status: string;
  planReviewRequired?: boolean;
  prerollType?: PrerollType;
  productionConfig?: ProductionConfig;
  highlightRecommendation?: PipelineProject["highlightRecommendation"];
  analysis?: StorylineResult;
  highlightAnalyses?: HighlightAnalysis[];
  mediaUnderstandings?: MediaUnderstanding[];
  sharedStoryContext?: SharedStoryContext;
  characters: CharacterBinding[];
  arcs: StoryArc[];
  highlights: HighlightVariant[];
  scripts: ScriptVariant[];
  renders: RenderVariant[];
  compositions: Composition[];
  createdAt: string;
  updatedAt: string;
};

function isPipelineRunSequence(value: number | undefined): value is number {
  return Number.isInteger(value) && (value ?? 0) > 0;
}

export function assignPipelineRunSequences(runs: PipelineRun[]) {
  const used = new Set(
    runs
      .map((run) => run.sequence)
      .filter(isPipelineRunSequence),
  );
  const unnumbered = runs
    .filter((run) => !isPipelineRunSequence(run.sequence))
    .sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
    );
  let sequence = 1;
  for (const run of unnumbered) {
    while (used.has(sequence)) sequence += 1;
    run.sequence = sequence;
    used.add(sequence);
  }
  return runs;
}

export function nextPipelineRunSequence(runs: PipelineRun[]) {
  assignPipelineRunSequences(runs);
  return runs.reduce(
    (maximum, run) =>
      isPipelineRunSequence(run.sequence)
        ? Math.max(maximum, run.sequence)
        : maximum,
    0,
  ) + 1;
}

export type ProductionPlanSnapshot = {
  productionConfig: ProductionConfig;
  highlightRecommendation: NonNullable<
    PipelineProject["highlightRecommendation"]
  >;
  prerollType?: PrerollType;
  sourceAssetIds: string[];
  updatedAt: string;
};

export type PipelineProject = {
  projectId: string;
  status: string;
  currentRunId?: string;
  currentRunCreatedAt?: string;
  runs?: PipelineRun[];
  planReviewRequired?: boolean;
  analysisSourceAssetIds?: string[];
  prerollType?: PrerollType;
  productionConfig?: ProductionConfig;
  highlightRecommendation?: {
    minDuration: number;
    maxDuration: number;
    maxNumber: number;
    targetDuration: number;
    recommendedNumber: number;
    upperLimit: number;
    recommendedDuration: number;
    durationUpperLimit: number;
    maximumSelectableCount: number;
    sourceDuration: number;
    cutMode: "Mixed";
    enableOpeningHook: boolean;
    rationale: string;
  };
  analysis?: StorylineResult;
  highlightAnalyses?: HighlightAnalysis[];
  mediaUnderstandings?: MediaUnderstanding[];
  sharedStoryContext?: SharedStoryContext;
  characters: CharacterBinding[];
  arcs: StoryArc[];
  highlights: HighlightVariant[];
  scripts: ScriptVariant[];
  renders: RenderVariant[];
  compositions: Composition[];
  productionPlans?: Partial<
    Record<
      ProductionConfig["productionEntry"],
      ProductionPlanSnapshot
    >
  >;
  updatedAt: string;
};

type PipelineData = {
  projects: PipelineProject[];
  jobs: PipelineJob[];
};

export function reconcileRunProductionEntries(
  projects: PipelineProject[],
  jobs: PipelineJob[],
) {
  const entriesByRun = new Map<
    string,
    Set<ProductionConfig["productionEntry"]>
  >();
  for (const job of jobs) {
    if (!job.runId) continue;
    const entry = job.input.productionEntry;
    if (
      typeof entry !== "string" ||
      !productionEntries.includes(
        entry as ProductionConfig["productionEntry"],
      )
    ) {
      continue;
    }
    const entries = entriesByRun.get(job.runId) ?? new Set();
    entries.add(
      entry as ProductionConfig["productionEntry"],
    );
    entriesByRun.set(job.runId, entries);
  }
  for (const project of projects) {
    for (const run of project.runs ?? []) {
      const entries = entriesByRun.get(run.id);
      if (
        !run.productionConfig ||
        !entries ||
        entries.size !== 1
      ) {
        continue;
      }
      const [entry] = entries;
      if (
        run.productionConfig.productionEntry === entry
      ) {
        continue;
      }
      run.productionConfig = {
        ...run.productionConfig,
        productionEntry: entry,
      };
      if (project.currentRunId === run.id) {
        project.productionConfig = run.productionConfig;
      }
    }
  }
  return projects;
}

export function reconcileCompositionJobResults(
  projects: PipelineProject[],
  jobs: PipelineJob[],
) {
  const projectsById = new Map(
    projects.map((project) => [project.projectId, project]),
  );
  for (const job of jobs) {
    if (
      job.kind !== "compose" ||
      job.status !== "completed" ||
      !job.runId
    ) {
      continue;
    }
    const compositionId =
      typeof job.input.compositionId === "string"
        ? job.input.compositionId
        : "";
    const renderId =
      typeof job.input.renderId === "string"
        ? job.input.renderId
        : "";
    const highlightId =
      typeof job.input.highlightId === "string"
        ? job.input.highlightId
        : "";
    const videoUrl =
      job.result &&
      typeof job.result === "object" &&
      typeof (job.result as Record<string, unknown>).videoUrl ===
        "string"
        ? String(
            (job.result as Record<string, unknown>).videoUrl,
          )
        : "";
    if (!compositionId || !renderId || !highlightId || !videoUrl) {
      continue;
    }
    const project = projectsById.get(job.projectId);
    const targetRun = project?.runs?.find(
      (run) => run.id === job.runId,
    );
    if (!project || !targetRun) continue;

    const existing = [
      ...project.compositions,
      ...(project.runs ?? []).flatMap(
        (run) => run.compositions,
      ),
    ].find(
      (composition) =>
        composition.id === compositionId &&
        Boolean(composition.videoUrl),
    );
    const recovered: Composition = {
      ...existing,
      id: compositionId,
      projectId: project.projectId,
      renderId,
      highlightId,
      status: "completed",
      upstreamId: existing?.upstreamId ?? job.upstreamId,
      videoUrl,
      sourceRenderVideoUrl:
        typeof job.input.renderVideoUrl === "string"
          ? job.input.renderVideoUrl
          : existing?.sourceRenderVideoUrl,
      sourceRenderSubtitleVerified:
        typeof job.input.sourceRenderSubtitleVerified ===
          "boolean"
          ? job.input.sourceRenderSubtitleVerified
          : existing?.sourceRenderSubtitleVerified,
      createdAt: existing?.createdAt ?? job.createdAt,
      updatedAt: job.updatedAt,
    };

    for (const run of project.runs ?? []) {
      if (run.id === targetRun.id) continue;
      run.compositions = run.compositions.filter(
        (composition) => composition.id !== compositionId,
      );
    }
    const targetIndex = targetRun.compositions.findIndex(
      (composition) => composition.id === compositionId,
    );
    if (targetIndex >= 0) {
      targetRun.compositions[targetIndex] = recovered;
    } else {
      targetRun.compositions.push(recovered);
    }
    targetRun.status = "completed";
    if (project.currentRunId === targetRun.id) {
      project.compositions = targetRun.compositions;
      project.status = "completed";
    } else {
      project.compositions = project.compositions.filter(
        (composition) => composition.id !== compositionId,
      );
    }
  }
  return projects;
}

const storePath = path.join(process.cwd(), "data", "pipeline-store.json");
let writeQueue = Promise.resolve();
let databaseAvailable: boolean | undefined;
let localDataCache:
  | {
      modifiedAt: number;
      data: PipelineData;
    }
  | undefined;

function emptyData(): PipelineData {
  return { projects: [], jobs: [] };
}

function normalizeProjectRuns(project: PipelineProject) {
  project.runs ??= [];
  assignPipelineRunSequences(project.runs);
  project.characters ??= [];
  project.highlightAnalyses ??= [];
  project.mediaUnderstandings ??= [];
  project.productionPlans ??= {};
  project.runs.forEach((run) => {
    run.characters ??= [];
    run.highlightAnalyses ??= [];
    run.mediaUnderstandings ??= [];
    run.highlightAnalyses.forEach((entry) => {
      entry.sourceName ||=
        entry.analysis.sourceVideoInfo[0]?.title ||
        entry.highlightId;
    });
    normalizeRenderArtifacts(
      run.renders,
      run.compositions,
    );
  });
  normalizeRenderArtifacts(
    project.renders,
    project.compositions,
  );
  project.highlightAnalyses.forEach((entry) => {
    entry.sourceName ||=
      entry.analysis.sourceVideoInfo[0]?.title ||
      entry.highlightId;
  });
  const currentRun = project.runs.find(
    (run) => run.id === project.currentRunId,
  );
  if (
    currentRun &&
    currentRun.updatedAt >= project.updatedAt
  ) {
    Object.assign(project, {
      status: currentRun.status,
      planReviewRequired: currentRun.planReviewRequired,
      prerollType: currentRun.prerollType,
      analysisSourceAssetIds: currentRun.sourceAssetIds,
      productionConfig: currentRun.productionConfig,
      highlightRecommendation:
        currentRun.highlightRecommendation,
      analysis: currentRun.analysis,
      highlightAnalyses: currentRun.highlightAnalyses,
      mediaUnderstandings: currentRun.mediaUnderstandings,
      sharedStoryContext: currentRun.sharedStoryContext,
      characters:
        currentRun.characters.length > 0
          ? currentRun.characters
          : project.characters,
      arcs: currentRun.arcs,
      highlights: currentRun.highlights,
      scripts: currentRun.scripts,
      renders: currentRun.renders,
      compositions: currentRun.compositions,
      updatedAt: currentRun.updatedAt,
    });
  }
  project.scripts.forEach((script) => {
    const legacyPlan = script.videoPromptPlan?.segments.some(
      (segment) => {
        const value = segment as VideoPromptSegment & {
          firstFrameAnchor?: string;
          lastFrameAnchor?: string;
        };
        return (
          Boolean(value.firstFrameAnchor) ||
          Boolean(value.lastFrameAnchor) ||
          /【(?:连续性|合规角标)】/.test(value.prompt) ||
          (
            script.videoPromptPlan?.templateMode !==
              "network_replica" &&
            (
              !value.prompt.includes("【画面描述】") ||
              !value.prompt.includes("【镜头1】") ||
              !value.prompt.includes(
                "【全局限制(Negative)】",
              )
            )
          ) ||
          /(?:\d{3,4}\s*[pP]|分辨率|码率|帧率|fps|文件格式)/i.test(
            value.prompt,
          ) ||
          /\d+(?:\.\d+)?\s*倍速|\d+(?:\.\d+)?\s*[-–~至]\s*\d+(?:\.\d+)?\s*字\s*\/?\s*秒/.test(
            value.prompt,
          ) ||
          (
            value.prompt.includes(
              "【全局限制(Negative)】",
            ) &&
            (
              !value.prompt.includes("生成缺陷类") ||
              !value.prompt.includes("内容合规类")
            )
          ) ||
          /(?<![\d.])(?:1\.[6-9]\d*|[2-9]\d*(?:\.\d+)?)\s*倍速|约?\s*8\s*字(?:每秒|\/秒)/.test(
            value.prompt,
          )
        );
      },
    );
    if (legacyPlan) {
      script.videoPrompt = "";
      script.videoPromptStatus = "stale";
      script.videoPromptSourceHash = undefined;
      script.videoPromptCompiledAt = undefined;
      script.videoPromptPlan = undefined;
    }
  });
  if (currentRun) {
    Object.assign(currentRun, {
      sourceAssetIds:
        project.analysisSourceAssetIds ??
        currentRun.sourceAssetIds,
      status: project.status,
      planReviewRequired: project.planReviewRequired,
      prerollType: project.prerollType,
      productionConfig: project.productionConfig,
      highlightRecommendation:
        project.highlightRecommendation,
      analysis: project.analysis,
      highlightAnalyses: project.highlightAnalyses,
      mediaUnderstandings: project.mediaUnderstandings,
      sharedStoryContext: project.sharedStoryContext,
      characters: project.characters,
      arcs: project.arcs,
      highlights: project.highlights,
      scripts: project.scripts,
      renders: project.renders,
      compositions: project.compositions,
      updatedAt: project.updatedAt,
    });
  }
  return project;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function objectKeyFromUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
  try {
    return new URL(sourceUrl).pathname
      .replace(/^\/+/, "")
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return undefined;
  }
}

function runArtifacts(run: PipelineRun) {
  const artifacts: Array<{
    stage: string;
    artifactId: string;
    kind: string;
    payload: unknown;
    sourceUrl?: string;
  }> = [];
  if (run.analysis) {
    artifacts.push({
      stage: "analysis",
      artifactId: "storyline-analysis",
      kind: "analysis",
      payload: run.analysis,
    });
  }
  for (const highlightAnalysis of run.highlightAnalyses ?? []) {
    artifacts.push({
      stage: "analysis",
      artifactId:
        `highlight-analysis-${highlightAnalysis.sourceHighlightAssetId}`,
      kind: "highlight_analysis",
      payload: highlightAnalysis,
    });
  }
  for (const understanding of run.mediaUnderstandings ?? []) {
    artifacts.push({
      stage: "analysis",
      artifactId:
        `media-understanding-${understanding.assetRevisionKey}`,
      kind: "media_understanding",
      payload: understanding,
      sourceUrl: understanding.sourceVideoUrl,
    });
  }
  if (run.sharedStoryContext) {
    artifacts.push({
      stage: "analysis",
      artifactId: "shared-story-context",
      kind: "shared_story_context",
      payload: run.sharedStoryContext,
    });
  }
  for (const arc of run.arcs) {
    artifacts.push({
      stage: "strategies",
      artifactId: arc.id,
      kind: "story_arc",
      payload: arc,
    });
  }
  for (const highlight of run.highlights) {
    artifacts.push({
      stage: "highlights",
      artifactId: highlight.id,
      kind: "highlight",
      payload: highlight,
      sourceUrl: highlight.result?.videoUrls[0],
    });
  }
  for (const script of run.scripts) {
    artifacts.push({
      stage: "scripts",
      artifactId: script.id,
      kind: "preroll_script",
      payload: script,
    });
  }
  for (const render of run.renders) {
    artifacts.push({
      stage: "prerolls",
      artifactId: render.id,
      kind: "preroll_video",
      payload: render,
      sourceUrl: render.videoUrl,
    });
  }
  for (const composition of run.compositions) {
    artifacts.push({
      stage: "compositions",
      artifactId: composition.id,
      kind: "composition",
      payload: composition,
      sourceUrl: composition.videoUrl,
    });
  }
  return artifacts;
}

async function readDatabaseData(): Promise<PipelineData | null> {
  if (env.PERSISTENCE_MODE !== "mysql" || databaseAvailable === false) {
    return null;
  }
  try {
    const [databaseRuns, databaseJobs] = await Promise.all([
      db.productionRun.findMany({
        orderBy: { createdAt: "asc" },
      }),
      db.job.findMany({
        where: { provider: "pipeline" },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    if (!databaseRuns.length && !databaseJobs.length) return null;
    const projectsById = new Map<string, PipelineProject>();
    for (const databaseRun of databaseRuns) {
      const run = databaseRun.snapshot as unknown as PipelineRun;
      let project = projectsById.get(databaseRun.projectId);
      if (!project) {
        project = {
          projectId: databaseRun.projectId,
          status: run.status,
          runs: [],
          characters: run.characters ?? [],
          arcs: [],
          highlights: [],
          scripts: [],
          renders: [],
          compositions: [],
          updatedAt: run.updatedAt,
        };
        projectsById.set(databaseRun.projectId, project);
      }
      project.runs?.push(run);
      if (databaseRun.isCurrent) {
        Object.assign(project, {
          currentRunId: run.id,
          status: run.status,
          planReviewRequired: run.planReviewRequired,
          prerollType: run.prerollType,
          analysisSourceAssetIds: run.sourceAssetIds,
          productionConfig: run.productionConfig,
          highlightRecommendation: run.highlightRecommendation,
          analysis: run.analysis,
          highlightAnalyses: run.highlightAnalyses ?? [],
          mediaUnderstandings: run.mediaUnderstandings ?? [],
          sharedStoryContext: run.sharedStoryContext,
          characters: run.characters ?? [],
          arcs: run.arcs,
          highlights: run.highlights,
          scripts: run.scripts,
          renders: run.renders,
          compositions: run.compositions,
          updatedAt: run.updatedAt,
        });
      }
    }
    databaseAvailable = true;
    const jobs = databaseJobs.map((job) => ({
        id: job.id,
        projectId: job.projectId,
        runId: job.runId ?? undefined,
        kind: job.stage as PipelineJobKind,
        status: job.status as PipelineJob["status"],
        progress: job.progress,
        upstreamId: job.upstreamRequestId ?? undefined,
        parentId: job.parentId ?? undefined,
        input: (job.input as Record<string, unknown> | null) ?? {},
        result: job.result ?? undefined,
        error: job.errorMessage ?? undefined,
        attempts: job.attempts,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.finishedAt?.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      }));
    const projects = [...projectsById.values()].map(
      normalizeProjectRuns,
    );
    reconcileRunProductionEntries(projects, jobs);
    reconcileCompositionJobResults(projects, jobs);
    return { projects, jobs };
  } catch {
    databaseAvailable = false;
    return null;
  }
}

async function persistDatabaseData(data: PipelineData) {
  if (env.PERSISTENCE_MODE !== "mysql" || databaseAvailable === false) return;
  try {
    await db.$transaction(async (transaction) => {
      for (const project of data.projects) {
        await transaction.productionRun.updateMany({
          where: { projectId: project.projectId },
          data: { isCurrent: false },
        });
        for (const run of project.runs ?? []) {
          await transaction.productionRun.upsert({
            where: { id: run.id },
            update: {
              sourceAssetIds: jsonValue(run.sourceAssetIds),
              status: run.status,
              isCurrent: run.id === project.currentRunId,
              planReviewRequired: run.planReviewRequired ?? false,
              productionConfig: run.productionConfig
                ? jsonValue(run.productionConfig)
                : Prisma.DbNull,
              highlightRecommendation: run.highlightRecommendation
                ? jsonValue(run.highlightRecommendation)
                : Prisma.DbNull,
              analysis: run.analysis ? jsonValue(run.analysis) : Prisma.DbNull,
              arcs: jsonValue(run.arcs),
              snapshot: jsonValue(run),
              updatedAt: new Date(run.updatedAt),
            },
            create: {
              id: run.id,
              projectId: run.projectId,
              sourceAssetIds: jsonValue(run.sourceAssetIds),
              status: run.status,
              isCurrent: run.id === project.currentRunId,
              planReviewRequired: run.planReviewRequired ?? false,
              productionConfig: run.productionConfig
                ? jsonValue(run.productionConfig)
                : Prisma.DbNull,
              highlightRecommendation: run.highlightRecommendation
                ? jsonValue(run.highlightRecommendation)
                : Prisma.DbNull,
              analysis: run.analysis ? jsonValue(run.analysis) : Prisma.DbNull,
              arcs: jsonValue(run.arcs),
              snapshot: jsonValue(run),
              createdAt: new Date(run.createdAt),
              updatedAt: new Date(run.updatedAt),
            },
          });
          for (const artifact of runArtifacts(run)) {
            await transaction.runArtifact.upsert({
              where: {
                runId_stage_artifactId: {
                  runId: run.id,
                  stage: artifact.stage,
                  artifactId: artifact.artifactId,
                },
              },
              update: {
                kind: artifact.kind,
                payload: jsonValue(artifact.payload),
                objectKey: objectKeyFromUrl(artifact.sourceUrl),
                sourceUrl: artifact.sourceUrl,
              },
              create: {
                runId: run.id,
                stage: artifact.stage,
                artifactId: artifact.artifactId,
                kind: artifact.kind,
                payload: jsonValue(artifact.payload),
                objectKey: objectKeyFromUrl(artifact.sourceUrl),
                sourceUrl: artifact.sourceUrl,
              },
            });
          }
        }
      }
      for (const job of data.jobs) {
        await transaction.job.upsert({
          where: { id: job.id },
          update: {
            runId: job.runId,
            stage: job.kind,
            status: job.status,
            progress: job.progress,
            attempts: job.attempts,
            parentId: job.parentId,
            upstreamRequestId: job.upstreamId,
            input: jsonValue(job.input),
            result:
              job.result === undefined ? Prisma.DbNull : jsonValue(job.result),
            errorMessage: job.error,
            startedAt:
              job.status === "running" ? new Date(job.updatedAt) : undefined,
            finishedAt:
              job.completedAt
                ? new Date(job.completedAt)
                : null,
          },
          create: {
            id: job.id,
            projectId: job.projectId,
            runId: job.runId,
            stage: job.kind,
            provider: "pipeline",
            status: job.status,
            progress: job.progress,
            attempts: job.attempts,
            parentId: job.parentId,
            upstreamRequestId: job.upstreamId,
            idempotencyKey: job.id,
            input: jsonValue(job.input),
            result:
              job.result === undefined ? Prisma.DbNull : jsonValue(job.result),
            errorMessage: job.error,
            startedAt:
              job.status === "running" ? new Date(job.updatedAt) : undefined,
            finishedAt:
              job.completedAt
                ? new Date(job.completedAt)
                : undefined,
            createdAt: new Date(job.createdAt),
            updatedAt: new Date(job.updatedAt),
          },
        });
      }
    });
    databaseAvailable = true;
  } catch {
    databaseAvailable = false;
  }
}

async function readData(): Promise<PipelineData> {
  const databaseData = await readDatabaseData();
  if (databaseData) return databaseData;
  try {
    const file = await stat(storePath);
    if (localDataCache?.modifiedAt === file.mtimeMs) {
      return localDataCache.data;
    }
    const parsed = JSON.parse(
      await readFile(storePath, "utf8"),
    ) as Partial<PipelineData>;
    const data = {
      projects: (parsed.projects ?? []).map(normalizeProjectRuns),
      jobs: parsed.jobs ?? [],
    };
    reconcileRunProductionEntries(data.projects, data.jobs);
    reconcileCompositionJobResults(data.projects, data.jobs);
    localDataCache = {
      modifiedAt: file.mtimeMs,
      data,
    };
    return data;
  } catch {
    return emptyData();
  }
}

async function writeData(data: PipelineData) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, storePath);
  localDataCache = {
    modifiedAt: (await stat(storePath)).mtimeMs,
    data,
  };
}

async function mutate<T>(change: (data: PipelineData) => T | Promise<T>): Promise<T> {
  let resolveResult!: (value: T) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  writeQueue = writeQueue.then(async () => {
    try {
      const data = await readData();
      const value = await change(data);
      await writeData(data);
      await persistDatabaseData(data);
      resolveResult(value);
    } catch (error) {
      rejectResult(error);
    }
  });
  await writeQueue;
  return result;
}

function ensureProject(data: PipelineData, projectId: string) {
  let project = data.projects.find((item) => item.projectId === projectId);
  if (!project) {
    project = {
      projectId,
      status: "ready",
      runs: [],
      characters: [],
      arcs: [],
      highlights: [],
      scripts: [],
      renders: [],
      compositions: [],
      updatedAt: new Date().toISOString(),
    };
    data.projects.push(project);
  }
  return project;
}

function syncCurrentRun(project: PipelineProject) {
  const run = project.runs?.find((item) => item.id === project.currentRunId);
  if (!run) return;
  Object.assign(run, {
    sourceAssetIds: project.analysisSourceAssetIds ?? run.sourceAssetIds,
    status: project.status,
    planReviewRequired: project.planReviewRequired,
    prerollType: project.prerollType,
    productionConfig: project.productionConfig,
    highlightRecommendation: project.highlightRecommendation,
    analysis: project.analysis,
    highlightAnalyses: project.highlightAnalyses,
    mediaUnderstandings: project.mediaUnderstandings,
    sharedStoryContext: project.sharedStoryContext,
    arcs: project.arcs,
    highlights: project.highlights,
    scripts: project.scripts,
    renders: project.renders,
    compositions: project.compositions,
    updatedAt: new Date().toISOString(),
  });
}

function sameSourceAssets(left: string[], right: string[]) {
  return left.length === right.length &&
    left.every((id, index) => id === right[index]);
}

function latestSharedRun(
  project: PipelineProject,
  sourceAssetIds?: string[],
  requireArcs = false,
) {
  return [...(project.runs ?? [])]
    .filter(
      (run) =>
        Boolean(run.analysis) &&
        (!requireArcs || run.arcs.length > 0) &&
        (!sourceAssetIds ||
          sameSourceAssets(run.sourceAssetIds, sourceAssetIds)),
    )
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0];
}

function latestSharedArcsRun(
  project: PipelineProject,
  sourceAssetIds: string[] | undefined,
  analysis: StorylineResult | undefined,
) {
  if (!analysis) return undefined;
  const revision = JSON.stringify(analysis);
  return [...(project.runs ?? [])]
    .filter(
      (run) =>
        run.arcs.length > 0 &&
        Boolean(run.analysis) &&
        JSON.stringify(run.analysis) === revision &&
        (!sourceAssetIds ||
          sameSourceAssets(run.sourceAssetIds, sourceAssetIds)),
    )
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0];
}

export async function startPipelineRun(
  projectId: string,
  runId: string,
  sourceAssetIds: string[],
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    syncCurrentRun(project);
    const now = new Date().toISOString();
    project.currentRunId = runId;
    project.analysisSourceAssetIds = sourceAssetIds;
    project.planReviewRequired = false;
    project.prerollType = undefined;
    project.status = "analysis_queued";
    project.productionConfig = undefined;
    project.highlightRecommendation = undefined;
    project.analysis = undefined;
    project.highlightAnalyses = [];
    project.mediaUnderstandings = [];
    project.sharedStoryContext = undefined;
    project.arcs = [];
    project.highlights = [];
    project.scripts = [];
    project.renders = [];
    project.compositions = [];
    const run: PipelineRun = {
      id: runId,
      sequence: nextPipelineRunSequence(project.runs ?? []),
      projectId,
      sourceAssetIds,
      status: project.status,
      highlightAnalyses: [],
      mediaUnderstandings: [],
      characters: project.characters,
      arcs: [],
      highlights: [],
      scripts: [],
      renders: [],
      compositions: [],
      createdAt: now,
      updatedAt: now,
    };
    project.runs = [...(project.runs ?? []), run];
    project.updatedAt = now;
    return run;
  });
}

export async function startPipelineRunFromSharedArtifacts(
  projectId: string,
  runId: string,
  sourceAssetIds: string[],
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    syncCurrentRun(project);
    const shared = latestSharedRun(
      project,
      sourceAssetIds,
    );
    const sharedArcs = latestSharedArcsRun(
      project,
      sourceAssetIds,
      shared.analysis,
    );
    if (!shared?.analysis) {
      throw new Error("当前素材没有可复用的剧情理解结果");
    }
    const now = new Date().toISOString();
    const run: PipelineRun = {
      id: runId,
      sequence: nextPipelineRunSequence(project.runs ?? []),
      projectId,
      sourceAssetIds,
      status: sharedArcs?.arcs.length
        ? "arcs_ready"
        : "analysis_completed",
      planReviewRequired: false,
      analysis: shared.analysis,
      highlightAnalyses: shared.highlightAnalyses ?? [],
      mediaUnderstandings: shared.mediaUnderstandings ?? [],
      sharedStoryContext: shared.sharedStoryContext,
      characters:
        shared.characters.length > 0
          ? shared.characters
          : project.characters,
      arcs: sharedArcs?.arcs ?? [],
      highlights: [],
      scripts: [],
      renders: [],
      compositions: [],
      createdAt: now,
      updatedAt: now,
    };
    project.currentRunId = runId;
    project.analysisSourceAssetIds = sourceAssetIds;
    project.status = run.status;
    project.planReviewRequired = false;
    project.analysis = run.analysis;
    project.highlightAnalyses = run.highlightAnalyses;
    project.sharedStoryContext = run.sharedStoryContext;
    project.characters = run.characters;
    project.arcs = run.arcs;
    project.highlights = [];
    project.scripts = [];
    project.renders = [];
    project.compositions = [];
    project.runs = [...(project.runs ?? []), run];
    project.updatedAt = now;
    return run;
  });
}

export async function listPipelineRuns(projectId?: string) {
  const data = await readData();
  return data.projects
    .filter((project) => !projectId || project.projectId === projectId)
    .flatMap((project) => project.runs ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPipelineProject(projectId: string) {
  const data = await readData();
  const project = data.projects.find((item) => item.projectId === projectId);
  if (!project) return null;
  if (project.planReviewRequired) {
    return { ...project, status: "plan_review" };
  }
  return project.compositions.some((item) => item.status === "completed")
    ? { ...project, status: "completed" }
    : project;
}

export async function getPipelineProjectRun(
  projectId: string,
  runId?: string,
) {
  const data = await readData();
  const project = data.projects.find(
    (item) => item.projectId === projectId,
  );
  if (!project || !runId) return project ?? null;
  const run = project.runs?.find((item) => item.id === runId);
  if (!run) return null;
  return {
    ...project,
    currentRunId: run.id,
    currentRunCreatedAt: run.createdAt,
    status: run.compositions.some(
      (composition) => composition.status === "completed",
    )
      ? "completed"
      : run.status,
    planReviewRequired: run.planReviewRequired,
    prerollType: run.prerollType,
    analysisSourceAssetIds: run.sourceAssetIds,
    productionConfig: run.productionConfig,
    highlightRecommendation: run.highlightRecommendation,
    analysis: run.analysis,
    highlightAnalyses: run.highlightAnalyses ?? [],
    mediaUnderstandings: run.mediaUnderstandings ?? [],
    sharedStoryContext: run.sharedStoryContext,
    characters:
      run.characters.length > 0
        ? run.characters
        : project.characters,
    arcs: run.arcs,
    highlights: run.highlights,
    scripts: run.scripts,
    renders: run.renders,
    compositions: run.compositions,
    updatedAt: run.updatedAt,
  } satisfies PipelineProject;
}

function hydrateProjectFromRun(
  project: PipelineProject,
  run: PipelineRun,
) {
  Object.assign(project, {
    currentRunId: run.id,
    status: run.status,
    planReviewRequired: run.planReviewRequired,
    prerollType: run.prerollType,
    analysisSourceAssetIds: run.sourceAssetIds,
    productionConfig: run.productionConfig,
    highlightRecommendation: run.highlightRecommendation,
    analysis: run.analysis,
    highlightAnalyses: run.highlightAnalyses ?? [],
    mediaUnderstandings: run.mediaUnderstandings ?? [],
    sharedStoryContext: run.sharedStoryContext,
    characters:
      run.characters.length > 0
        ? run.characters
        : project.characters,
    arcs: run.arcs,
    highlights: run.highlights,
    scripts: run.scripts,
    renders: run.renders,
    compositions: run.compositions,
    updatedAt: new Date().toISOString(),
  });
}

// The workspace snapshot (GET) shows the latest run for the requested
// production entry, but every write path resolves scripts/renders from the
// top-level project.* fields synced with `currentRunId`. When the viewed run
// differs from the active batch (e.g. a `full_drama` batch is on screen while
// `currentRunId` points at an `uploaded_highlights` batch), the viewed script
// IDs never exist in the write batch. Switch `currentRunId` to the run the UI
// is actually viewing before mutating, so writes act on the same batch.
export function applyActiveRunForEntry(
  project: PipelineProject,
  productionEntry: ProductionConfig["productionEntry"],
) {
  const current = project.runs?.find(
    (run) => run.id === project.currentRunId,
  );
  if (
    current?.productionConfig?.productionEntry ===
    productionEntry
  ) {
    return false;
  }
  const target = [...(project.runs ?? [])]
    .filter(
      (run) =>
        run.productionConfig?.productionEntry ===
        productionEntry,
    )
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0];
  if (!target || target.id === project.currentRunId) {
    return false;
  }
  // Persist the batch we are leaving before switching pointers.
  syncCurrentRun(project);
  hydrateProjectFromRun(project, target);
  return true;
}

export async function activatePipelineRun(
  projectId: string,
  productionEntry?: ProductionConfig["productionEntry"],
) {
  if (!productionEntry) return getPipelineProject(projectId);
  return mutate((data) => {
    const project = data.projects.find(
      (item) => item.projectId === projectId,
    );
    if (!project) return null;
    applyActiveRunForEntry(project, productionEntry);
    return project;
  });
}

export async function activatePipelineRunById(
  projectId: string,
  runId: string,
  productionEntry: ProductionConfig["productionEntry"],
) {
  return mutate((data) => {
    const project = data.projects.find(
      (item) => item.projectId === projectId,
    );
    if (!project) return null;
    const target = project.runs?.find(
      (run) =>
        run.id === runId &&
        run.productionConfig?.productionEntry ===
          productionEntry,
    );
    if (!target) {
      throw new Error("生产批次不存在或不属于当前工作流");
    }
    if (target.id === project.currentRunId) {
      return project;
    }
    syncCurrentRun(project);
    hydrateProjectFromRun(project, target);
    return project;
  });
}

export function resolvePipelineWorkspaceProject(
  project: PipelineProject,
  productionEntry: ProductionConfig["productionEntry"],
) {
  const matchingRuns = [...(project.runs ?? [])].filter(
    (item) =>
      item.productionConfig?.productionEntry ===
      productionEntry,
  );
  const currentRun = matchingRuns.find(
    (item) => item.id === project.currentRunId,
  );
  const run = currentRun ?? matchingRuns
    .filter(
      (item) => item.id !== project.currentRunId,
    )
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0];
  const shared = latestSharedRun(
    project,
    run?.sourceAssetIds,
  );
  const effectiveAnalysis = run?.analysis ?? shared?.analysis;
  const sharedArcs = latestSharedArcsRun(
    project,
    run?.sourceAssetIds ?? shared?.sourceAssetIds,
    effectiveAnalysis,
  );

  return run || shared
    ? {
        ...project,
        currentRunId: run?.id,
        currentRunCreatedAt: run?.createdAt,
        status:
          run?.status ??
          (sharedArcs?.arcs.length
            ? "arcs_ready"
            : "analysis_completed"),
        planReviewRequired:
          run?.planReviewRequired ?? Boolean(shared?.analysis),
        prerollType: run?.prerollType,
        analysisSourceAssetIds:
          run?.sourceAssetIds ?? shared?.sourceAssetIds,
        productionConfig: run?.productionConfig,
        highlightRecommendation:
          run?.highlightRecommendation ??
          shared?.highlightRecommendation,
        analysis: effectiveAnalysis,
        highlightAnalyses:
          run?.highlightAnalyses ??
          shared?.highlightAnalyses ??
          [],
        mediaUnderstandings:
          run?.mediaUnderstandings ??
          shared?.mediaUnderstandings ??
          [],
        sharedStoryContext:
          run?.sharedStoryContext ??
          shared?.sharedStoryContext,
        characters:
          (run?.characters.length ?? 0) > 0
            ? run!.characters
            : (shared?.characters.length ?? 0) > 0
              ? shared!.characters
              : project.characters,
        arcs:
          (run?.arcs.length ?? 0) > 0
            ? run!.arcs
            : sharedArcs?.arcs ?? [],
        highlights: run?.highlights ?? [],
        scripts: run?.scripts ?? [],
        renders: run?.renders ?? [],
        compositions: run?.compositions ?? [],
        updatedAt:
          run?.updatedAt ?? shared?.updatedAt ?? project.updatedAt,
      }
    : null;
}

export async function getPipelineWorkspaceSnapshot(
  projectId: string,
  productionEntry?: ProductionConfig["productionEntry"],
) {
  const data = await readData();
  let project =
    data.projects.find((item) => item.projectId === projectId) ?? null;

  if (project && productionEntry) {
    project = resolvePipelineWorkspaceProject(
      project,
      productionEntry,
    );
  }

  return {
    project,
    jobs: data.jobs
      .filter((job) => job.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function listPipelineJobs(projectId?: string) {
  const data = await readData();
  return data.jobs
    .filter((job) => !projectId || job.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPipelineJob(jobId: string) {
  const data = await readData();
  return data.jobs.find((job) => job.id === jobId) ?? null;
}

export async function enqueuePipelineJob(input: {
  projectId: string;
  kind: PipelineJobKind;
  input?: Record<string, unknown>;
  parentId?: string;
}) {
  return mutate((data) => {
    const project = ensureProject(data, input.projectId);
    const jobInput = { ...(input.input ?? {}) };
    const runId =
      typeof jobInput.runId === "string"
        ? jobInput.runId
        : undefined;
    if (typeof jobInput.productionEntry !== "string") {
      const parent = input.parentId
        ? data.jobs.find((job) => job.id === input.parentId)
        : undefined;
      const run = runId
        ? project.runs?.find((item) => item.id === runId)
        : undefined;
      const productionEntry =
        parent?.input.productionEntry ??
        run?.productionConfig?.productionEntry;
      if (typeof productionEntry === "string") {
        jobInput.productionEntry = productionEntry;
      }
    }
    const now = new Date().toISOString();
    const job: PipelineJob = {
      id: `pipeline-job-${crypto.randomUUID()}`,
      projectId: input.projectId,
      runId,
      kind: input.kind,
      status: "queued",
      progress: 0,
      parentId: input.parentId,
      input: jobInput,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    data.jobs.push(job);
    return job;
  });
}

export async function claimNextPipelineJob() {
  return mutate((data) => {
    const now = Date.now();
    const job = data.jobs
      .filter((item) => item.status === "queued")
      .filter((item) => {
        if (!item.runAfter) return true;
        const runAfterMs = Date.parse(item.runAfter);
        return Number.isNaN(runAfterMs) || runAfterMs <= now;
      })
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
    if (!job) return null;
    job.status = "running";
    job.progress = Math.max(job.progress, 1);
    job.runAfter = undefined;
    job.updatedAt = new Date().toISOString();
    return job;
  });
}

export async function claimPipelineJob(jobId: string) {
  return mutate((data) => {
    const job = data.jobs.find(
      (item) => item.id === jobId && item.status === "queued",
    );
    if (!job) return null;
    job.status = "running";
    job.progress = Math.max(job.progress, 1);
    job.runAfter = undefined;
    job.updatedAt = new Date().toISOString();
    return job;
  });
}

export async function updatePipelineJob(
  jobId: string,
  patch: Partial<Omit<PipelineJob, "id" | "projectId" | "kind" | "createdAt">>,
) {
  return mutate((data) => {
    const job = data.jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("流水线任务不存在");
    const now = new Date().toISOString();
    const nextPatch = { ...patch };
    if (
      (patch.status === "completed" || patch.status === "failed") &&
      !nextPatch.completedAt
    ) {
      nextPatch.completedAt = now;
    }
    if (patch.status === "queued") {
      nextPatch.completedAt = undefined;
    }
    if (patch.status === "completed" && !("error" in nextPatch)) {
      nextPatch.error = undefined;
    }
    Object.assign(job, nextPatch, { updatedAt: now });
    return job;
  });
}

export async function requeuePipelineJob(jobId: string, patch: Partial<PipelineJob> = {}) {
  return updatePipelineJob(jobId, {
    ...patch,
    status: "queued",
    error: patch.error,
    runAfter: patch.runAfter,
  });
}

export async function reclaimStalePipelineJobs(staleMs: number) {
  const snapshot = await readData();
  const now = Date.now();
  const staleIds = snapshot.jobs
    .filter((job) => job.status === "running")
    .filter((job) => {
      const updatedAtMs = Date.parse(job.updatedAt);
      return (
        !Number.isNaN(updatedAtMs) &&
        now - updatedAtMs >= staleMs
      );
    })
    .map((job) => job.id);
  if (staleIds.length === 0) return [];
  return mutate((data) => {
    const reclaimed: Array<{
      id: string;
      kind: PipelineJobKind;
      attempts: number;
      action: "requeued" | "failed";
    }> = [];
    const timestamp = new Date().toISOString();
    for (const job of data.jobs) {
      if (job.status !== "running") continue;
      if (!staleIds.includes(job.id)) continue;
      const attempts = job.attempts + 1;
      if (attempts >= 3) {
        job.status = "failed";
        job.attempts = attempts;
        job.error = `任务连续 ${attempts} 次执行中断（服务重启或执行超时），已标记失败`;
        job.completedAt = timestamp;
        job.updatedAt = timestamp;
        reclaimed.push({
          id: job.id,
          kind: job.kind,
          attempts,
          action: "failed",
        });
      } else {
        job.status = "queued";
        job.attempts = attempts;
        job.error = `检测到中断的运行中任务（服务重启或执行超时），已自动重新排队（第 ${attempts} 次重试）`;
        job.runAfter = undefined;
        job.completedAt = undefined;
        job.updatedAt = timestamp;
        reclaimed.push({
          id: job.id,
          kind: job.kind,
          attempts,
          action: "requeued",
        });
      }
    }
    return reclaimed;
  });
}

export async function saveAnalysis(
  projectId: string,
  analysis: StorylineResult,
  planReviewRequired = false,
  sourceAssetIds: string[] = [],
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const requestedRun = runId
      ? project.runs?.find((run) => run.id === runId)
      : undefined;
    if (runId && !requestedRun) {
      throw new Error("剧情理解任务所属生产批次不存在");
    }
    const targetRun =
      requestedRun?.id !== project.currentRunId
        ? requestedRun
        : undefined;
    const now = new Date().toISOString();
    if (targetRun) {
      targetRun.analysis = analysis;
      targetRun.sourceAssetIds =
        sourceAssetIds.length > 0
          ? sourceAssetIds
          : targetRun.sourceAssetIds;
      targetRun.planReviewRequired = planReviewRequired;
      targetRun.status =
        planReviewRequired ? "plan_review" : "analysis_completed";
      targetRun.updatedAt = now;
      return targetRun;
    }
    project.analysis = analysis;
    project.analysisSourceAssetIds = sourceAssetIds;
    project.planReviewRequired = planReviewRequired;
    project.status = planReviewRequired ? "plan_review" : "analysis_completed";
    project.updatedAt = now;
    syncCurrentRun(project);
    return project;
  });
}

export async function findReusableHighlightAnalysis(
  projectId: string,
  sourceHighlightAssetId: string,
  sourceVideoUrl: string,
) {
  const data = await readData();
  const project = data.projects.find(
    (item) => item.projectId === projectId,
  );
  if (!project) return null;
  return [...(project.runs ?? [])]
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )
    .flatMap((run) =>
      (run.highlightAnalyses ?? []).map((analysis) => ({
        runId: run.id,
        analysis,
      })),
    )
    .find(
      (candidate) =>
        candidate.analysis.sourceHighlightAssetId ===
          sourceHighlightAssetId &&
        candidate.analysis.sourceVideoUrl === sourceVideoUrl,
    ) ?? null;
}

export async function findReusableMediaUnderstanding(
  projectId: string,
  assetRevisionKey: string,
  analysisProfileHash: string,
) {
  const data = await readData();
  const project = data.projects.find(
    (item) => item.projectId === projectId,
  );
  if (!project) return null;
  return [...(project.runs ?? [])]
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )
    .flatMap((run) =>
      (run.mediaUnderstandings ?? []).map((understanding) => ({
        runId: run.id,
        understanding,
      })),
    )
    .find(
      (candidate) =>
        candidate.understanding.assetRevisionKey ===
          assetRevisionKey &&
        candidate.understanding.analysisProfileHash ===
          analysisProfileHash,
    ) ?? null;
}

export async function saveMediaUnderstanding(
  projectId: string,
  runId: string,
  input: Omit<MediaUnderstanding, "createdAt" | "updatedAt">,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const run = project.runs?.find(
      (candidate) => candidate.id === runId,
    );
    if (!run) {
      throw new Error("素材理解任务所属生产批次不存在");
    }
    const now = new Date().toISOString();
    const understandings =
      run.id === project.currentRunId
        ? (project.mediaUnderstandings ??= [])
        : (run.mediaUnderstandings ??= []);
    const current = understandings.find(
      (understanding) =>
        understanding.assetRevisionKey ===
          input.assetRevisionKey &&
        understanding.analysisProfileHash ===
          input.analysisProfileHash,
    );
    if (current) {
      Object.assign(current, input, { updatedAt: now });
    } else {
      understandings.push({
        ...input,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (run.id === project.currentRunId) {
      project.updatedAt = now;
      syncCurrentRun(project);
      return project.mediaUnderstandings;
    }
    run.updatedAt = now;
    return run.mediaUnderstandings;
  });
}

export async function saveHighlightAnalysis(
  projectId: string,
  runId: string,
  input: Omit<HighlightAnalysis, "createdAt" | "updatedAt">,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const run = project.runs?.find(
      (candidate) => candidate.id === runId,
    );
    if (!run) {
      throw new Error("剧情理解任务所属生产批次不存在");
    }
    const now = new Date().toISOString();
    const analyses =
      run.id === project.currentRunId
        ? (project.highlightAnalyses ??= [])
        : (run.highlightAnalyses ??= []);
    const current = analyses.find(
      (analysis) =>
        analysis.sourceHighlightAssetId ===
        input.sourceHighlightAssetId,
    );
    if (current) {
      Object.assign(current, input, { updatedAt: now });
    } else {
      analyses.push({
        ...input,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (run.id === project.currentRunId) {
      project.analysis = mergeHighlightAnalyses(analyses);
      project.status = "analysis_running";
      project.updatedAt = now;
      syncCurrentRun(project);
      return project.highlightAnalyses;
    }
    run.analysis = mergeHighlightAnalyses(analyses);
    run.status = "analysis_running";
    run.updatedAt = now;
    return run.highlightAnalyses;
  });
}

export async function saveSharedStoryContext(
  projectId: string,
  runId: string,
  context: SharedStoryContext,
  mergedAnalysis: StorylineResult,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const run = project.runs?.find(
      (candidate) => candidate.id === runId,
    );
    if (!run) {
      throw new Error("共享剧情上下文所属生产批次不存在");
    }
    const now = new Date().toISOString();
    if (run.id === project.currentRunId) {
      project.sharedStoryContext = context;
      project.analysis = mergedAnalysis;
      project.status = "analysis_completed";
      project.updatedAt = now;
      syncCurrentRun(project);
      return project;
    }
    run.sharedStoryContext = context;
    run.analysis = mergedAnalysis;
    run.status = "analysis_completed";
    run.updatedAt = now;
    return run;
  });
}

export async function confirmProductionPlan(
  projectId: string,
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const requestedRun = runId
      ? project.runs?.find((run) => run.id === runId)
      : undefined;
    if (runId && !requestedRun) {
      throw new Error("待确认生产方案所属生产批次不存在");
    }
    const targetRun =
      requestedRun?.id !== project.currentRunId
        ? requestedRun
        : undefined;
    const now = new Date().toISOString();
    if (targetRun) {
      targetRun.planReviewRequired = false;
      targetRun.status = "production_planned";
      targetRun.updatedAt = now;
      return targetRun;
    }
    project.planReviewRequired = false;
    project.status = "production_planned";
    project.updatedAt = now;
    syncCurrentRun(project);
    return project;
  });
}

export async function saveProductionPlan(
  projectId: string,
  productionConfig: ProductionConfig,
  highlightRecommendation: NonNullable<PipelineProject["highlightRecommendation"]>,
  prerollType?: PrerollType,
  sourceAssetIds: string[] = [],
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const requestedRun = runId
      ? project.runs?.find((run) => run.id === runId)
      : undefined;
    if (runId && !requestedRun) {
      throw new Error("生产设置所属生产批次不存在");
    }
    const targetRun =
      requestedRun?.id !== project.currentRunId
        ? requestedRun
        : undefined;
    const now = new Date().toISOString();
    if (targetRun) {
      targetRun.productionConfig = productionConfig;
      targetRun.highlightRecommendation = highlightRecommendation;
      if (prerollType) targetRun.prerollType = prerollType;
      if (sourceAssetIds.length > 0) {
        targetRun.sourceAssetIds = sourceAssetIds;
      }
      targetRun.updatedAt = now;
      return targetRun;
    }
    if (!project.currentRunId) {
      const planRunId = `run-plan-${projectId}`;
      project.currentRunId = planRunId;
      project.analysisSourceAssetIds = sourceAssetIds;
      project.status = "plan_saved";
      project.runs = [
        ...(project.runs ?? []),
        {
          id: planRunId,
          sequence: nextPipelineRunSequence(project.runs ?? []),
          projectId,
          sourceAssetIds,
          status: "plan_saved",
          characters: project.characters,
          arcs: [],
          highlights: [],
          scripts: [],
          renders: [],
          compositions: [],
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
    project.productionConfig = productionConfig;
    project.highlightRecommendation = highlightRecommendation;
    if (prerollType) project.prerollType = prerollType;
    project.updatedAt = now;
    syncCurrentRun(project);
    return project;
  });
}

export function applyNextProductionPlan(
  project: PipelineProject,
  productionConfig: ProductionConfig,
  highlightRecommendation: NonNullable<
    PipelineProject["highlightRecommendation"]
  >,
  prerollType?: PrerollType,
  sourceAssetIds: string[] = [],
  updatedAt = new Date().toISOString(),
) {
  const plan: ProductionPlanSnapshot = {
    productionConfig,
    highlightRecommendation,
    prerollType,
    sourceAssetIds,
    updatedAt,
  };
  project.productionPlans ??= {};
  project.productionPlans[
    productionConfig.productionEntry
  ] = plan;
  project.updatedAt = updatedAt;
  return plan;
}

export async function saveNextProductionPlan(
  projectId: string,
  productionConfig: ProductionConfig,
  highlightRecommendation: NonNullable<
    PipelineProject["highlightRecommendation"]
  >,
  prerollType?: PrerollType,
  sourceAssetIds: string[] = [],
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    return applyNextProductionPlan(
      project,
      productionConfig,
      highlightRecommendation,
      prerollType,
      sourceAssetIds,
    );
  });
}

export async function saveStoryArcs(
  projectId: string,
  arcs: StoryArc[],
  runId?: string,
  append = false,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const targetRun =
      runId && runId !== project.currentRunId
        ? project.runs?.find((run) => run.id === runId)
        : undefined;
    if (runId && runId !== project.currentRunId && !targetRun) {
      throw new Error("故事线任务所属生产批次不存在");
    }
    const currentArcs = targetRun?.arcs ?? project.arcs;
    const ids = new Set(arcs.map((arc) => arc.id));
    const nextArcs = append
      ? [
          ...currentArcs.filter((arc) => !ids.has(arc.id)),
          ...arcs,
        ]
      : arcs;
    const now = new Date().toISOString();
    if (targetRun) {
      targetRun.arcs = nextArcs;
      targetRun.status = "arcs_ready";
      targetRun.updatedAt = now;
      return targetRun;
    }
    project.arcs = nextArcs;
    project.status = "arcs_ready";
    project.updatedAt = now;
    syncCurrentRun(project);
    return project;
  });
}

export async function upsertHighlight(
  projectId: string,
  highlight: Omit<HighlightVariant, "projectId" | "createdAt" | "updatedAt">,
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const now = new Date().toISOString();
    const targetRun =
      runId && runId !== project.currentRunId
        ? project.runs?.find((run) => run.id === runId)
        : undefined;
    if (runId && runId !== project.currentRunId && !targetRun) {
      throw new Error("高光任务所属生产批次不存在");
    }
    const highlights = targetRun?.highlights ?? project.highlights;
    const current = highlights.find((item) => item.id === highlight.id);
    if (current) {
      Object.assign(current, highlight, { updatedAt: now });
      if (targetRun) {
        targetRun.updatedAt = now;
        return current;
      }
      project.updatedAt = now;
      syncCurrentRun(project);
      return current;
    }
    const next: HighlightVariant = {
      ...highlight,
      projectId,
      createdAt: now,
      updatedAt: now,
    };
    highlights.push(next);
    if (targetRun) {
      targetRun.updatedAt = now;
      return next;
    }
    project.updatedAt = now;
    syncCurrentRun(project);
    return next;
  });
}

export async function saveTransitionAnchor(
  projectId: string,
  highlightId: string,
  anchor: TransitionAnchor,
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const targetRun =
      runId && runId !== project.currentRunId
        ? project.runs?.find((run) => run.id === runId)
        : undefined;
    if (runId && runId !== project.currentRunId && !targetRun) {
      throw new Error("高光任务所属生产批次不存在");
    }
    const highlight = (
      targetRun?.highlights ?? project.highlights
    ).find((item) => item.id === highlightId);
    if (!highlight) throw new Error("高光版本不存在");
    highlight.anchor = anchor;
    highlight.updatedAt = new Date().toISOString();
    if (targetRun) {
      targetRun.updatedAt = highlight.updatedAt;
    } else {
      project.updatedAt = highlight.updatedAt;
      syncCurrentRun(project);
    }
    return highlight;
  });
}

export async function saveScripts(
  projectId: string,
  scripts: ScriptVariant[],
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const targetRun =
      runId && runId !== project.currentRunId
        ? project.runs?.find((run) => run.id === runId)
        : undefined;
    if (runId && runId !== project.currentRunId && !targetRun) {
      throw new Error("脚本任务所属生产批次不存在");
    }
    const currentScripts = targetRun?.scripts ?? project.scripts;
    const ids = new Set(scripts.map((item) => item.id));
    const nextScripts = [
      ...currentScripts.filter((item) => !ids.has(item.id)),
      ...scripts,
    ];
    const now = new Date().toISOString();
    if (targetRun) {
      targetRun.scripts = nextScripts;
      targetRun.status = "scripts_ready";
      targetRun.updatedAt = now;
      return targetRun.scripts;
    }
    project.scripts = nextScripts;
    project.status = "scripts_ready";
    project.updatedAt = now;
    syncCurrentRun(project);
    return project.scripts;
  });
}

function shotDuration(time: string) {
  const values = time.match(/\d+(?:\.\d+)?/g);
  if (!values?.length) return 0;
  if (values.length === 1) return Number(values[0]);
  return Math.max(0, Number(values[1]) - Number(values[0]));
}

export async function updateScript(
  projectId: string,
  scriptId: string,
  patch: Pick<
    ScriptVariant,
    | "title"
    | "duration"
    | "hookTitleCard"
    | "voiceover"
    | "transition"
    | "shots"
  >,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const script = project.scripts.find((item) => item.id === scriptId);
    if (!script) throw new Error("前贴脚本不存在");
    Object.assign(script, patch, {
      voWordcount: patch.voiceover.replace(/\s/g, "").length,
      aiSegmentSec: patch.shots
        .filter((shot) => shot.segmentType !== "original_footage")
        .reduce(
          (total, shot) => total + shotDuration(shot.time),
          0,
        ),
      originalFootageSec: patch.shots
        .filter((shot) => shot.segmentType === "original_footage")
        .reduce(
          (total, shot) => total + shotDuration(shot.time),
          0,
        ),
      videoPrompt: "",
      videoPromptStatus: "stale",
      videoPromptSourceHash: undefined,
      videoPromptCompiledAt: undefined,
      videoPromptPlan: undefined,
      updatedAt: new Date().toISOString(),
    });
    project.updatedAt = script.updatedAt;
    syncCurrentRun(project);
    return script;
  });
}

export async function markScriptPrerollOpened(
  projectId: string,
  scriptId: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const script = project.scripts.find(
      (item) => item.id === scriptId,
    );
    if (!script) throw new Error("前贴脚本不存在");
    const openedAt = new Date().toISOString();
    script.prerollOpenedAt = openedAt;
    project.updatedAt = openedAt;
    syncCurrentRun(project);
    return script;
  });
}

export async function saveCompiledVideoPrompt(
  projectId: string,
  scriptId: string,
  plan: VideoPromptPlan,
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const targetRun =
      runId && runId !== project.currentRunId
        ? project.runs?.find((run) => run.id === runId)
        : undefined;
    if (runId && runId !== project.currentRunId && !targetRun) {
      throw new Error("前贴任务所属生产批次不存在");
    }
    const script = (targetRun?.scripts ?? project.scripts).find(
      (item) => item.id === scriptId,
    );
    if (!script) throw new Error("前贴脚本不存在");
    const now = new Date().toISOString();
    script.videoPromptPlan = {
      ...plan,
      reviewStatus: "draft",
      confirmedAt: undefined,
    };
    script.videoPrompt = plan.segments
      .map(
        (segment) =>
          segment.submittedPrompt ?? segment.prompt,
      )
      .join("\n\n");
    script.videoPromptStatus = "ready";
    script.videoPromptSourceHash =
      plan.sourceRevision;
    script.videoPromptCompiledAt = now;
    script.updatedAt = now;
    if (targetRun) {
      targetRun.updatedAt = now;
    } else {
      project.updatedAt = now;
      syncCurrentRun(project);
    }
    return script;
  });
}

export async function saveEditedVideoPrompt(
  projectId: string,
  scriptId: string,
  input: {
    segments: Array<{
      index: number;
      submittedPrompt: string;
    }>;
    referenceBindings: NonNullable<
      VideoPromptPlan["referenceBindings"]
    >;
    referenceUrls: string[];
    generationSettings?: {
      targetDuration: number;
      videoModel: ProductionConfig["videoModel"];
      videoResolution: ProductionConfig["videoResolution"];
      videoRatio: ProductionConfig["videoRatio"];
      generateSubtitles: boolean;
    };
  },
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const script = project.scripts.find(
      (item) => item.id === scriptId,
    );
    const plan = script?.videoPromptPlan;
    if (!script || !plan) {
      throw new Error("生视频提示词不存在");
    }
    if (
      input.segments.length !== plan.segments.length ||
      input.segments.some(
        (segment, index) =>
          segment.index !== index ||
          !segment.submittedPrompt.trim(),
      )
    ) {
      throw new Error("生视频提示词分段与当前版本不一致");
    }
    const now = new Date().toISOString();
    plan.segments = plan.segments.map((segment, index) => ({
      ...segment,
      submittedPrompt:
        input.segments[index].submittedPrompt.trim(),
      referenceAssets: [...new Set(input.referenceUrls)],
    }));
    plan.referenceBindings = input.referenceBindings;
    if (input.generationSettings) {
      plan.targetModel = input.generationSettings.videoModel;
      plan.targetDuration = input.generationSettings.targetDuration;
      plan.resolution =
        input.generationSettings.videoResolution;
      plan.aspectRatio = input.generationSettings.videoRatio;
      plan.generateSubtitles =
        input.generationSettings.generateSubtitles;
      plan.maxClipDurationSec = videoGenerationSegmentLimit(
        input.generationSettings.videoModel,
      );
    }
    plan.reviewStatus = "confirmed";
    plan.editedAt = now;
    plan.confirmedAt = now;
    script.videoPrompt = plan.segments
      .map((segment) => segment.submittedPrompt)
      .join("\n\n");
    script.videoPromptStatus = "ready";
    script.updatedAt = now;
    project.updatedAt = now;
    syncCurrentRun(project);
    return script;
  });
}

export async function deleteScript(
  projectId: string,
  scriptId: string,
) {
  const [script] = await deleteScripts(projectId, [scriptId]);
  return script;
}

export async function deleteScripts(
  projectId: string,
  scriptIds: string[],
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const uniqueIds = [...new Set(scriptIds)];
    const selected = project.scripts.filter(
      (item) => uniqueIds.includes(item.id),
    );
    if (selected.length !== uniqueIds.length) {
      throw new Error("所选前贴脚本不存在");
    }
    if (selected.some((script) => script.reviewStatus === "confirmed")) {
      throw new Error("已确认脚本不能删除");
    }
    const selectedIds = new Set(uniqueIds);
    project.scripts = project.scripts.filter(
      (item) => !selectedIds.has(item.id),
    );
    project.updatedAt = new Date().toISOString();
    syncCurrentRun(project);
    return selected;
  });
}

export async function confirmScripts(
  projectId: string,
  scriptIds: string[],
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const targetRun =
      runId && runId !== project.currentRunId
        ? project.runs?.find((run) => run.id === runId)
        : undefined;
    if (runId && runId !== project.currentRunId && !targetRun) {
      throw new Error("脚本任务所属生产批次不存在");
    }
    const scripts = targetRun?.scripts ?? project.scripts;
    const selected = scripts.filter((item) =>
      scriptIds.includes(item.id),
    );
    if (selected.length !== new Set(scriptIds).size) {
      throw new Error("所选前贴脚本不存在");
    }
    if (selected.some((script) => script.reviewStatus === "confirmed")) {
      throw new Error("所选脚本中包含已确认版本");
    }
    const now = new Date().toISOString();
    for (const script of selected) {
      script.reviewStatus = "confirmed";
      script.updatedAt = now;
    }
    if (targetRun) {
      targetRun.status = "scripts_confirmed";
      targetRun.updatedAt = now;
    } else {
      project.status = "scripts_confirmed";
      project.updatedAt = now;
      syncCurrentRun(project);
    }
    return selected;
  });
}

export async function upsertRender(
  projectId: string,
  render: Omit<RenderVariant, "projectId" | "createdAt" | "updatedAt">,
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const now = new Date().toISOString();
    const targetRun =
      runId && runId !== project.currentRunId
        ? project.runs?.find((run) => run.id === runId)
        : undefined;
    if (runId && runId !== project.currentRunId && !targetRun) {
      throw new Error("前贴任务所属生产批次不存在");
    }
    const renders = targetRun?.renders ?? project.renders;
    const compositions =
      targetRun?.compositions ?? project.compositions;
    const current = renders.find(
      (item) => item.id === render.id,
    );
    if (current) {
      const previousVideoUrl = current.videoUrl;
      mergeRenderVersion(current, render, now);
      invalidateCompositionsForRenderVersion(
        compositions,
        current,
        previousVideoUrl,
        now,
      );
      if (targetRun) {
        targetRun.updatedAt = now;
      } else {
        project.updatedAt = now;
        syncCurrentRun(project);
      }
      return current;
    }
    const next: RenderVariant = {
      ...render,
      projectId,
      createdAt: now,
      updatedAt: now,
    };
    ensureRenderRevisionHistory(next);
    const retainedRenders = renders.filter(
      (item) => item.scriptId !== render.scriptId,
    );
    retainedRenders.push(next);
    if (targetRun) {
      targetRun.renders = retainedRenders;
      targetRun.updatedAt = now;
    } else {
      project.renders = retainedRenders;
      project.updatedAt = now;
      syncCurrentRun(project);
    }
    return next;
  });
}

export async function commitRenderRevision(
  projectId: string,
  input: {
    renderId: string;
    sourceVideoUrl: string;
    sourceRevisionId?: string;
    outputVideoUrl: string;
    operation: Exclude<
      RenderRevisionOperation,
      "generated" | "baseline"
    >;
    settings?: Record<string, unknown>;
    sourceJobId?: string;
    subtitleEraseConfig?: SubtitleEraseConfig;
    subtitleVerificationStatus?: "verified" | "failed";
    subtitleVerificationEvidence?: SubtitleVerificationEvidence;
  },
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const targetRun =
      runId && runId !== project.currentRunId
        ? project.runs?.find((run) => run.id === runId)
        : undefined;
    if (runId && runId !== project.currentRunId && !targetRun) {
      throw new Error("后期任务所属生产批次不存在");
    }
    const renders = targetRun?.renders ?? project.renders;
    const compositions =
      targetRun?.compositions ?? project.compositions;
    const render = renders.find(
      (item) => item.id === input.renderId,
    );
    if (!render?.videoUrl) {
      throw new Error("AI 前贴视频不存在");
    }
    ensureRenderRevisionHistory(render);
    if (
      render.videoUrl !== input.sourceVideoUrl ||
      (
        input.sourceRevisionId &&
        render.currentRevisionId !== input.sourceRevisionId
      )
    ) {
      throw new Error("AI 前贴视频版本已更新");
    }

    const now = new Date().toISOString();
    const previousVideoUrl = render.videoUrl;
    const inheritSubtitleVerification =
      input.operation === "enhance";
    appendRenderRevision(
      render,
      {
        id: `render-revision-${crypto.randomUUID()}`,
        videoUrl: input.outputVideoUrl,
        operation: input.operation,
        settings: input.settings,
        sourceJobId: input.sourceJobId,
        subtitleEraseConfig:
          input.subtitleEraseConfig ??
          render.subtitleEraseConfig,
        subtitleVerificationStatus:
          input.operation === "erase_subtitles"
            ? undefined
            : input.subtitleVerificationStatus ??
              (inheritSubtitleVerification
                ? render.subtitleVerificationStatus
                : undefined),
        subtitleVerificationEvidence:
          input.operation === "erase_subtitles"
            ? undefined
            : input.subtitleVerificationEvidence ??
              (inheritSubtitleVerification
                ? render.subtitleVerificationEvidence
                : undefined),
      },
      now,
    );
    render.status = "completed";
    invalidateCompositionsForRenderVersion(
      compositions,
      render,
      previousVideoUrl,
      now,
    );
    if (targetRun) {
      targetRun.updatedAt = now;
    } else {
      project.updatedAt = now;
      syncCurrentRun(project);
    }
    return render;
  });
}

export async function activateRenderRevision(
  projectId: string,
  input: {
    renderId: string;
    revisionId: string;
    expectedVideoUrl: string;
  },
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const render = project.renders.find(
      (item) => item.id === input.renderId,
    );
    if (!render?.videoUrl) {
      throw new Error("AI 前贴视频不存在");
    }
    if (render.videoUrl !== input.expectedVideoUrl) {
      throw new Error("AI 前贴视频版本已更新");
    }

    const now = new Date().toISOString();
    const previousVideoUrl = render.videoUrl;
    activateRenderRevisionState(
      render,
      input.revisionId,
      now,
    );
    invalidateCompositionsForRenderVersion(
      project.compositions,
      render,
      previousVideoUrl,
      now,
    );
    project.updatedAt = now;
    syncCurrentRun(project);
    return render;
  });
}

export async function upsertComposition(
  projectId: string,
  composition: Omit<Composition, "projectId" | "createdAt" | "updatedAt">,
  runId?: string,
) {
  return mutate((data) => {
    const project = ensureProject(data, projectId);
    const now = new Date().toISOString();
    const targetRun = runId
      ? project.runs?.find((run) => run.id === runId)
      : undefined;
    if (runId && !targetRun) {
      throw new Error("合成任务所属生产批次不存在");
    }
    const writesCurrentRun =
      !targetRun || targetRun.id === project.currentRunId;
    const renders = writesCurrentRun
      ? project.renders
      : targetRun.renders;
    const compositions = writesCurrentRun
      ? project.compositions
      : targetRun.compositions;
    const render = renders.find(
      (item) => item.id === composition.renderId,
    );
    const nextComposition = resolveCompositionVersion(
      composition,
      render,
    );
    const current = compositions.find(
      (item) => item.id === composition.id,
    );
    if (current) {
      Object.assign(current, nextComposition, { updatedAt: now });
      if (writesCurrentRun) {
        project.status =
          nextComposition.status === "completed"
            ? "completed"
            : "composing";
        project.updatedAt = now;
        syncCurrentRun(project);
      } else {
        targetRun.status =
          nextComposition.status === "completed"
            ? "completed"
            : "composing";
        targetRun.updatedAt = now;
      }
      return current;
    }
    const next: Composition = {
      ...nextComposition,
      projectId,
      createdAt: now,
      updatedAt: now,
    };
    compositions.push(next);
    if (writesCurrentRun) {
      project.status =
        nextComposition.status === "completed"
          ? "completed"
          : "composing";
      project.updatedAt = now;
      syncCurrentRun(project);
    } else {
      targetRun.status =
        nextComposition.status === "completed"
          ? "completed"
          : "composing";
      targetRun.updatedAt = now;
    }
    return next;
  });
}
