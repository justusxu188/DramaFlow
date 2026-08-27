import { describe, expect, it } from "vitest";
import {
  imageSizes,
  normalizeProviderStatus,
  pipelineInputSchema,
  pipelineStages,
  projectInputSchema,
  sourceAssetInputSchema,
} from "./domain";

describe("domain contracts", () => {
  it("keeps the seven production stages in dependency order", () => {
    expect(pipelineStages).toEqual([
      "source",
      "analysis",
      "strategy",
      "script",
      "preroll",
      "highlight",
      "compose",
    ]);
  });

  it("validates pipeline controls", () => {
    const result = pipelineInputSchema.parse({
      stage: "script",
      hookType: "identity_gap",
      prerollType: "story_linked",
      duration: 18,
    });
    expect(result.duration).toBe(18);
  });

  it("maps upstream states to product states", () => {
    expect(normalizeProviderStatus("succeeded")).toBe("completed");
    expect(normalizeProviderStatus("processing")).toBe("running");
    expect(normalizeProviderStatus("unexpected")).toBe("failed");
  });

  it("uses official Seedream dimensions", () => {
    expect(imageSizes["2K"]["9:16"]).toBe("1600x2848");
    expect(imageSizes["4K"]["16:9"]).toBe("5504x3040");
  });

  it("allows creating a project before uploading source videos", () => {
    expect(projectInputSchema.parse({
      name: "新短剧",
      genre: "都市",
    }).episodeCount).toBe(0);
  });

  it("validates episode and full-drama source assets", () => {
    expect(sourceAssetInputSchema.parse({
      uploadMode: "episodes",
      name: "第01集.mp4",
      objectKey: "AIGCAdv/project/episode-01.mp4",
      sourceUrl: "https://example.com/episode-01.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1024,
      durationMs: 60000,
      episodeNumber: 1,
    }).episodeNumber).toBe(1);

    expect(sourceAssetInputSchema.safeParse({
      uploadMode: "full",
      name: "整剧.mp4",
      objectKey: "AIGCAdv/project/full.mp4",
      sourceUrl: "https://example.com/full.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1024,
      durationMs: 60000,
      episodeNumber: 1,
    }).success).toBe(false);
  });
});
