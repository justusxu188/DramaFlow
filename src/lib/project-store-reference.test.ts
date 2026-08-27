import { describe, expect, it } from "vitest";
import { imageAssetReferenceUrl } from "@/lib/project-store";

describe("imageAssetReferenceUrl", () => {
  it("uses asset protocol only for active ingested avatars", () => {
    expect(imageAssetReferenceUrl({
      sourceUrl: "https://tos.example.com/avatar.jpg",
      metadata: {
        characterName: "江宸",
        avatarStatus: "active",
        avatarAssetId: "avatar-1",
      },
    })).toBe("asset://avatar-1");
  });

  it("keeps the TOS URL for ordinary project images", () => {
    expect(imageAssetReferenceUrl({
      sourceUrl: "https://tos.example.com/portrait.jpg",
      metadata: {
        characterName: "江宸",
        sourceType: "upload",
      },
    })).toBe("https://tos.example.com/portrait.jpg");
  });
});
