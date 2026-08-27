import type {
  HighlightMode,
  HookType,
  JobStatus,
  PrerollType,
} from "@/lib/domain";
import type { ProductionConfig } from "@/lib/production-config";

export type StoryAnalysis = {
  synopsis: string;
  characters: Array<{ name: string; role: string; desire: string }>;
  conflict: string;
  emotionCurve: Array<{ at: number; level: number; label: string }>;
  highlights: Array<{
    title: string;
    start: number;
    end: number;
    score: number;
  }>;
};

export type ScriptDraft = {
  id: string;
  proposalId?: string;
  scriptVersion?: string;
  conceptId?: string;
  mode?: string;
  hookParadigm?: string;
  prepatchType?: string;
  audienceGenre?: string;
  title: string;
  fitDirection?: string;
  coreHook?: string;
  assumptions?: string[];
  hookType: HookType;
  prerollType: PrerollType;
  duration: number;
  aiSegmentSec?: number;
  originalFootageSec?: number;
  creativeTheme?: string;
  watchMotivation?: string;
  voTone?: string;
  voSpeed?: string;
  voWordcount?: number;
  hookTitleCard?: string;
  bridgeBeatId?: string;
  bridgeType?: string;
  endingCutoff?: string;
  mainfilmEntry?: string;
  selfCheck?: string[];
  voiceover: string;
  transition: string;
  shots: Array<{
    beatId?: string;
    time: string;
    segmentType?: "ai_generated" | "original_footage";
    beatRole?: string;
    hookRef?: string;
    framing: string;
    visual: string;
    dynamicChange?: string;
    visualContrast?: string;
    characterAction?: string;
    shotSize?: string;
    cameraMove?: string;
    voiceover?: string;
    dialogueSpeaker?: string;
    dialogue: string;
    subtitle?: string;
    sceneCaption?: string;
    sound?: string;
    startState?: string;
    endState?: string;
    cutToNext?: string;
    characters?: string[];
    scene?: string;
    keyProps?: string[];
    editingRhythm?: string;
    purpose?: string;
  }>;
};

export type VideoScriptSegment = {
  index: number;
  duration: number;
  shotIndexes: number[];
  shotDurations: number[];
  shots: ScriptDraft["shots"];
};

export type AsyncTask = {
  id: string;
  status: JobStatus;
  progress: number;
  videoUrl?: string;
  result?: unknown;
  error?: string;
};

export type StorylineResult = {
  duration: number;
  sourceVideoInfo: Array<{
    index: number;
    url: string;
    title: string;
    summary: string;
    tags: string[];
  }>;
  clips: Array<{
    index: number;
    sourceVideoIndex: number;
    title: string;
    summary: string;
    dialogue: string;
    score: number;
    start: number;
    end: number;
    snapshotUrl?: string;
  }>;
  highlights: Array<{
    index: number;
    title: string;
    summary: string;
    clipIndexes: number[];
  }>;
};

export type HighlightResult = {
  duration: number;
  videoUrls: string[];
  variants: Array<{
    index: number;
    duration: number;
    size: number;
    videoUrl: string;
    posterUrl?: string;
    clips: Array<{
      type: string;
      score: number;
      sourceVideoIndex: number;
      sourceStart: number;
      sourceEnd: number;
      cutStart: number;
      cutEnd: number;
      tags: string[];
    }>;
  }>;
  storyboard: Array<{
    sourceVideoIndex: number;
    start: number;
    end: number;
    score: number;
    ocr: string;
    description: string;
    tags: string[];
  }>;
};

export type HighlightGenerationSettings = {
  minDuration: number;
  maxDuration: number;
  maxNumber: number;
  cutMode: "Mixed" | "Sequential";
  segmentPrompt: string;
  startPrompt: string;
  endingPrompt: string;
  enableOpeningHook: boolean;
  openingHookMinDuration: number;
  openingHookMaxDuration: number;
  openingHookMinScore: number;
  openingHookPrompt: string;
  template: string;
  hint: string;
};

export interface CreativeProvider {
  analyzeStory(input: { videoUrl: string }): Promise<StoryAnalysis>;
  analyzeStoryline(input: {
    videoUrls: string[];
    clientToken: string;
    enableSnapshot?: boolean;
  }): Promise<AsyncTask>;
  restoreDramaScript(input: {
    videoUrls: string[];
    clientToken: string;
  }): Promise<AsyncTask>;
  generateScripts(input: {
    analysis: StoryAnalysis;
    hookType: HookType;
    prerollType: PrerollType;
    count: number;
  }): Promise<ScriptDraft[]>;
  generateImage(input: {
    prompt: string;
    size: string;
    referenceUrls?: string[];
    model?: "seedream_5_0_lite" | "seedream_5_0_pro";
  }): Promise<{ urls: string[]; size: string }>;
  extractFrames(input: {
    videoUrl: string;
    timestamps: number[];
    clientToken: string;
  }): Promise<AsyncTask>;
  createPreroll(input: {
    prompt: string;
    duration: number;
    ratio: string;
    referenceUrls?: string[];
    model: ProductionConfig["videoModel"];
    resolution: ProductionConfig["videoResolution"];
  }): Promise<AsyncTask>;
  getPrerollTask(id: string): Promise<AsyncTask>;
  segmentScenes(input: { videoUrl: string }): Promise<AsyncTask>;
  createHighlight(input: {
    videoUrls: string[];
    mode: HighlightMode;
    title?: string;
    prompt?: string;
    clientToken?: string;
    settings?: HighlightGenerationSettings;
  }): Promise<AsyncTask>;
  getMediaTask(id: string): Promise<AsyncTask>;
  trimVideo(input: {
    videoUrl: string;
    startTime: number;
    endTime: number;
  }): Promise<AsyncTask>;
  concatVideos(input: {
    videoUrls: string[];
    transitions?: string[];
    clientToken: string;
  }): Promise<AsyncTask>;
}
