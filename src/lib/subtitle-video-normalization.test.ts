import { describe, expect, it } from "vitest";
import { subtitleNormalizationDimensions } from "./subtitle-video-normalization";

describe("subtitle video normalization", () => {
  it("keeps standard 720p and larger videos unchanged", () => {
    expect(subtitleNormalizationDimensions(1280, 720)).toEqual({
      width: 1280,
      height: 720,
      required: false,
    });
    expect(subtitleNormalizationDimensions(1080, 1920)).toEqual({
      width: 1080,
      height: 1920,
      required: false,
    });
  });

  it("normalizes 480p landscape and portrait inputs to standard 720p", () => {
    expect(subtitleNormalizationDimensions(854, 480)).toEqual({
      width: 1280,
      height: 720,
      required: true,
    });
    expect(subtitleNormalizationDimensions(480, 854)).toEqual({
      width: 720,
      height: 1280,
      required: true,
    });
  });

  it("preserves non-standard aspect ratios with even dimensions", () => {
    expect(subtitleNormalizationDimensions(1000, 500)).toEqual({
      width: 1440,
      height: 720,
      required: true,
    });
  });
});
