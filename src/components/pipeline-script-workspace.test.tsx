// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProductionConfig } from "@/lib/production-config";
import { PipelineScriptWorkspace } from "./pipeline-script-workspace";
import type {
  PipelineData,
  PipelineScript,
} from "./pipeline-workspace-types";

afterEach(cleanup);

function script(
  id: string,
  voiceover: string,
): PipelineScript {
  return {
    id,
    arcId: "arc-1",
    highlightId: "highlight-1",
    title: `脚本 ${id}`,
    duration: 12,
    voiceover,
    transition: "衔接正片",
    reviewStatus: "draft",
    videoPrompt: "",
    shots: [],
  };
}

function pipeline(scripts: PipelineScript[]): PipelineData {
  return {
    status: "scripts_ready",
    characters: [],
    arcs: [{
      id: "arc-1",
      title: "故事线",
      pitch: "冲突升级",
      payoffType: "反转",
      scores: {
        relevance: 5,
        visuality: 5,
        novelty: 5,
        risk: 1,
      },
    }],
    highlights: [{
      id: "highlight-1",
      arcId: "arc-1",
      status: "completed",
      anchor: {
        openingSummary: "高光开头",
        recommendedTransition: "自然衔接",
      },
    }],
    scripts,
    renders: [],
    compositions: [],
  };
}

describe("PipelineScriptWorkspace", () => {
  it("expands every script returned by a manual generation", async () => {
    const user = userEvent.setup();
    const existingScript = script("existing", "历史旁白");
    const firstNewScript = script("new-1", "新旁白一");
    const secondNewScript = script("new-2", "新旁白二");
    const onGenerateOrRetryScripts = vi.fn();
    const props = {
      currentJobs: [],
      effectiveCurrentJobs: [],
      productionConfig: defaultProductionConfig,
      activeHighlightId: "highlight-1",
      selectedScriptIds: [],
      confirmingScripts: false,
      regeneratingHighlightId: "",
      savingScript: false,
      onActiveHighlightChange: vi.fn(),
      onSelectedScriptIdsChange: vi.fn(),
      onRequestScriptDeletion: vi.fn(),
      onGenerateOrRetryScripts,
      onConfirmSelectedScripts: vi.fn(),
      onConfirmScript: vi.fn(),
      onGoToPrerolls: vi.fn(),
      onGoToStoryArcs: vi.fn(),
      onSaveScript: vi.fn(async () => true),
    };
    const { rerender } = render(
      <PipelineScriptWorkspace
        {...props}
        pipeline={pipeline([existingScript])}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "AI 生成脚本",
      }),
    );
    expect(onGenerateOrRetryScripts).toHaveBeenCalledOnce();

    rerender(
      <PipelineScriptWorkspace
        {...props}
        pipeline={pipeline([
          existingScript,
          firstNewScript,
          secondNewScript,
        ])}
      />,
    );

    expect(await screen.findByText("新旁白一")).toBeTruthy();
    expect(screen.getByText("新旁白二")).toBeTruthy();
    expect(screen.queryByText("历史旁白")).toBeNull();
    expect(
      screen.getAllByRole("button", {
        name: "收起脚本详情",
      }),
    ).toHaveLength(2);
  });

  it("shows the failed story arc state instead of an endless opening analysis", async () => {
    const user = userEvent.setup();
    const onGoToStoryArcs = vi.fn();
    const failedPipeline = pipeline([]);
    failedPipeline.highlights[0] = {
      ...failedPipeline.highlights[0],
      id: "highlight-upload-asset-1",
      arcId: "",
      anchor: undefined,
    };
    const failedArcJob = {
      id: "job-arc-failed",
      kind: "mine_arcs",
      status: "failed",
      progress: 1,
      error: "Ark 请求超时（300 秒）",
      input: {
        sourceHighlightAssetId: "asset-1",
      },
      updatedAt: "2026-08-31T01:00:00.000Z",
    };

    render(
      <PipelineScriptWorkspace
        pipeline={failedPipeline}
        currentJobs={[failedArcJob]}
        effectiveCurrentJobs={[failedArcJob]}
        productionConfig={defaultProductionConfig}
        activeHighlightId="highlight-upload-asset-1"
        selectedScriptIds={[]}
        confirmingScripts={false}
        regeneratingHighlightId=""
        savingScript={false}
        onActiveHighlightChange={vi.fn()}
        onSelectedScriptIdsChange={vi.fn()}
        onRequestScriptDeletion={vi.fn()}
        onGenerateOrRetryScripts={vi.fn()}
        onConfirmSelectedScripts={vi.fn()}
        onConfirmScript={vi.fn()}
        onGoToPrerolls={vi.fn()}
        onGoToStoryArcs={onGoToStoryArcs}
        onSaveScript={vi.fn(async () => true)}
      />,
    );

    expect(
      screen.getByText(
        "爽点故事线生成失败：Ark 请求超时（300 秒）",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "爽点故事线生成失败，暂时无法生成脚本",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("正在理解开头")).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "前往爽点故事线重试",
      }),
    );
    expect(onGoToStoryArcs).toHaveBeenCalledOnce();
  });
});
