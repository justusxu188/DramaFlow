import { describe, expect, it } from "vitest";

import {
  highlightNavigationTitle,
  type PipelineHighlightAsset,
} from "@/components/pipeline-highlight-name";
import type { PipelineData } from "@/components/pipeline-workspace-types";

function highlight(
  id: string,
  videoUrl: string,
) {
  return {
    id,
    result: { videoUrls: [videoUrl] },
  } as PipelineData["highlights"][number];
}

describe("highlightNavigationTitle", () => {
  it("uses the original filename without a prefix for user uploads", () => {
    const assets: PipelineHighlightAsset[] = [{
      id: "asset-1",
      name: "3.mp4",
      sourceUrl: "https://example.com/3.mp4",
      metadata: { sourceType: "user" },
    }];

    expect(highlightNavigationTitle(
      highlight(
        "highlight-upload-asset-1",
        "https://example.com/3.mp4",
      ),
      assets,
      "故事线标题",
      0,
    )).toBe("3.mp4");
  });

  it("keeps the numbered naming mode for MediaKit highlights", () => {
    const assets: PipelineHighlightAsset[] = [{
      id: "asset-2",
      name: "身份反转",
      sourceUrl: "https://example.com/highlight.mp4",
      metadata: { sourceType: "mediakit" },
    }];

    expect(highlightNavigationTitle(
      highlight(
        "highlight-2",
        "https://example.com/highlight.mp4",
      ),
      assets,
      "故事线标题",
      1,
    )).toBe("高光 2 · 身份反转");
  });

  it("keeps the numbered fallback for generated highlights", () => {
    expect(highlightNavigationTitle(
      highlight(
        "highlight-3",
        "https://example.com/generated.mp4",
      ),
      [],
      "故事线标题",
      2,
    )).toBe("高光 3 · 故事线标题");
  });
});
