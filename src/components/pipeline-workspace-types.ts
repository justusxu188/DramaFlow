import type { PrerollType } from "@/lib/domain";
import type { ProductionConfig } from "@/lib/production-config";

export type PipelineJob = {
  id: string;
  runId?: string;
  kind: string;
  status: string;
  progress: number;
  error?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

export type FeaturedAsset = {
  id: string;
  kind: "highlight" | "preroll_video" | "final_video";
  sourceArtifactId: string;
};

export type PipelineAnalysis = {
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

export type PipelineData = {
  status: string;
  currentRunId?: string;
  currentRunCreatedAt?: string;
  runs?: Array<{
    id: string;
    sequence?: number;
    status: string;
    createdAt: string;
    updatedAt: string;
    sourceAssetCount: number;
  }>;
  prerollType?: PrerollType;
  planReviewRequired?: boolean;
  analysisSourceAssetIds?: string[];
  analysis?: PipelineAnalysis;
  highlightAnalyses?: Array<{
    sourceHighlightAssetId: string;
    highlightId: string;
    sourceName: string;
    sourceVideoUrl: string;
    analysis: PipelineAnalysis;
    reusedFromRunId?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  sharedStoryContext?: {
    sourceHighlightAssetIds: string[];
    summary: string;
    tags: string[];
    updatedAt: string;
  };
  characters: Array<{
    id: string;
    name: string;
    role: string;
    aliases: string[];
    status: "candidate" | "confirmed" | "unknown";
    appearances: Array<{
      id: string;
      clipIndex: number;
      sourceVideoIndex: number;
      timestamp: number;
      imageUrl: string;
    }>;
    primaryAppearanceId?: string;
    referenceAssetIds: string[];
    confirmedAt?: string;
    updatedAt: string;
  }>;
  arcs: Array<{
    id: string;
    sourceHighlightAssetId?: string;
    highlightId?: string;
    title: string;
    pitch: string;
    payoffType: string;
    scores: {
      relevance: number;
      visuality: number;
      novelty: number;
      risk: number;
    };
  }>;
  highlights: Array<{
    id: string;
    proposalId?: string;
    arcId: string;
    status: string;
    result?: {
      videoUrls: string[];
      variants: Array<{ duration: number }>;
    };
    anchor?: {
      openingSummary: string;
      recommendedTransition: string;
      visualStyle?: {
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
    };
  }>;
  scripts: Array<{
    id: string;
    arcId: string;
    highlightId: string;
    prerollType?: PrerollType;
    title: string;
    fitDirection?: string;
    coreHook?: string;
    assumptions?: string[];
    scriptVersion?: string;
    conceptId?: string;
    mode?: string;
    hookParadigm?: string;
    prepatchType?: string;
    audienceGenre?: string;
    voSpeed?: string;
    voWordcount?: number;
    hookTitleCard?: string;
    duration: number;
    aiSegmentSec?: number;
    voiceover: string;
    transition: string;
    createdAt?: string;
    updatedAt?: string;
    prerollOpenedAt?: string;
    reviewStatus?: "draft" | "confirmed";
    videoPrompt: string;
    videoPromptStatus?:
      | "pending"
      | "compiling"
      | "ready"
      | "stale"
      | "failed";
    videoPromptCompiledAt?: string;
    videoPromptPlan?: {
      systemPromptHash?: string;
      generateSubtitles?: boolean;
      targetModel?: ProductionConfig["videoModel"];
      targetDuration?: number;
      resolution?: ProductionConfig["videoResolution"];
      aspectRatio?: ProductionConfig["videoRatio"];
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
      missingInformation: string[];
      originalFootageNote?: string;
      mainfilmHandoffPrompt?: string;
      segments: Array<{
        index: number;
        clipId?: string;
        sourceBeats?: string[];
        duration: number;
        referenceAssets: string[];
        prompt: string;
        submittedPrompt?: string;
        sound: string;
      }>;
    };
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
  }>;
  renders: Array<{
    id: string;
    scriptId: string;
    status: string;
    sourceJobId?: string;
    videoUrl?: string;
    currentRevisionId?: string;
    revisions?: Array<{
      id: string;
      parentRevisionId?: string;
      videoUrl: string;
      operation:
        | "generated"
        | "baseline"
        | "erase_subtitles"
        | "add_subtitles"
        | "enhance";
      settings?: Record<string, unknown>;
      sourceJobId?: string;
      subtitleEraseConfig?: {
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
      subtitleVerificationStatus?: "verified" | "failed";
      createdAt: string;
    }>;
    processedOperation?:
      | "erase_subtitles"
      | "add_subtitles"
      | "enhance";
    subtitleEraseConfig?: {
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
    subtitleVerificationStatus?: "verified" | "failed";
    createdAt: string;
    updatedAt?: string;
  }>;
  compositions: Array<{
    id: string;
    renderId: string;
    highlightId?: string;
    status: string;
    videoUrl?: string;
    objectKey?: string;
    originalVideoUrl?: string;
    processedOperation?:
      | "image_watermark"
      | "text_watermark";
    watermarkText?: string;
    sourceRenderVideoUrl?: string;
    sourceRenderSubtitleVerified?: boolean;
    createdAt: string;
    updatedAt?: string;
  }>;
  productionConfig?: ProductionConfig;
  nextProductionPlan?: {
    productionConfig: ProductionConfig;
    prerollType?: PrerollType;
    sourceAssetIds: string[];
    updatedAt: string;
  };
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
};

export type CharacterImageAsset = {
  id: string;
  name: string;
  sourceUrl: string;
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
    sourceCaptureAssetId?: string;
    referenceType: "primary" | "appearance";
    avatarAssetId?: string;
    avatarStatus?: "processing" | "active" | "failed";
    avatarError?: string;
    avatarUpdatedAt?: string;
  };
};

export type PipelineArc = PipelineData["arcs"][number];
export type PipelineHighlight = PipelineData["highlights"][number];
export type PipelineScript = PipelineData["scripts"][number];
export type PipelineRender = PipelineData["renders"][number];
export type PipelineComposition = PipelineData["compositions"][number];
