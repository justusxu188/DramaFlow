// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CreativeSettingsForm } from "@/components/creative-settings-form";
import type { CreativeSettings } from "@/lib/creative-settings-store";
import { defaultProductionConfig } from "@/lib/production-config";

const initialSettings: CreativeSettings = {
  ...defaultProductionConfig,
  prerollCreativeSystemPrompt: "创意提案 Prompt",
  prerollScriptSystemPrompt: "视频脚本 Prompt",
  videoPromptSystemPrompt: "有字幕 Prompt",
  videoPromptWithoutSubtitlesSystemPrompt: "无字幕 Prompt",
  promptVersion: "test",
  updatedAt: "",
};

afterEach(() => {
  cleanup();
});

describe("CreativeSettingsForm", () => {
  it("shows the subtitle prompt modes as tabs with no subtitles selected by default", async () => {
    const user = userEvent.setup();
    render(
      <CreativeSettingsForm initialSettings={initialSettings} />,
    );

    await user.click(
      screen.getByRole("tab", { name: /03 生视频提示词/ }),
    );

    const withoutSubtitlesTab = screen.getByRole("tab", {
      name: "无字幕生视频提示词 System Prompt",
    });
    const withSubtitlesTab = screen.getByRole("tab", {
      name: "有字幕生视频提示词 System Prompt",
    });
    expect(withoutSubtitlesTab.getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(withSubtitlesTab.getAttribute("aria-selected")).toBe(
      "false",
    );
    expect(
      screen.getByLabelText("无字幕生视频提示词 System Prompt"),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("有字幕生视频提示词 System Prompt"),
    ).toBeNull();

    await user.click(withSubtitlesTab);

    expect(withoutSubtitlesTab.getAttribute("aria-selected")).toBe(
      "false",
    );
    expect(withSubtitlesTab.getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(
      screen.getByLabelText("有字幕生视频提示词 System Prompt"),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("无字幕生视频提示词 System Prompt"),
    ).toBeNull();
  });
});
