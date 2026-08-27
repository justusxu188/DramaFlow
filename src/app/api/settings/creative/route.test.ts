import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCreativeSettings: vi.fn(),
  saveCreativeSettings: vi.fn(),
}));

vi.mock("@/lib/creative-settings-store", () => mocks);

import { GET, PUT } from "./route";

describe("creative settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCreativeSettings.mockResolvedValue({
      prerollCreativeSystemPrompt: "creative custom",
      prerollScriptSystemPrompt: "script custom",
      videoPromptSystemPrompt: "video custom",
      videoPromptWithoutSubtitlesSystemPrompt:
        "video no subtitles custom",
      updatedAt: "2026-08-16T00:00:00.000Z",
    });
    mocks.saveCreativeSettings.mockImplementation(async (input) => input);
  });

  it("returns persisted prompt settings", async () => {
    const response = await GET();
    expect((await response.json()).data).toMatchObject({
      prerollCreativeSystemPrompt: "creative custom",
      prerollScriptSystemPrompt: "script custom",
      videoPromptSystemPrompt: "video custom",
      videoPromptWithoutSubtitlesSystemPrompt:
        "video no subtitles custom",
    });
  });

  it("validates and saves both video prompt versions", async () => {
    const response = await PUT(new Request("http://localhost/api/settings/creative", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageModel: "seedream_5_0_lite",
        videoModel: "seedance_2_5",
        prerollCreativeSystemPrompt: "先提出差异化创意",
        prerollScriptSystemPrompt: "再展开投流脚本",
        videoPromptSystemPrompt: "最后编译 Seedance 指令",
        videoPromptWithoutSubtitlesSystemPrompt:
          "编译无字幕 Seedance 指令",
      }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.saveCreativeSettings).toHaveBeenCalledWith(expect.objectContaining({
      prerollCreativeSystemPrompt: "先提出差异化创意",
      prerollScriptSystemPrompt: "再展开投流脚本",
      videoPromptSystemPrompt: "最后编译 Seedance 指令",
      videoPromptWithoutSubtitlesSystemPrompt:
        "编译无字幕 Seedance 指令",
      imageModel: "seedream_5_0_lite",
      videoModel: "seedance_2_5",
      sellingPointCount: 3,
      scriptCount: 3,
      characterMode: "drama_character",
    }));
  });
});
