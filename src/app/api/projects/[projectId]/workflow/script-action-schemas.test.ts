import { describe, expect, it } from "vitest";

import { workflowActionSchema } from "./schema";
import { compileVideoPromptsActionSchema } from "./script-action-schemas";

describe("script action schemas", () => {
  it("normalizes legacy uppercase video resolutions", () => {
    const parsed = compileVideoPromptsActionSchema.parse({
      action: "compile_video_prompts",
      scriptIds: ["script-1"],
      generationSettings: [{
        scriptId: "script-1",
        targetDuration: 14,
        videoModel: "seedance_2_5",
        videoResolution: "720P",
        videoRatio: "9:16",
        generateSubtitles: false,
      }],
    });

    expect(
      parsed.generationSettings?.[0].videoResolution,
    ).toBe("720p");
  });

  it("rejects the removed analysis character binding action", () => {
    expect(
      workflowActionSchema.safeParse({
        action: "save_character_bindings",
        characters: [],
      }).success,
    ).toBe(false);
  });
});
