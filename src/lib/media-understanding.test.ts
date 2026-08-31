import { describe, expect, it } from "vitest";
import {
  mediaAnalysisProfileHash,
  mediaAssetRevisionKey,
} from "./media-understanding";

describe("media understanding cache identity", () => {
  it("keeps the key stable for the same asset revision", () => {
    const input = {
      objectKey: "projects/p1/source/video.mp4",
      sourceUrl: "https://example.com/video.mp4",
      sizeBytes: 1024,
      durationMs: 12_000,
    };

    expect(mediaAssetRevisionKey(input)).toBe(
      mediaAssetRevisionKey(input),
    );
  });

  it("invalidates the key when the stored file changes", () => {
    const common = {
      objectKey: "projects/p1/source/video.mp4",
      sourceUrl: "https://example.com/video.mp4",
      durationMs: 12_000,
    };

    expect(
      mediaAssetRevisionKey({
        ...common,
        sizeBytes: 1024,
      }),
    ).not.toBe(
      mediaAssetRevisionKey({
        ...common,
        sizeBytes: 2048,
      }),
    );
  });

  it("separates snapshot and non-snapshot analysis profiles", () => {
    expect(
      mediaAnalysisProfileHash({ enableSnapshot: true }),
    ).not.toBe(
      mediaAnalysisProfileHash({ enableSnapshot: false }),
    );
  });
});
