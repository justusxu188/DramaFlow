import type {
  HighlightAnalysis,
  SharedStoryContext,
} from "@/lib/pipeline-store";
import type { MediaUnderstanding } from "@/lib/media-understanding";
import type { StorylineResult } from "@/lib/providers/types";

export function buildSharedStoryContext(
  analyses: HighlightAnalysis[],
  backgroundAnalysesOrUpdatedAt: MediaUnderstanding[] | string = [],
  explicitUpdatedAt?: string,
): SharedStoryContext {
  const backgroundAnalyses =
    typeof backgroundAnalysesOrUpdatedAt === "string"
      ? []
      : backgroundAnalysesOrUpdatedAt;
  const updatedAt =
    typeof backgroundAnalysesOrUpdatedAt === "string"
      ? backgroundAnalysesOrUpdatedAt
      : explicitUpdatedAt ?? new Date().toISOString();
  const sourceVideoInfo = analyses.map((entry) => {
    const source = entry.analysis.sourceVideoInfo[0];
    return {
      sourceHighlightAssetId: entry.sourceHighlightAssetId,
      highlightId: entry.highlightId,
      url: entry.sourceVideoUrl,
      title: entry.sourceName || source?.title || entry.highlightId,
      summary:
        source?.summary ||
        entry.analysis.highlights[0]?.summary ||
        "",
      tags: source?.tags ?? [],
    };
  });
  return {
    sourceHighlightAssetIds: analyses.map(
      (entry) => entry.sourceHighlightAssetId,
    ),
    backgroundSourceAssetIds: backgroundAnalyses.map(
      (entry) => entry.assetId,
    ),
    sourceVideoInfo,
    summary:
      backgroundAnalyses.length > 0
        ? "本批次高光是唯一剧情证据；关联原剧仅用于补充人物、关系、世界观和剧情因果背景。"
        : "同一部短剧的多个独立高光片段，共享上下文仅用于人物、关系、世界观和视觉风格。",
    tags: [...new Set(sourceVideoInfo.flatMap((source) => source.tags))],
    updatedAt,
  };
}

export function compactSharedStoryContext(
  context?: SharedStoryContext,
) {
  if (!context) return undefined;
  return {
    summary: context.summary,
    tags: context.tags,
    characters: context.characters,
    setting: context.setting,
    visualStyle: context.visualStyle,
  };
}

export function mergeHighlightAnalyses(
  analyses: HighlightAnalysis[],
): StorylineResult {
  let clipOffset = 0;
  const sourceVideoInfo: StorylineResult["sourceVideoInfo"] = [];
  const clips: StorylineResult["clips"] = [];
  const highlights: StorylineResult["highlights"] = [];

  analyses.forEach((entry, sourceVideoIndex) => {
    const source = entry.analysis.sourceVideoInfo[0];
    sourceVideoInfo.push({
      index: sourceVideoIndex,
      url: entry.sourceVideoUrl,
      title: entry.sourceName || source?.title || entry.highlightId,
      summary: source?.summary || "",
      tags: source?.tags ?? [],
    });
    const clipIndexMap = new Map<number, number>();
    entry.analysis.clips.forEach((clip) => {
      const index = clipOffset++;
      clipIndexMap.set(clip.index, index);
      clips.push({
        ...clip,
        index,
        sourceVideoIndex,
      });
    });
    entry.analysis.highlights.forEach((highlight) => {
      highlights.push({
        ...highlight,
        index: highlights.length,
        clipIndexes: highlight.clipIndexes
          .map((index) => clipIndexMap.get(index))
          .filter((index): index is number => index !== undefined),
      });
    });
  });

  return {
    duration: analyses.reduce(
      (total, entry) => total + entry.analysis.duration,
      0,
    ),
    sourceVideoInfo,
    clips,
    highlights,
  };
}
