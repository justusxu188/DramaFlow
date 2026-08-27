import { describe, expect, it } from "vitest";
import { isUsableCharacterImageAsset } from "./character-image-assets";

describe("character image asset eligibility", () => {
  it.each([
    "upload",
    "seedream",
    "seedream_text",
    "seedream_from_capture",
  ] as const)("allows selectable %s images", (sourceType) => {
    expect(
      isUsableCharacterImageAsset({
        metadata: { sourceType },
      }),
    ).toBe(true);
  });

  it.each([
    "video_capture",
    "confirmed_frame",
  ] as const)("excludes %s images", (sourceType) => {
    expect(
      isUsableCharacterImageAsset({
        metadata: { sourceType },
      }),
    ).toBe(false);
  });

  it("always excludes explicitly hidden intermediates", () => {
    expect(
      isUsableCharacterImageAsset({
        metadata: {
          sourceType: "seedream",
          intermediate: true,
          usableAsCharacterReference: false,
        },
      }),
    ).toBe(false);
  });
});
