import { describe, expect, it } from "vitest";

import {
  buildSharedStoryContext,
  compactSharedStoryContext,
  mergeHighlightAnalyses,
} from "@/lib/highlight-analysis";
import type { HighlightAnalysis } from "@/lib/pipeline-store";

function analysis(
  assetId: string,
  highlightId: string,
  title: string,
): HighlightAnalysis {
  return {
    sourceHighlightAssetId: assetId,
    highlightId,
    sourceName: `${title}.mp4`,
    sourceVideoUrl: `https://example.com/${assetId}.mp4`,
    analysis: {
      duration: 10,
      sourceVideoInfo: [{
        index: 0,
        url: `https://example.com/${assetId}.mp4`,
        title,
        summary: `${title}剧情`,
        tags: ["逆袭"],
      }],
      clips: [{
        index: 0,
        sourceVideoIndex: 0,
        title: `${title}片段`,
        summary: `${title}证据`,
        dialogue: "",
        score: 90,
        start: 0,
        end: 10,
      }],
      highlights: [{
        index: 0,
        title,
        summary: `${title}剧情`,
        clipIndexes: [0],
      }],
    },
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  };
}

describe("isolated highlight analysis", () => {
  it("builds shared context without merging local evidence clips", () => {
    const result = buildSharedStoryContext([
      analysis("asset-a", "highlight-a", "高光 A"),
      analysis("asset-b", "highlight-b", "高光 B"),
    ], "2026-08-27T01:00:00.000Z");

    expect(result.sourceHighlightAssetIds).toEqual([
      "asset-a",
      "asset-b",
    ]);
    expect(result.sourceVideoInfo).toEqual([
      expect.objectContaining({
        sourceHighlightAssetId: "asset-a",
        highlightId: "highlight-a",
        title: "高光 A.mp4",
      }),
      expect.objectContaining({
        sourceHighlightAssetId: "asset-b",
        highlightId: "highlight-b",
        title: "高光 B.mp4",
      }),
    ]);
    expect(result).not.toHaveProperty("clips");
    expect(result.summary).not.toContain("高光 A剧情");
    expect(result.summary).not.toContain("高光 B剧情");
  });

  it("removes per-highlight audit summaries from model context", () => {
    const context = buildSharedStoryContext([
      analysis("asset-a", "highlight-a", "高光 A"),
      analysis("asset-b", "highlight-b", "高光 B"),
    ]);

    const compact = compactSharedStoryContext(context);

    expect(compact).not.toHaveProperty("sourceVideoInfo");
    expect(compact).not.toHaveProperty(
      "sourceHighlightAssetIds",
    );
    expect(JSON.stringify(compact)).not.toContain("高光 A剧情");
    expect(JSON.stringify(compact)).not.toContain("高光 B剧情");
  });

  it("merges analyses only for legacy display with unique provenance", () => {
    const result = mergeHighlightAnalyses([
      analysis("asset-a", "highlight-a", "高光 A"),
      analysis("asset-b", "highlight-b", "高光 B"),
    ]);

    expect(result.clips.map((clip) => clip.index)).toEqual([0, 1]);
    expect(
      result.sourceVideoInfo.map((source) => source.title),
    ).toEqual(["高光 A.mp4", "高光 B.mp4"]);
    expect(
      result.clips.map((clip) => clip.sourceVideoIndex),
    ).toEqual([0, 1]);
    expect(result.highlights.map((item) => item.clipIndexes)).toEqual([
      [0],
      [1],
    ]);
  });
});
