// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProductionConfig } from "@/lib/production-config";
import { PrerollPromptEditor } from "./preroll-prompt-editor";
import type {
  PipelineJob,
  PipelineRender,
  PipelineScript,
} from "./pipeline-workspace-types";

const script: PipelineScript = {
  id: "script-1",
  arcId: "arc-1",
  highlightId: "highlight-1",
  title: "已确认前贴脚本",
  duration: 15,
  voiceover: "旁白",
  transition: "切入正片",
  reviewStatus: "confirmed",
  videoPrompt: "人物走向镜头",
  videoPromptStatus: "ready",
  videoPromptPlan: {
    targetModel: "seedance_2_5",
    targetDuration: 15,
    resolution: "720p",
    aspectRatio: "9:16",
    maxClipDurationSec: 30,
    generateSubtitles: false,
    reviewStatus: "confirmed",
    globalVisualStyle: "写实短剧",
    characterLock: "",
    sceneLock: "",
    negativePrompt: "",
    missingInformation: [],
    segments: [{
      index: 0,
      duration: 15,
      referenceAssets: [],
      prompt: "人物走向镜头",
      submittedPrompt: "人物走向镜头",
      sound: "",
    }],
  },
  shots: [],
};

const oldRender: PipelineRender = {
  id: "render-old",
  scriptId: script.id,
  status: "completed",
  videoUrl: "https://example.com/old.mp4",
  createdAt: "2026-08-23T08:00:00.000Z",
};

function renderEditor(
  job: PipelineJob,
  renderLatestActions?: ComponentProps<
    typeof PrerollPromptEditor
  >["renderLatestActions"],
) {
  return render(
    <PrerollPromptEditor
      scripts={[script]}
      jobs={[job]}
      renders={[oldRender]}
      characters={[]}
      imageAssets={[]}
      productionConfig={defaultProductionConfig}
      characterSelections={{}}
      submittingVideoIds={[]}
      videoSubmitErrors={{}}
      onCharacterSelectionChange={vi.fn()}
      onCompile={vi.fn().mockResolvedValue(true)}
      onSave={vi.fn().mockResolvedValue(true)}
      onGenerate={vi.fn()}
      renderLatestActions={renderLatestActions}
    />,
  );
}

