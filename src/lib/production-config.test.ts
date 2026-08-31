import { describe, expect, it } from "vitest";
import {
  allocateHighlightOutputs,
  defaultProductionConfig,
  highlightDurationRange,
  normalizeProductionConfig,
  productionConfigSchema,
  recommendHighlightSettings,
} from "./production-config";

describe("highlight parameter recommendations", () => {
  it("uses the requested subtitle defaults", () => {
    expect(defaultProductionConfig).toMatchObject({
      subtitleFontSize: 52,
      subtitlePosition: "bottom_center",
    });
  });

  it("distributes the global highlight total across story arcs", () => {
    expect(allocateHighlightOutputs(3, 3)).toEqual([1, 1, 1]);
    expect(allocateHighlightOutputs(8, 3)).toEqual([3, 3, 2]);
    expect(allocateHighlightOutputs(2, 3)).toEqual([1, 1]);
  });

  it("normalizes the requested script duration range", () => {
    expect(normalizeProductionConfig({
      ...defaultProductionConfig,
      scriptDurationMin: 20,
      scriptDurationMax: 45,
    })).toMatchObject({
      scriptDurationMin: 20,
      scriptDurationMax: 45,
    });
  });

  it("normalizes preroll video model, resolution, and ratio", () => {
    expect(normalizeProductionConfig({
      ...defaultProductionConfig,
      videoModel: "seedance_2_0_fast",
      generateSubtitles: true,
      videoResolution: "1080p",
      videoRatio: "21:9",
    })).toMatchObject({
      videoModel: "seedance_2_0_fast",
      generateSubtitles: true,
      videoResolution: "1080p",
      videoRatio: "21:9",
    });
  });

  it("normalizes legacy uppercase video resolutions", () => {
    expect(normalizeProductionConfig({
      ...defaultProductionConfig,
      videoResolution: "1080P" as never,
    }).videoResolution).toBe("1080p");
    expect(productionConfigSchema.parse({
      ...defaultProductionConfig,
      videoResolution: "720P",
    }).videoResolution).toBe("720p");
  });

  it("normalizes an omitted highlight hint without displaying 无", () => {
    expect(normalizeProductionConfig({
      ...defaultProductionConfig,
      highlightHint: "无",
    }).highlightHint).toBe("");
    expect(normalizeProductionConfig({
      ...defaultProductionConfig,
      highlightHint: "  ",
    }).highlightHint).toBe("");
    expect(productionConfigSchema.parse({
      ...defaultProductionConfig,
      highlightHint: "",
    }).highlightHint).toBe("");
  });

  it("accepts an older production plan without video fields", () => {
    const {
      productionEntry: _productionEntry,
      executionMode: _executionMode,
      selectedHighlightAssetIds:
        _selectedHighlightAssetIds,
      videoModel: _videoModel,
      generateSubtitles: _generateSubtitles,
      videoResolution: _videoResolution,
      videoRatio: _videoRatio,
      ...olderPlan
    } = defaultProductionConfig;

    expect(productionConfigSchema.parse(olderPlan)).toMatchObject({
      productionEntry: "full_drama",
      executionMode: "manual",
      selectedHighlightAssetIds: [],
      videoModel: "default",
      generateSubtitles: false,
      videoResolution: "720p",
      videoRatio: "9:16",
    });
  });

  it("normalizes production entry and selected highlights", () => {
    expect(normalizeProductionConfig({
      ...defaultProductionConfig,
      productionEntry: "uploaded_highlights",
      executionMode: "agent",
      selectedHighlightAssetIds: [
        "highlight-1",
        "highlight-1",
        "highlight-2",
      ],
    })).toMatchObject({
      productionEntry: "uploaded_highlights",
      executionMode: "agent",
      selectedHighlightAssetIds: [
        "highlight-1",
        "highlight-2",
      ],
    });
  });

  it("defaults historical uploaded-highlight plans to highlights only", () => {
    const normalized = normalizeProductionConfig({
      ...defaultProductionConfig,
      productionEntry: "uploaded_highlights",
      storyContextMode: undefined,
      selectedOriginalContextAssetIds: undefined,
    });

    expect(normalized).toMatchObject({
      storyContextMode: "highlights_only",
      selectedOriginalContextAssetIds: [],
    });
  });

  it("deduplicates explicit original background selections", () => {
    const normalized = normalizeProductionConfig({
      ...defaultProductionConfig,
      productionEntry: "uploaded_highlights",
      storyContextMode:
        "highlights_with_originals",
      selectedOriginalContextAssetIds: [
        "source-1",
        "source-1",
        "source-2",
      ],
    });

    expect(normalized.selectedOriginalContextAssetIds).toEqual([
      "source-1",
      "source-2",
    ]);
  });

  it("clears original selections when background context is disabled", () => {
    const normalized = normalizeProductionConfig({
      ...defaultProductionConfig,
      storyContextMode: "highlights_only",
      selectedOriginalContextAssetIds: ["source-1"],
    });

    expect(normalized.selectedOriginalContextAssetIds).toEqual([]);
  });

  it("calculates count and count limit from target duration", () => {
    expect(recommendHighlightSettings(1800, {
      ...defaultProductionConfig,
      highlightContentType: "animation",
      highlightTargetMode: "duration",
      highlightTargetDuration: 120,
    })).toMatchObject({
      minDuration: 30,
      maxDuration: 300,
      targetDuration: 120,
      recommendedNumber: 12,
      upperLimit: 15,
      maxNumber: 3,
      cutMode: "Mixed",
      enableOpeningHook: true,
    });
  });

  it("keeps the requested values and calculates their linked limits", () => {
    expect(recommendHighlightSettings(1800, {
      ...defaultProductionConfig,
      highlightContentType: "animation",
      highlightTargetMode: "count",
      highlightTargetCount: 12,
    })).toMatchObject({
      minDuration: 30,
      maxDuration: 300,
      targetDuration: 120,
      recommendedDuration: 112,
      durationUpperLimit: 150,
      maxNumber: 12,
    });
  });

  it("forces opening hook off for sequential editing", () => {
    expect(normalizeProductionConfig({
      ...defaultProductionConfig,
      highlightCutMode: "Sequential",
      enableOpeningHook: true,
    }).enableOpeningHook).toBe(false);
  });

  it("handles a 20-minute source with a 300-second target", () => {
    expect(recommendHighlightSettings(1200, {
      ...defaultProductionConfig,
      highlightContentType: "animation",
      highlightTargetMode: "duration",
      highlightTargetDuration: 300,
    })).toMatchObject({
      targetDuration: 300,
      recommendedNumber: 3,
      upperLimit: 4,
      maxNumber: 3,
    });
  });

  it("turns the target duration into a flexible output range", () => {
    expect(highlightDurationRange({
      ...defaultProductionConfig,
      highlightContentType: "animation",
      highlightTargetDuration: 300,
    })).toEqual({
      minDuration: 180,
      maxDuration: 300,
    });
    expect(highlightDurationRange({
      ...defaultProductionConfig,
      highlightContentType: "live_action",
      highlightTargetDuration: 30,
    })).toEqual({
      minDuration: 30,
      maxDuration: 30,
    });
  });

  it("keeps the live-action range as guidance without constraining input", () => {
    expect(recommendHighlightSettings(1200, {
      ...defaultProductionConfig,
      highlightContentType: "live_action",
      highlightTargetMode: "duration",
      highlightTargetDuration: 30,
    })).toMatchObject({
      minDuration: 60,
      maxDuration: 720,
      targetDuration: 30,
      upperLimit: 40,
      recommendedNumber: 30,
    });
  });

  it("allows a target above the suggested maximum when source duration permits", () => {
    expect(recommendHighlightSettings(1200, {
      ...defaultProductionConfig,
      highlightContentType: "live_action",
      highlightTargetMode: "duration",
      highlightTargetDuration: 900,
      highlightTargetCount: 1,
    })).toMatchObject({
      minDuration: 60,
      maxDuration: 720,
      targetDuration: 900,
      upperLimit: 1,
      recommendedNumber: 1,
    });
  });

  it("handles a 20-minute source with four requested outputs", () => {
    expect(recommendHighlightSettings(1200, {
      ...defaultProductionConfig,
      highlightTargetMode: "count",
      highlightTargetCount: 4,
    })).toMatchObject({
      maxNumber: 4,
      recommendedDuration: 225,
      durationUpperLimit: 300,
    });
  });
});