describe("PrerollPromptEditor video preview", () => {
  afterEach(cleanup);

  it("orders script groups by the latest AI preroll entry", () => {
    const recentlyOpened = {
      ...script,
      id: "script-recent",
      title: "最近进入",
      prerollOpenedAt: "2026-08-24T01:00:00.000Z",
    };
    const olderOpened = {
      ...script,
      id: "script-older",
      title: "较早进入",
      prerollOpenedAt: "2026-08-23T01:00:00.000Z",
    };
    render(
      <PrerollPromptEditor
        scripts={[olderOpened, recentlyOpened]}
        jobs={[]}
        renders={[]}
        characters={[]}
        imageAssets={[]}
        productionConfig={defaultProductionConfig}
        characterSelections={{}}
        submittingVideoIds={[]}
        videoSubmitErrors={{}}
        onCharacterSelectionChange={vi.fn()}
        onCompile={vi.fn().mockResolvedValue(true)}
        onSave={vi.fn().mockResolvedValue(true)}
        onGenerate={vi.fn()}
      />,
    );

    const cards = document.querySelectorAll(
      ".preroll-prompt-card",
    );
    expect(cards[0]?.id).toBe("video-prompt-script-recent");
    expect(cards[1]?.id).toBe("video-prompt-script-older");
  });

  it("shows only the current revision in the result player", () => {
    render(
      <PrerollPromptEditor
        scripts={[script]}
        jobs={[]}
        renders={[{
          ...oldRender,
          videoUrl: "https://example.com/new.mp4",
          currentRevisionId: "revision-new",
          revisions: [
            {
              id: "revision-old",
              videoUrl: "https://example.com/old.mp4",
              operation: "generated",
              createdAt: "2026-08-23T08:00:00.000Z",
            },
            {
              id: "revision-new",
              videoUrl: "https://example.com/new.mp4",
              operation: "generated",
              createdAt: "2026-08-23T10:00:00.000Z",
            },
          ],
        }]}
        characters={[]}
        imageAssets={[]}
        productionConfig={defaultProductionConfig}
        characterSelections={{}}
        submittingVideoIds={[]}
        videoSubmitErrors={{}}
        onCharacterSelectionChange={vi.fn()}
        onCompile={vi.fn().mockResolvedValue(true)}
        onSave={vi.fn().mockResolvedValue(true)}
        onGenerate={vi.fn()}
      />,
    );

    const videos = [...document.querySelectorAll("video")];
    expect(videos.map((video) => video.getAttribute("src"))).toEqual([
      "https://example.com/new.mp4",
    ]);
    expect(
      document.querySelectorAll(".preroll-prompt-card"),
    ).toHaveLength(1);
  });

  it("places latest-render actions inside the current preview pane", () => {
    renderEditor(
      {
        id: "job-completed",
        kind: "preroll",
        status: "completed",
        progress: 100,
        input: { scriptId: script.id },
        updatedAt: "2026-08-23T09:00:00.000Z",
      },
      ({ render }) => (
        <div aria-label="当前视频操作">
          {render.id}
        </div>
      ),
    );

    const actions = screen.getByLabelText("当前视频操作");
    const preview = actions.closest(".preview-pane");
    expect(preview).toBeTruthy();
    expect(
      within(preview as HTMLElement).getByLabelText(
        "当前视频操作",
      ).textContent,
    ).toBe("render-old");
  });

  it("keeps aspect ratio out of editable video prompts", () => {
    const promptWithRatio = {
      ...script,
      videoPromptPlan: {
        ...script.videoPromptPlan!,
        segments: [{
          ...script.videoPromptPlan!.segments[0],
          prompt: "【摄影机参数】9:16画幅，稳定器拍摄。",
          submittedPrompt:
            "【摄影机参数】9:16画幅，稳定器拍摄。",
        }],
      },
    };
    render(
      <PrerollPromptEditor
        scripts={[promptWithRatio]}
        jobs={[]}
        renders={[]}
        characters={[]}
        imageAssets={[]}
        productionConfig={defaultProductionConfig}
        characterSelections={{}}
        submittingVideoIds={[]}
        videoSubmitErrors={{}}
        onCharacterSelectionChange={vi.fn()}
        onCompile={vi.fn().mockResolvedValue(true)}
        onSave={vi.fn().mockResolvedValue(true)}
        onGenerate={vi.fn()}
      />,
    );

    const prompt = screen.getByLabelText(
      "分段 1 生视频提示词",
    ) as HTMLTextAreaElement;
    expect(prompt.value).toBe("【摄影机参数】稳定器拍摄。");

    fireEvent.change(screen.getByLabelText("宽高比"), {
      target: { value: "16:9" },
    });
    expect(prompt.value).toBe("【摄影机参数】稳定器拍摄。");
  });

  it("prioritizes the latest running or failed job over an old video", () => {
    const runningJob: PipelineJob = {
      id: "job-running",
      kind: "preroll",
      status: "running",
      progress: 42,
      input: { scriptId: script.id },
      updatedAt: "2026-08-23T09:00:00.000Z",
    };
    const view = renderEditor(runningJob);

    expect(screen.getByText("生成中 42%")).toBeTruthy();
    expect(screen.getByText("AI 前贴视频生成中")).toBeTruthy();
    expect(screen.queryByText("最新版本")).toBeNull();

    view.rerender(
      <PrerollPromptEditor
        scripts={[script]}
        jobs={[{
          ...runningJob,
          id: "job-failed",
          status: "failed",
          progress: 100,
          error: "模型服务返回失败",
        }]}
        renders={[oldRender]}
        characters={[]}
        imageAssets={[]}
        productionConfig={defaultProductionConfig}
        characterSelections={{}}
        submittingVideoIds={[]}
        videoSubmitErrors={{}}
        onCharacterSelectionChange={vi.fn()}
        onCompile={vi.fn().mockResolvedValue(true)}
        onSave={vi.fn().mockResolvedValue(true)}
        onGenerate={vi.fn()}
      />,
    );

    expect(screen.getByText("本轮生成失败")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "模型服务返回失败",
    );
    expect(screen.queryByText("最新版本")).toBeNull();
  });
});
