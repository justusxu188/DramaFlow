// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchPipelinePanel } from "./batch-pipeline-panel";
import { PipelineWorkspace } from "./pipeline-workspace";
import { ProjectDashboard } from "./project-dashboard";
import { UploadManagerProvider } from "./upload-manager";
import { defaultProductionConfig } from "@/lib/production-config";
import { parseCreativeWorkType } from "@/lib/creative-work-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  const localValues = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localValues.set(key, value);
      },
      removeItem: (key: string) => {
        localValues.delete(key);
      },
      clear: () => localValues.clear(),
      key: (index: number) => [...localValues.keys()][index] ?? null,
      get length() {
        return localValues.size;
      },
    },
  });
  const project = {
    id: "project-real",
    name: "真实短剧项目",
    genre: "都市",
    episodeCount: 0,
    progress: 0,
    status: "awaiting_upload",
    outputs: 0,
    sourceCount: 2,
    runningJobs: 2,
    updatedAt: "2026-08-13T00:00:00.000Z",
    assets: [
      {
        id: "asset-1",
        name: "1.mp4",
        sourceUrl: "https://example.com/1.mp4",
        sizeBytes: 1024,
        durationMs: 300000,
        uploadMode: "episodes",
        episodeNumber: 1,
      },
      {
        id: "asset-2",
        name: "2.mp4",
        sourceUrl: "https://example.com/2.mp4",
        sizeBytes: 2048,
        durationMs: 300000,
        uploadMode: "episodes",
        episodeNumber: 2,
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/workflow")) {
        return {
          ok: true,
          json: async () => ({ data: null, jobs: [] }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: url === "/api/projects" ? [project] : project,
        }),
      };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function workflowPostBody(action?: string) {
  const calls = vi.mocked(fetch).mock.calls.filter(
    ([input, init]) =>
      String(input).endsWith("/workflow") &&
      (init as RequestInit | undefined)?.method === "POST",
  );
  const parsed = calls.map((call) =>
    JSON.parse(
      String((call[1] as RequestInit | undefined)?.body),
    ));
  return action
    ? parsed.findLast((body) => body.action === action)
    : parsed[0];
}

describe("pipeline interactions", () => {
  it("does not expose demo downloads when the project has no outputs", async () => {
    render(<PipelineWorkspace projectId="project-late-moon" />);

    await screen.findByRole("button", { name: "开始新生产" });
    expect(
      screen.queryByRole("button", { name: "导出成片" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "整片预览" }),
    ).toBeNull();
    expect(screen.queryByText("项目素材")).toBeNull();
  });

  it("keeps both highlight fields editable and shows linked limits", async () => {
    const user = userEvent.setup();
    render(<PipelineWorkspace projectId="project-late-moon" />);

    const start = await screen.findByRole("button", { name: "开始新生产" });
    expect(start.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByLabelText(/主控方式/)).toBeNull();
    const duration = screen.getByLabelText(
      /目标时长（秒）/,
    ) as HTMLInputElement;
    const count = screen.getByLabelText(/输出视频数/) as HTMLInputElement;
    expect(duration.value).toBe("");
    expect(count.value).toBe("");
    await user.type(duration, "180");
    expect(screen.getByText(
      "推荐生产 3 个；建议上限 3 个（仅供参考）。",
    )).toBeTruthy();
    await user.type(count, "4");
    expect(screen.getByText(
      "推荐目标时长 112 秒；建议上限 150 秒（仅供参考）。",
    )).toBeTruthy();
    await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
    expect(
      screen.queryByText(/素材总时长/),
    ).toBeNull();
    await user.click(start);
    expect(workflowPostBody()).toMatchObject({
      action: "run_full",
      sourceAssetIds: ["asset-1", "asset-2"],
      prerollType: "story_extended",
      productionConfig: {
        sellingPointCount: 3,
        scriptCount: 3,
        scriptDurationMin: 12,
        scriptDurationMax: 18,
        characterMode: "drama_character",
          highlightTargetDuration: 180,
          highlightTargetCount: 4,
      },
    });
  });

  it("explicitly saves the current production plan", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: {} }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: null,
          jobs: [],
          settings: defaultProductionConfig,
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 600000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    const durationInput =
      await screen.findByLabelText(/目标时长（秒）/);
    const countInput =
      screen.getByLabelText(/输出视频数/);
    await user.clear(durationInput);
    await user.type(durationInput, "120");
    await user.clear(countInput);
    await user.type(countInput, "3");
    await user.click(
      screen.getByRole("combobox", {
        name: "前贴与正片关系",
      }),
    );
    await user.click(
      screen.getByRole("option", {
        name: "强引流性质",
      }),
    );
    await user.click(
      screen.getByRole("option", {
        name: "剧情延展",
      }),
    );
    await user.selectOptions(
      screen.getByLabelText("视频模型"),
      "seedance_2_0_fast",
    );
    await user.selectOptions(
      screen.getByLabelText("分辨率"),
      "1080p",
    );
    expect(
      screen
        .getAllByRole("option")
        .filter((option) =>
          [
            "16:9",
            "4:3",
            "1:1",
            "3:4",
            "9:16",
            "21:9",
          ].includes(option.textContent ?? ""),
        ),
    ).toHaveLength(6);
    await user.selectOptions(
      screen.getByLabelText("宽高比"),
      "21:9",
    );
    await user.click(
      screen.getByRole("button", {
        name: "保存生产设置",
      }),
    );

    expect(workflowPostBody()).toMatchObject({
      action: "save_production_plan",
      sourceAssetIds: ["asset-1"],
      prerollType: "strong_acquisition",
      productionConfig: expect.objectContaining({
        prerollTypes: ["strong_acquisition"],
        highlightTargetDuration: 120,
        highlightTargetCount: 3,
        videoModel: "seedance_2_0_fast",
        videoResolution: "1080p",
        videoRatio: "21:9",
      }),
    });
    expect(
      await screen.findByText(
        "生产设置已保存，后续生成将读取这组设置。",
      ),
    ).toBeTruthy();
  });

  it("saves changed production settings without selected assets", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: {} }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: null,
          jobs: [],
          settings: defaultProductionConfig,
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources={false}
        selectedAssetIds={[]}
        selectedAssets={[]}
        probingDurations={false}
        sourceCount={0}
      />,
    );

    await user.selectOptions(
      await screen.findByLabelText("分辨率"),
      "1080p",
    );
    const saveButton = screen.getByRole("button", {
      name: "保存生产设置",
    });
    expect(saveButton.hasAttribute("disabled")).toBe(false);
    await user.click(saveButton);

    expect(workflowPostBody("save_production_plan")).toMatchObject({
      action: "save_production_plan",
      sourceAssetIds: [],
      productionConfig: expect.objectContaining({
        videoResolution: "1080p",
      }),
    });
  });

  it("starts a new production version when the saved next plan differs", async () => {
    const user = userEvent.setup();
    const nextConfig = {
      ...defaultProductionConfig,
      expressionType: "uncanny_spectacle" as const,
      expressionTypes: ["uncanny_spectacle" as const],
      prerollTypes: ["strong_acquisition" as const],
      videoResolution: "1080p" as const,
      videoRatio: "16:9" as const,
    };
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: {} }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            status: "completed",
            currentRunId: "run-current",
            currentRunCreatedAt: "2026-08-20T08:52:00.000Z",
            analysisSourceAssetIds: ["asset-1"],
            productionConfig: defaultProductionConfig,
            nextProductionPlan: {
              productionConfig: nextConfig,
              prerollType: "strong_acquisition",
              sourceAssetIds: ["asset-1"],
              updatedAt: "2026-08-22T02:00:00.000Z",
            },
            analysis: {
              duration: 600,
              sourceVideoInfo: [],
              clips: [],
              highlights: [],
            },
            characters: [],
            arcs: [],
            highlights: [],
            scripts: [],
            renders: [],
            compositions: [],
          },
          jobs: [],
          settings: defaultProductionConfig,
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 600000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    const start = await screen.findByRole("button", {
      name: "开始新生产",
    });
    expect(
      screen.queryByRole("button", {
        name: "继续当前生产",
      }),
    ).toBeNull();
    await user.click(start);
    await user.click(
      screen.getByRole("button", {
        name: "确认开始新生产",
      }),
    );

    expect(workflowPostBody("run_full")).toMatchObject({
      action: "run_full",
      productionConfig: expect.objectContaining({
        expressionTypes: ["uncanny_spectacle"],
        prerollTypes: ["strong_acquisition"],
        videoResolution: "1080p",
        videoRatio: "16:9",
      }),
    });
  });

  it("starts Agent production from selected highlight assets", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: {} }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: null,
          jobs: [],
          settings: defaultProductionConfig,
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        workType={parseCreativeWorkType(
          "highlight-preroll",
        )}
        executionMode="agent"
        hasSources={false}
        highlightAssets={[
          {
            id: "highlight-asset-1",
            name: "用户高光-身份揭露",
            sourceUrl:
              "https://example.com/highlight.mp4",
            durationMs: 90000,
            metadata: { sourceType: "user" },
          },
        ]}
        selectedAssetIds={[]}
        selectedAssets={[]}
        probingDurations={false}
        sourceCount={0}
      />,
    );

    await screen.findByText("高光前贴创作");
    expect(
      screen.queryByRole("checkbox", {
        name: /用户高光-身份揭露/,
      }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "从素材库选择",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /用户高光-身份揭露/,
      }),
    );
    const start = screen.getByRole("button", {
      name: "开始新生产",
    });
    expect(start.hasAttribute("disabled")).toBe(false);
    await user.click(start);

    expect(workflowPostBody()).toMatchObject({
      action: "run_full",
      productionConfig: expect.objectContaining({
        productionEntry: "uploaded_highlights",
        executionMode: "agent",
        selectedHighlightAssetIds: [
          "highlight-asset-1",
        ],
      }),
    });
    expect(
      Object.hasOwn(
        workflowPostBody(),
        "sourceAssetIds",
      ),
    ).toBe(false);
  });

  it("explains project episode reuse in highlight-preroll production", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: null,
        jobs: [],
        settings: defaultProductionConfig,
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        workType={parseCreativeWorkType(
          "highlight-preroll",
        )}
        hasSources
        highlightAssets={[{
          id: "highlight-asset-1",
          name: "项目高光",
          sourceUrl: "https://example.com/highlight.mp4",
          durationMs: 90000,
          metadata: { sourceType: "mediakit" },
        }]}
        selectedAssetIds={["source-1"]}
        selectedAssets={[{
          id: "source-1",
          durationMs: 600000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    expect(
      await screen.findByText(
        /使用同项目原剧的剧情理解、爽点故事线/,
      ),
    ).toBeTruthy();
  });

  it("separates the next highlight selection from current batch scripts", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "scripts_ready",
          currentRunId: "run-current",
          productionConfig: {
            ...defaultProductionConfig,
            productionEntry: "uploaded_highlights",
            selectedHighlightAssetIds: ["highlight-asset-new"],
          },
          arcs: [{
            id: "arc-upload-highlight-asset-old",
            title: "当前批次旧高光",
            pitch: "当前批次剧情",
            payoffType: "已有高光",
            scores: {
              relevance: 100,
              visuality: 100,
              novelty: 80,
              risk: 0,
            },
          }],
          highlights: [{
            id: "highlight-upload-highlight-asset-old",
            arcId: "arc-upload-highlight-asset-old",
            status: "completed",
            anchor: {
              openingSummary: "当前批次高光开头",
              recommendedTransition: "硬切",
            },
            result: {
              videoUrls: ["https://example.com/old-highlight.mp4"],
              variants: [{ duration: 90 }],
            },
          }],
          scripts: [{
            id: "script-old",
            arcId: "arc-upload-highlight-asset-old",
            highlightId: "highlight-upload-highlight-asset-old",
            title: "当前批次高光脚本",
            duration: 15,
            voiceover: "当前批次脚本",
            transition: "硬切",
            reviewStatus: "draft",
            videoPrompt: "",
            shots: [],
          }],
          renders: [],
          compositions: [],
        },
        jobs: [],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        workType={parseCreativeWorkType("highlight-preroll")}
        hasSources={false}
        highlightAssets={[{
          id: "highlight-asset-old",
          name: "当前批次旧高光",
          sourceUrl: "https://example.com/old-highlight.mp4",
          durationMs: 90000,
          metadata: { sourceType: "user" },
        }, {
          id: "highlight-asset-new",
          name: "下次生产新高光",
          sourceUrl: "https://example.com/new-highlight.mp4",
          durationMs: 90000,
          metadata: { sourceType: "user" },
        }]}
        selectedAssetIds={[]}
        selectedAssets={[]}
        probingDurations={false}
        sourceCount={0}
      />,
    );

    expect(
      await screen.findByText(
        /系统会完整理解本次选中的高光视频/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(/当前选择与已完成批次不同/),
    ).toBeNull();
    await user.click(
      screen.getByRole("tab", { name: /AI 前贴脚本/ }),
    );
    expect(
      screen.getByRole("button", {
        name: "开始新生产",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("当前脚本关联高光"),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        /本次所选高光视频的完整剧情理解与爽点故事线/,
      ),
    ).toBeNull();
    expect(
      screen.queryByLabelText("播放高光：当前批次旧高光"),
    ).toBeNull();
    expect(screen.queryByText("下次生产新高光")).toBeNull();
  });

  it("shows and submits the batch highlight start action", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: {} }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: null,
          jobs: [],
          settings: defaultProductionConfig,
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        workType={parseCreativeWorkType(
          "batch-highlights",
        )}
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 600000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await screen.findByText("批量高光剪辑");
    expect(
      screen.getByRole("tab", { name: /默认方案 生产设置/ }),
    ).toBeTruthy();
    expect(
      screen.queryByText("生产设置有未保存修改"),
    ).toBeNull();
    const durationInput =
      screen.getByLabelText(/目标时长（秒）/);
    const countInput =
      screen.getByLabelText(/输出视频数/);
    await user.clear(durationInput);
    await user.type(durationInput, "120");
    await user.clear(countInput);
    await user.type(countInput, "3");
    const startButton = screen.getByRole(
      "button",
      { name: "开始批量高光剪辑" },
    );
    await user.click(startButton);

    expect(workflowPostBody()).toMatchObject({
      action: "run_full",
      sourceAssetIds: ["asset-1"],
      productionConfig: expect.objectContaining({
        productionEntry: "batch_highlights",
        highlightTargetDuration: 120,
        highlightTargetCount: 3,
      }),
    });
  });

  it("isolates task status and saved settings by workflow", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: {} }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            status: "highlights_running",
            currentRunId: "run-full",
            productionConfig: {
              ...defaultProductionConfig,
              productionEntry: "full_drama",
              highlightTemplate: "热门短剧1",
            },
            arcs: [],
            highlights: [],
            scripts: [],
            renders: [],
            compositions: [],
          },
          jobs: [{
            id: "full-highlight-running",
            runId: "run-full",
            kind: "highlight",
            status: "running",
            progress: 50,
            input: {
              productionEntry: "full_drama",
            },
            createdAt: "2026-08-20T08:00:00.000Z",
            updatedAt: "2026-08-20T08:01:00.000Z",
          }],
          settings: {
            ...defaultProductionConfig,
            highlightTemplate: "none",
          },
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        workType={parseCreativeWorkType(
          "batch-highlights",
        )}
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 600000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    expect(
      await screen.findByText("尚未创建"),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", {
        name: /等待.*高光剪辑/,
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "开始批量高光剪辑",
      }),
    );
    expect(workflowPostBody()).toMatchObject({
      productionConfig: expect.objectContaining({
        productionEntry: "batch_highlights",
        highlightTemplate: "none",
      }),
    });
  });

  it("does not reuse storyline analysis for batch highlights", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: {} }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            analysisSourceAssetIds: ["asset-1"],
            analysis: {
              duration: 600,
              clips: [{ index: 0 }],
            },
            arcs: [],
            highlights: [],
            scripts: [],
            renders: [],
            compositions: [],
          },
          jobs: [],
          settings: defaultProductionConfig,
        }),
      } as Response;
    });
    render(
      <BatchPipelinePanel
        projectId="project-real"
        workType={parseCreativeWorkType(
          "batch-highlights",
        )}
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 600000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );
    const durationInput =
      await screen.findByLabelText(/目标时长（秒）/);
    const countInput =
      screen.getByLabelText(/输出视频数/);
    await user.clear(durationInput);
    await user.type(durationInput, "120");
    await user.clear(countInput);
    await user.type(countInput, "3");
    await user.click(
      screen.getByRole("button", {
        name: "开始批量高光剪辑",
      }),
    );

    expect(workflowPostBody()).toMatchObject({
      action: "run_full",
      productionConfig: expect.objectContaining({
        productionEntry: "batch_highlights",
      }),
    });
  });

  it("allows a new production run when old draft scripts remain in history", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: { id: "job-new-analysis" } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            status: "scripts_ready",
            analysisSourceAssetIds: ["asset-1"],
            analysis: { duration: 600, clips: [] },
            arcs: [],
            highlights: [],
            scripts: [{
              id: "script-old",
              arcId: "arc-old",
              highlightId: "highlight-old",
              title: "旧批次脚本",
              duration: 15,
              voiceover: "旧脚本",
              transition: "切入正片",
              reviewStatus: "draft",
              videoPrompt: "旧提示词",
              shots: [],
            }],
            renders: [],
            compositions: [],
          },
          jobs: [],
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1", "asset-2"]}
        selectedAssets={[
          { id: "asset-1", durationMs: 300000 },
          { id: "asset-2", durationMs: 300000 },
        ]}
        probingDurations={false}
        sourceCount={2}
      />,
    );

    const start = await screen.findByRole("button", {
      name: "开始新生产",
    });
    await user.click(
      screen.getByRole("tab", { name: /生产设置/ }),
    );
    await user.type(screen.getByLabelText(/目标时长（秒）/), "120");
    await user.type(screen.getByLabelText(/输出视频数/), "3");
    expect(start.hasAttribute("disabled")).toBe(false);
    await user.click(start);

    // Selection changed since the last analysis → confirm the new batch.
    const confirm = await screen.findByRole("button", {
      name: "确认开始新生产",
    });
    await user.click(confirm);

    expect(workflowPostBody()).toMatchObject({
      action: "run_full",
      sourceAssetIds: ["asset-1", "asset-2"],
    });
  });

  it("shows the current material analysis progress", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "analysis_queued",
          currentRunId: "run-current",
          arcs: [],
          highlights: [],
          scripts: [],
          renders: [],
          compositions: [],
        },
        jobs: [{
          id: "job-current-analysis",
          runId: "run-current",
          kind: "analysis",
          status: "queued",
          progress: 62,
        }, {
          id: "job-old-analysis",
          runId: "run-old",
          kind: "analysis",
          status: "completed",
          progress: 100,
        }],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1", "asset-2"]}
        selectedAssets={[
          { id: "asset-1", durationMs: 300000 },
          { id: "asset-2", durationMs: 300000 },
        ]}
        probingDurations={false}
        sourceCount={2}
      />,
    );

    expect(await screen.findByRole("button", {
      name: "剧情理解中",
    })).toBeTruthy();
  });

  it("shows every storyline field without truncating clips", async () => {
    const clips = Array.from({ length: 7 }, (_, index) => ({
      index,
      sourceVideoIndex: index < 4 ? 0 : 1,
      title: `剧情片段 ${index + 1}`,
      summary: `片段摘要 ${index + 1}`,
      dialogue: `片段对白 ${index + 1}`,
      score: 4.2,
      start: index * 10,
      end: index * 10 + 8,
      snapshotUrl:
        index === 0
          ? "https://example.com/expired-snapshot.jpg"
          : undefined,
    }));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "plan_review",
          analysis: {
            duration: 140,
            sourceVideoInfo: [{
              index: 0,
              url: "https://example.com/1.mp4",
              title: "第一集标题",
              summary: "第一集完整摘要",
              tags: ["冲突", "反转"],
            }, {
              index: 1,
              url: "https://example.com/2.mp4",
              title: "第二集标题",
              summary: "第二集完整摘要",
              tags: ["证据"],
            }],
            clips,
            highlights: [{
              index: 0,
              title: "跨片段高光",
              summary: "高光候选完整摘要",
              clipIndexes: [0, 6],
            }],
          },
          arcs: [],
          highlights: [],
          scripts: [],
          renders: [],
          compositions: [],
        },
        jobs: [],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1", "asset-2"]}
        selectedAssets={[
          { id: "asset-1", durationMs: 70000 },
          { id: "asset-2", durationMs: 70000 },
        ]}
        probingDurations={false}
        sourceCount={2}
      />,
    );

    fireEvent.click(
      await screen.findByRole("tab", {
        name: /剧情理解/,
      }),
    );
    expect(await screen.findByText("第一集完整摘要")).toBeTruthy();
    expect(screen.getByText("第二集完整摘要")).toBeTruthy();
    expect(screen.getByText("剧情片段 7")).toBeTruthy();
    expect(screen.getByText("片段对白 7")).toBeTruthy();
    expect(screen.getByText("跨片段高光")).toBeTruthy();
    expect(screen.getByText("高光候选完整摘要")).toBeTruthy();
    const snapshot = screen.getByAltText(
      "第 1 集片段 1 关键帧",
    ) as HTMLImageElement;
    expect(
      screen.getByLabelText("第 1 集片段 1 视频帧")
        .getAttribute("src"),
    ).toBe("https://example.com/1.mp4#t=0.1");
    fireEvent.error(snapshot);
    expect(snapshot.hidden).toBe(true);
  });

  it("shows pending character confirmation without blocking later stages", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "arcs_ready",
          analysis: {
            duration: 20,
            sourceVideoInfo: [{
              index: 0,
              url: "https://example.com/source.mp4",
              title: "第一集",
              summary: "剧情摘要",
              tags: [],
            }],
            clips: [],
            highlights: [],
          },
          characters: [{
            id: "character-1",
            name: "待确认人物 1",
            role: "",
            aliases: [],
            status: "candidate",
            appearances: [{
              id: "appearance-1",
              clipIndex: 0,
              sourceVideoIndex: 0,
              timestamp: 0,
              imageUrl: "https://example.com/person.jpg",
            }],
            referenceAssetIds: [],
            updatedAt: "2026-08-19T00:00:00.000Z",
          }],
          arcs: [{
            id: "arc-1",
            title: "身份反转",
            pitch: "剧情继续生产",
            payoffType: "反转",
            scores: {
              relevance: 5,
              visuality: 5,
              novelty: 4,
              risk: 1,
            },
          }],
          highlights: [],
          scripts: [],
          renders: [],
          compositions: [],
        },
        imageAssets: [],
        jobs: [],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{ id: "asset-1", durationMs: 20000 }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await userEvent.setup().click(
      await screen.findByRole("tab", { name: /剧情理解/ }),
    );
    expect(screen.getByText(/1 个人物 · 0 已确认 · 1 待处理/)).toBeTruthy();
    expect(screen.getByText("不阻塞后续生产，生视频时再关联图片")).toBeTruthy();
    const candidate = screen.getByAltText(
      "待确认人物 1 候选画面",
    ) as HTMLImageElement;
    fireEvent.error(candidate);
    expect(candidate.hidden).toBe(true);
    expect(
      screen.getByLabelText("待确认人物 1 源视频画面")
        .getAttribute("src"),
    ).toBe("https://example.com/source.mp4#t=0.1");
    expect(
      screen.getByText("旧关键帧已失效，请重新进行剧情理解"),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", {
        name: "设为 待确认人物 1 标准参考图",
      })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("tab", { name: /爽点故事线/ }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("shows dismissible failures only in the AI preroll script stage", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "scripts_ready",
          currentRunId: "run-current",
          productionConfig: defaultProductionConfig,
          analysis: {
            duration: 20,
            sourceVideoInfo: [],
            clips: [],
            highlights: [],
          },
          characters: [],
          arcs: [],
          highlights: [],
          scripts: [{
            id: "script-1",
            arcId: "arc-1",
            highlightId: "highlight-1",
            title: "待修复脚本",
            duration: 17,
            voiceover: "口播",
            transition: "切入正片",
            reviewStatus: "confirmed",
            videoPrompt: "",
            shots: [],
          }],
          renders: [],
          compositions: [],
        },
        imageAssets: [],
        jobs: [{
          id: "job-video-failed",
          runId: "run-current",
          kind: "preroll",
          status: "failed",
          progress: 100,
          error: "脚本未通过生视频检查",
          input: { scriptId: "script-1" },
          createdAt: "2026-08-19T00:00:00.000Z",
          updatedAt: "2026-08-19T00:01:00.000Z",
        }],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{ id: "asset-1", durationMs: 20000 }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await user.click(
      await screen.findByRole("tab", {
        name: /AI 前贴脚本/,
      }),
    );
    expect(
      screen.queryByText("脚本未通过生视频检查"),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "重试AI 前贴视频",
      }),
    ).toBeNull();
    await user.click(
      screen.getByRole("tab", { name: /AI 前贴视频/ }),
    );
    expect(
      await screen.findAllByText("脚本未通过生视频检查"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "重试当前阶段",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /剧情理解/ }));
    expect(screen.queryByText("脚本未通过生视频检查")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /AI 前贴视频/ }));
    await user.click(
      screen.getByRole("button", {
        name: "关闭AI 前贴视频错误",
      }),
    );
    expect(
      screen.getAllByText("脚本未通过生视频检查"),
    ).toHaveLength(1);
    expect(
      window.localStorage.getItem(
        "pipeline-dismissed-failures:project-real",
      ),
    ).toContain("job-video-failed");
  });

  it("renders highlight outputs as playable videos", async () => {
    const user = userEvent.setup();
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(() => ({
        observe,
        unobserve: vi.fn(),
        disconnect: vi.fn(),
        takeRecords: vi.fn(() => []),
        root: null,
        rootMargin: "300px 0px",
        thresholds: [0],
      })),
    );
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "scripts_ready",
          productionConfig: {
            ...defaultProductionConfig,
            highlightTargetCount: 1,
          },
          characters: [{
            id: "character-1",
            name: "女主",
            role: "主角",
            aliases: ["林夏"],
            status: "confirmed",
            appearances: [],
            referenceAssetIds: [],
            updatedAt: "2026-08-17T09:00:00.000Z",
          }],
          arcs: [{
            id: "arc-1",
            title: "身份反转故事线",
            pitch: "冲突升级",
            payoffType: "身份反转",
            scores: { relevance: 98, visuality: 95, novelty: 90, risk: 5 },
          }, {
            id: "arc-2",
            title: "追车故事线",
            pitch: "速度升级",
            payoffType: "追逐",
            scores: { relevance: 95, visuality: 96, novelty: 88, risk: 5 },
          }],
          highlights: [{
            id: "highlight-1",
            arcId: "arc-1",
            status: "completed",
            anchor: {
              openingSummary: "高光开头冲突",
              recommendedTransition: "闪白切入",
              visualStyle: {
                visualMedium: "写实短剧",
                characterStyle: "现代都市人物",
                wardrobeStyle: "日常通勤服装",
                propStyle: "现实生活道具",
                sceneStyle: "医院门口",
                lightingStyle: "阴天自然光",
                colorStyle: "低饱和冷色",
                cameraStyle: "稳定推进",
                textureStyle: "真实摄影质感",
              },
            },
            result: {
              videoUrls: ["https://example.com/highlight.mp4"],
              variants: [{ duration: 120 }],
            },
          }, {
            id: "highlight-2",
            arcId: "arc-2",
            status: "completed",
            result: {
              videoUrls: ["https://example.com/highlight-2.mp4"],
              variants: [{ duration: 90 }],
            },
          }],
          scripts: [{
            id: "script-1",
            arcId: "arc-1",
            highlightId: "highlight-1",
            title: "关联前贴脚本",
            duration: 45,
            createdAt: "2026-08-17T10:00:00",
            voiceover: "原创钩子后切入正片。",
            transition: "闪白切入",
            reviewStatus: "draft",
            videoPrompt: "竖屏视频",
            shots: [{
              time: "0-3秒",
              framing: "近景缓慢推进",
              visual: "女主按下轮椅扶手上的红色按钮",
              voiceover: "这把轮椅正在倒数。",
              dialogueSpeaker: "女主",
              dialogue: "倒计时开始了。",
              subtitle: "只剩三秒",
              sceneCaption: "医院门口",
              sound: "低频心跳与按钮提示音",
              dynamicChange: "按钮红光逐渐增强",
              characterAction: "女主按下按钮",
              startState: "女主低头",
              endState: "女主抬头",
              characters: ["女主"],
              scene: "医院门口",
              keyProps: ["轮椅"],
              editingRhythm: "首帧直入，动作后切特写",
              purpose: "用反常倒计时建立钩子",
            }, {
              time: "3.0-5.0秒",
              framing: "中景固定",
              visual: "女主抬头看向镜头。",
              voiceover: "真相马上揭晓。",
              dialogueSpeaker: "无",
              dialogue: "",
              subtitle: "真相马上揭晓",
              sound: "心跳声停止",
            }],
          }, {
            id: "script-ready",
            arcId: "arc-1",
            highlightId: "highlight-1",
            title: "提示词已就绪脚本",
            duration: 15,
            voiceover: "提示词已经完成编译。",
            transition: "闪白切入",
            reviewStatus: "confirmed",
            videoPromptStatus: "ready",
            videoPrompt: "可直接提交 Seedance 的提示词",
            videoPromptPlan: {
              targetModel: "seedance_2_5",
              targetDuration: 15,
              resolution: "720p",
              aspectRatio: "9:16",
              maxClipDurationSec: 30,
              generateSubtitles: false,
              reviewStatus: "confirmed",
              globalVisualStyle: "9:16 竖屏写实短剧",
              characterLock: "女主短发和浅色外套保持一致",
              sceneLock: "医院门口阴天自然光",
              negativePrompt: "禁止人物变形和背景闪变",
              missingInformation: [],
              segments: [{
                index: 0,
                duration: 15,
                sourceBeats: ["S1"],
                referenceAssets: [],
                prompt:
                  "医院门口近景，女主端坐轮椅并从低头转为看向右侧，镜头单一缓慢推进，阴天自然光保持稳定。",
                submittedPrompt:
                  "医院门口近景，女主端坐轮椅并从低头转为看向右侧，镜头单一缓慢推进，阴天自然光保持稳定。",
                sound: "低频心跳同步动作",
              }],
            },
            shots: [{
              beatId: "S1",
              time: "0-15秒",
              framing: "中景",
              visual: "女主在医院门口回头",
              dialogue: "",
              characters: ["女主"],
            }],
          }, {
            id: "script-compiling",
            arcId: "arc-1",
            highlightId: "highlight-1",
            title: "正在生成提示词脚本",
            duration: 15,
            voiceover: "正在编译提示词。",
            transition: "硬切",
            reviewStatus: "confirmed",
            videoPromptStatus: "pending",
            videoPrompt: "",
            shots: [],
          }],
          renders: [],
          compositions: [],
        },
        jobs: [{
          id: "compile-prompt-job",
          kind: "preroll",
          status: "running",
          progress: 30,
          input: {
            scriptId: "script-compiling",
            prerollPhase: "compile_prompt",
          },
          createdAt: "2026-08-17T10:00:00.000Z",
        }],
        imageAssets: [{
          id: "image-primary",
          name: "女主主图",
          sourceUrl: "https://example.com/hero-primary.jpg",
          metadata: {
            characterId: "character-1",
            characterName: "女主",
            sourceType: "upload",
            referenceType: "primary",
          },
        }, {
          id: "image-active",
          name: "女主虚拟人",
          sourceUrl: "https://example.com/hero-avatar.jpg",
          metadata: {
            characterId: "character-1",
            characterName: "女主",
            sourceType: "upload",
            referenceType: "primary",
            avatarAssetId: "asset-avatar-1",
            avatarStatus: "active",
          },
        }, {
          id: "image-processing",
          name: "女主处理中图片",
          sourceUrl: "https://example.com/hero-processing.jpg",
          metadata: {
            characterId: "character-1",
            characterName: "女主",
            sourceType: "upload",
            referenceType: "appearance",
            avatarStatus: "processing",
          },
        }, {
          id: "image-other-character",
          name: "男主项目图片",
          sourceUrl: "https://example.com/other-character.jpg",
          metadata: {
            characterId: "character-2",
            characterName: "男主",
            sourceType: "upload",
            referenceType: "primary",
          },
        }],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{ id: "asset-1", durationMs: 120000 }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await user.click(
      await screen.findByRole("tab", {
        name: /高光剪辑/,
      }),
    );
    const stageVideo = await screen.findByLabelText(
      "播放高光：身份反转故事线",
    );
    expect(document.querySelectorAll("video")).toHaveLength(1);
    expect(
      screen.getByText("视频接近可视区域时加载"),
    ).toBeTruthy();
    expect(observe).toHaveBeenCalledOnce();
    fireEvent.error(stageVideo);
    expect(
      await screen.findByText("视频地址已失效"),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", {
        name: /失效 1.*高光剪辑/,
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "返回生产设置",
      }),
    );
    expect(
      screen.getByRole("tab", {
        name: /生产设置/,
      }).getAttribute("aria-selected"),
    ).toBe("true");

    await user.click(
      await screen.findByRole("tab", {
        name: /AI 前贴脚本/,
      }),
    );
    expect(
      screen.getByLabelText(
        "播放高光 1：身份反转故事线",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("当前生产版本 AI 前贴脚本"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "前往 AI 前贴视频",
      }),
    ).toBeNull();
    const targetScriptCard = screen
      .getByRole("button", {
        name: "编辑脚本：提示词已就绪脚本",
      })
      .closest("article");
    expect(targetScriptCard).toBeTruthy();
    await user.click(
      within(targetScriptCard!).getByRole("button", {
        name: "AI 前贴视频",
      }),
    );
    expect(
      screen
        .getByRole("tab", { name: /AI 前贴视频/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      }));
    await user.click(
      screen.getByRole("tab", { name: /AI 前贴脚本/ }),
    );
    expect(screen.queryByText("高光视觉风格")).toBeNull();
    expect(
      screen.getByText("2026/08/17 10:00:00"),
    ).toBeTruthy();
    expect(screen.queryByText("最新版本")).toBeNull();
    const draftConfirmButton = screen.getByRole("button", {
      name: "确认脚本：关联前贴脚本",
    });
    expect(draftConfirmButton).toBeTruthy();
    const confirmedEditButton = screen.getByRole("button", {
      name: "编辑脚本：提示词已就绪脚本",
    });
    expect(confirmedEditButton).toBeTruthy();
    const confirmedCard = confirmedEditButton.closest("article");
    expect(confirmedCard).toBeTruthy();
    expect(
      within(confirmedCard!).getAllByText("已确认"),
    ).toHaveLength(1);
    expect(
      within(confirmedCard!).queryByRole("button", {
        name: "确认脚本：提示词已就绪脚本",
      }),
    ).toBeNull();
    let resolvePromptRequest!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() =>
      new Promise<Response>((resolve) => {
        resolvePromptRequest = resolve;
      }));
    await user.click(draftConfirmButton);
    expect(draftConfirmButton.querySelector(".spin")).toBeTruthy();
    resolvePromptRequest({
      ok: true,
      json: async () => ({ data: null }),
    } as Response);
    await waitFor(() =>
      expect(draftConfirmButton.querySelector(".spin")).toBeNull());
    expect(
      screen.getByText("当前生产版本 AI 前贴脚本"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "查看高光 1：身份反转故事线",
      }).getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.queryByText("差异化母题与钩子")).toBeNull();
    expect(screen.queryByText("编辑并确认成稿")).toBeNull();
    expect(screen.queryByText("确认后自动编译")).toBeNull();
    expect(
      screen.queryByText("确认后编译"),
    ).toBeNull();
    expect(
      screen.queryByText("查看生视频提示词"),
    ).toBeNull();
    const readyScriptCard = confirmedEditButton.closest("article");
    expect(readyScriptCard).toBeTruthy();
    await user.click(
      within(readyScriptCard!).getByRole("button", {
        name: "查看脚本详情",
      }),
    );
    expect(
      screen.queryByText("生视频提示词"),
    ).toBeNull();
    expect(
      screen.getAllByText("AI 前贴类型").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("前贴与正片关系").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("创作模式")).toBeNull();
    expect(
      screen.queryByText("首帧花字"),
    ).toBeNull();
    expect(
      screen.queryByText("口播字数校验"),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "编辑脚本：关联前贴脚本",
      }),
    );
    const editor = screen.getByRole("dialog", {
      name: "编辑 AI 前贴脚本",
    });
    expect(
      within(editor).queryByText(
        "生视频提示词将在确认脚本后自动编译",
      ),
    ).toBeNull();
    expect(
      within(editor).queryByLabelText("生视频提示词"),
    ).toBeNull();
    expect(within(editor).getByText("标题")).toBeTruthy();
    expect(within(editor).getByText("脚本信息")).toBeTruthy();
    expect(within(editor).getByText("前贴脚本内容")).toBeTruthy();
    expect(
      within(editor).getByLabelText("首帧花字"),
    ).toBeTruthy();
    expect(
      within(editor).queryByText("字幕、声音与剪辑"),
    ).toBeNull();
    expect(
      within(editor).getByLabelText("第 1 段字幕"),
    ).toBeTruthy();
    expect(
      (within(editor).getByLabelText(
        "第 1 段场景或时间文字",
      ) as HTMLTextAreaElement).value,
    ).toBe("医院门口");
    expect(
      (within(editor).getByLabelText(
        "第 1 段旁白",
      ) as HTMLTextAreaElement).value,
    ).toBe("这把轮椅正在倒数。");
    expect(
      (within(editor).getByLabelText(
        "第 1 段角色台词",
      ) as HTMLTextAreaElement).value,
    ).toBe("女主说：倒计时开始了。");
    expect(
      (within(editor).getByLabelText(
        "第 2 段角色台词",
      ) as HTMLTextAreaElement).value,
    ).toBe("");
    const durationInput = within(editor).getByLabelText(
      "总时长（秒）",
    ) as HTMLInputElement;
    expect(durationInput.readOnly).toBe(true);
    expect(durationInput.value).toBe("5");
    const segmentTime = within(editor).getByLabelText(
      "镜头 1 时间",
    );
    fireEvent.change(segmentTime, {
      target: { value: "0-4" },
    });
    fireEvent.blur(segmentTime);
    expect(durationInput.value).toBe("6");
    expect(
      (within(editor).getByLabelText(
        "镜头 2 时间",
      ) as HTMLInputElement).value,
    ).toBe("4-6秒");
    expect(within(editor).getByText("第1段")).toBeTruthy();
    expect(within(editor).queryByText("AI 生成节拍")).toBeNull();
    expect(
      within(editor).getByLabelText("镜头 1 声音"),
    ).toBeTruthy();
    expect(
      within(editor).queryByLabelText("镜头 1 剪辑节奏"),
    ).toBeNull();
    expect(
      within(editor).queryByLabelText("镜头 1 目的"),
    ).toBeNull();
    const shotRow = within(editor)
      .getByLabelText("镜头 1 时间")
      .closest(".script-shot-row");
    expect(shotRow).toBeTruthy();
    expect(
      within(shotRow as HTMLElement).getAllByRole(
        "textbox",
      ),
    ).toHaveLength(8);
    fireEvent.change(
      within(editor).getByLabelText("镜头 1 景别"),
      { target: { value: "特写，快速推进" } },
    );
    fireEvent.change(
      within(editor).getByLabelText("镜头 1 画面"),
      { target: { value: "女主猛然抬头看向镜头" } },
    );
    fireEvent.change(
      within(editor).getByLabelText(
        "第 1 段场景或时间文字",
      ),
      { target: { value: "三天后" } },
    );
    await user.click(
      screen.getByRole("button", { name: "取消" }),
    );
    await user.click(
      screen.getByRole("tab", { name: /生产设置/ }),
    );
    const styleInput = screen.getByRole("combobox", {
      name: "AI 前贴类型",
    });
    expect(
      (
        screen.getByRole("combobox", {
          name: "生成字幕",
        }) as HTMLSelectElement
      ).value,
    ).toBe("no");
    expect(
      screen.getByRole("option", {
        name: "Seedance 2.5",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByText(/系统默认模型/),
    ).toBeNull();
    expect(
      screen.queryByText(/ep-2026/),
    ).toBeNull();
    const minimumScriptDuration = screen.getByLabelText(
      "视频脚本最小时长",
    );
    const maximumScriptDuration = screen.getByLabelText(
      "视频脚本最大时长",
    );
    await user.clear(minimumScriptDuration);
    await user.type(minimumScriptDuration, "16");
    await user.clear(maximumScriptDuration);
    await user.type(maximumScriptDuration, "20");
    await user.click(styleInput);
    await user.click(
      screen.getByRole("option", { name: "违和奇观" }),
    );
    await user.click(
      await screen.findByRole("tab", { name: /AI 前贴脚本/ }),
    );
    await user.click(screen.getByRole("button", { name: "AI 生成脚本" }));
    await waitFor(() =>
      expect(workflowPostBody("regenerate_scripts")).toEqual(expect.objectContaining({
        action: "regenerate_scripts",
        highlightId: "highlight-1",
        prerollType: "story_extended",
        productionConfig: expect.objectContaining({
          scriptDurationMin: 16,
          scriptDurationMax: 20,
          expressionTypes: expect.arrayContaining([
            "uncanny_spectacle",
          ]),
        }),
      })));
    await user.click(
      screen.getByRole("tab", { name: /AI 前贴视频/ }),
    );
    const promptEditor = screen
      .getByLabelText("分段 1 生视频提示词")
      .closest("article");
    expect(promptEditor).toBeTruthy();
    const assetSelect = within(promptEditor!).getByRole(
      "combobox",
      { name: "女主关联图像资产" },
    ) as HTMLSelectElement;
    expect(assetSelect.value).toBe("__text_to_video__");
    expect(within(assetSelect).getAllByRole("option")).toHaveLength(5);
    expect(
      within(assetSelect).getByRole("option", {
        name: "不关联图片",
      }),
    ).toBeTruthy();
    expect(
      within(assetSelect).getByRole("option", {
        name: "男主项目图片",
      }),
    ).toBeTruthy();
    const processingAsset = within(assetSelect).getByRole(
      "option",
      { name: "女主处理中图片 · 处理中" },
    ) as HTMLOptionElement;
    expect(processingAsset.disabled).toBe(true);
    await user.selectOptions(
      assetSelect,
      "__text_to_video__",
    );
    expect(assetSelect.value).toBe("__text_to_video__");
    await user.selectOptions(
      assetSelect,
      "image-primary",
    );
    expect(
      within(promptEditor!).queryByLabelText(
        "分段 1 生视频提示词",
      ),
    ).toBeNull();
    await user.click(
      within(promptEditor!).getByRole("button", {
        name: "AI 生成提示词",
      }),
    );
    await waitFor(() =>
      expect(workflowPostBody("compile_video_prompts")).toEqual(
        expect.objectContaining({
          action: "compile_video_prompts",
          scriptIds: ["script-ready"],
          characterSelections: [{
            scriptId: "script-ready",
            characterName: "女主",
            assetIds: ["image-primary"],
            useTextToVideo: false,
          }],
        }),
      ));
    await user.selectOptions(
      within(promptEditor!).getByRole("combobox", {
        name: "女主关联图像资产",
      }),
      "__text_to_video__",
    );
    expect(
      (
        within(promptEditor!).getByRole("combobox", {
          name: "视频模型",
        }) as HTMLSelectElement
      ).value,
    ).toBe("seedance_2_5");
    expect(
      within(promptEditor!).getByRole("button", {
        name: "AI 生成提示词",
      }).hasAttribute("disabled"),
    ).toBe(false);
    await user.selectOptions(
      within(promptEditor!).getByRole("combobox", {
        name: "视频模型",
      }),
      "seedance_2_0",
    );
    await user.selectOptions(
      within(promptEditor!).getByRole("combobox", {
        name: "分辨率",
      }),
      "1080p",
    );
    await user.selectOptions(
      within(promptEditor!).getByRole("combobox", {
        name: "宽高比",
      }),
      "16:9",
    );
    expect(
      within(promptEditor!).getByLabelText(
        "分段 1 生视频提示词",
      ),
    ).toBeTruthy();
    fireEvent.change(
      within(promptEditor!).getByLabelText(
        "分段 1 生视频提示词",
      ),
      { target: { value: "用户校对后的生视频提示词" } },
    );
    await user.click(
      within(promptEditor!).getByRole("button", {
        name: "生成视频",
      }),
    );
    await waitFor(() =>
      expect(workflowPostBody("update_video_prompt")).toEqual({
        action: "update_video_prompt",
        scriptId: "script-ready",
        workflowEntry: "full_drama",
        segments: [{
          index: 0,
          submittedPrompt: "用户校对后的生视频提示词",
        }],
        characterSelections: [{
          scriptId: "script-ready",
          characterName: "女主",
          assetIds: [],
          useTextToVideo: true,
        }],
        generationSettings: {
          targetDuration: 15,
          videoModel: "seedance_2_0",
          videoResolution: "1080p",
          videoRatio: "16:9",
          generateSubtitles: false,
        },
      }));
    await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/project-real/workflow",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "generate_prerolls",
          scriptIds: ["script-ready"],
          workflowEntry: "full_drama",
          characterSelections: [{
            scriptId: "script-ready",
            characterName: "女主",
            assetIds: [],
            useTextToVideo: true,
          }],
        }),
      }),
    ));
    expect(
      screen
        .getByRole("tab", { name: /AI 前贴视频/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await user.click(
      screen.getByRole("tab", { name: /AI 前贴脚本/ }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "编辑脚本：关联前贴脚本",
      }),
    );
    const savedEditor = screen.getByRole("dialog", {
      name: "编辑 AI 前贴脚本",
    });
    fireEvent.change(
      within(savedEditor).getByLabelText("镜头 1 景别"),
      { target: { value: "特写，快速推进" } },
    );
    fireEvent.change(
      within(savedEditor).getByLabelText("镜头 1 画面"),
      { target: { value: "女主猛然抬头看向镜头" } },
    );
    fireEvent.change(
      within(savedEditor).getByLabelText(
        "第 1 段场景或时间文字",
      ),
      { target: { value: "三天后" } },
    );
    await user.click(
      within(savedEditor).getByRole("button", {
        name: "保存脚本",
      }),
    );
    await waitFor(() =>
      expect(workflowPostBody("update_script")).toMatchObject({
        action: "update_script",
        script: {
          shots: expect.arrayContaining([
            expect.objectContaining({
              framing: "特写，快速推进",
              shotSize: "特写",
              cameraMove: "快速推进",
              visual: "女主猛然抬头看向镜头",
              sceneCaption: "三天后",
            }),
          ]),
        },
      }));
    expect(
      workflowPostBody("update_script").script.shots[0],
    ).not.toHaveProperty(
      "startState",
    );
    expect(
      workflowPostBody("update_script").script.shots[0],
    ).not.toHaveProperty(
      "endState",
    );
    expect(
      workflowPostBody("update_script").script.shots[0],
    ).not.toHaveProperty(
      "characters",
    );
  });

  it("deletes a draft preroll script after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: { id: "script-1" } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            status: "scripts_ready",
            productionConfig: defaultProductionConfig,
            arcs: [{
              id: "arc-1",
              title: "身份反转故事线",
              pitch: "冲突升级",
              payoffType: "身份反转",
              scores: {
                relevance: 98,
                visuality: 95,
                novelty: 90,
                risk: 5,
              },
            }],
            highlights: [{
              id: "highlight-1",
              arcId: "arc-1",
              status: "completed",
              anchor: {
                openingSummary: "高光开头冲突",
                recommendedTransition: "闪白切入",
              },
            }, {
              id: "highlight-2",
              arcId: "arc-1",
              status: "completed",
              anchor: {
                openingSummary: "第二个高光开头",
                recommendedTransition: "推镜切入",
              },
            }],
            scripts: [{
              id: "script-1",
              arcId: "arc-1",
              highlightId: "highlight-1",
              title: "待删除前贴脚本",
              duration: 45,
              voiceover: "原创钩子后切入正片。",
              transition: "闪白切入",
              reviewStatus: "draft",
              videoPrompt: "竖屏视频",
              shots: [],
            }],
            renders: [],
            compositions: [],
          },
          jobs: [],
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{ id: "asset-1", durationMs: 120000 }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await user.click(
      await screen.findByRole("tab", {
        name: /AI 前贴脚本/,
      }),
    );
    const deleteButton = await screen.findByRole("button", {
      name: "删除脚本：待删除前贴脚本",
    });
    expect(deleteButton.closest(".script-version-toolbar")).toBeTruthy();
    await user.click(deleteButton);

    const dialog = screen.getByRole("dialog", {
      name: "确认删除脚本",
    });
    expect(dialog.classList.contains("script-delete-modal")).toBe(true);
    expect(within(dialog).getByText("将删除 1 个未确认脚本。")).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "确认删除" }),
    );
    expect(workflowPostBody()).toEqual({
      action: "delete_scripts",
      scriptIds: ["script-1"],
      workflowEntry: "full_drama",
    });
  });

  it("supports selected draft deletion and highlight isolation", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ data: [] }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            status: "scripts_ready",
            productionConfig: defaultProductionConfig,
            arcs: [{
              id: "arc-1",
              title: "身份反转故事线",
              pitch: "冲突升级",
              payoffType: "身份反转",
              scores: {
                relevance: 98,
                visuality: 95,
                novelty: 90,
                risk: 5,
              },
            }],
            highlights: [{
              id: "highlight-1",
              arcId: "arc-1",
              status: "completed",
              anchor: {
                openingSummary: "高光开头冲突",
                recommendedTransition: "闪白切入",
              },
            }, {
              id: "highlight-2",
              arcId: "arc-1",
              status: "completed",
              anchor: {
                openingSummary: "第二个高光开头",
                recommendedTransition: "推镜切入",
              },
            }],
            scripts: [{
              id: "draft-1",
              arcId: "arc-1",
              highlightId: "highlight-1",
              title: "草稿一",
              duration: 15,
              voiceover: "草稿一",
              transition: "闪白",
              reviewStatus: "draft",
              videoPrompt: "竖屏视频",
              shots: [],
            }, {
              id: "draft-2",
              arcId: "arc-1",
              highlightId: "highlight-1",
              title: "草稿二",
              duration: 15,
              voiceover: "草稿二",
              transition: "闪白",
              reviewStatus: "draft",
              videoPrompt: "竖屏视频",
              shots: [],
            }, {
              id: "confirmed-1",
              arcId: "arc-1",
              highlightId: "highlight-1",
              title: "已确认脚本",
              duration: 15,
              voiceover: "已确认",
              transition: "闪白",
              reviewStatus: "confirmed",
              videoPrompt: "竖屏视频",
              shots: [],
            }, {
              id: "draft-3",
              arcId: "arc-1",
              highlightId: "highlight-2",
              title: "第二高光草稿",
              duration: 15,
              voiceover: "第二高光草稿",
              transition: "推镜",
              reviewStatus: "draft",
              videoPrompt: "竖屏视频",
              shots: [],
            }],
            renders: [],
            compositions: [],
          },
          jobs: [],
        }),
      } as Response;
    });

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{ id: "asset-1", durationMs: 120000 }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await user.click(
      await screen.findByRole("tab", {
        name: /AI 前贴脚本/,
      }),
    );
    await user.click(
      await screen.findByLabelText("选择脚本 草稿一"),
    );
    expect(
      screen.getByRole("button", { name: "删除所选（1）" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /反选删除/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /删除未确认/ }),
    ).toBeNull();
    expect(
      screen.queryByText("第二高光草稿"),
    ).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "AI 生成脚本" }),
    ).toHaveLength(1);

    await user.click(
      screen.getByRole("button", {
        name: "查看高光 2：身份反转故事线",
      }),
    );
    expect(screen.queryByText("草稿一")).toBeNull();
    expect(screen.getAllByText("第二高光草稿")).toHaveLength(1);

    await user.click(
      screen.getByRole("button", {
        name: "查看高光 1：身份反转故事线",
      }),
    );
    expect(screen.getAllByText("草稿一")).toHaveLength(1);
    expect(screen.queryByText("第二高光草稿")).toBeNull();

    await user.click(
      screen.getByLabelText("选择脚本 草稿一"),
    );
    await user.click(
      screen.getByRole("button", { name: "删除所选（1）" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "确认删除脚本",
    });
    expect(
      within(dialog).getByText("将删除 1 个未确认脚本。"),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "确认删除" }),
    );

    expect(workflowPostBody()).toEqual({
      action: "delete_scripts",
      scriptIds: ["draft-1"],
      workflowEntry: "full_drama",
    });
  });

  it("shows the latest regeneration failure beside its highlight", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "scripts_ready",
          currentRunId: "run-current",
          productionConfig: defaultProductionConfig,
          arcs: [{
            id: "arc-1",
            title: "身份反转故事线",
            pitch: "冲突升级",
            payoffType: "身份反转",
            scores: {
              relevance: 98,
              visuality: 95,
              novelty: 90,
              risk: 5,
            },
          }],
          highlights: [{
            id: "highlight-1",
            arcId: "arc-1",
            status: "completed",
            anchor: {
              openingSummary: "高光开头冲突",
              recommendedTransition: "闪白切入",
            },
            result: {
              videoUrls: ["https://example.com/highlight.mp4"],
              variants: [{ duration: 120 }],
            },
          }],
          scripts: [],
          renders: [],
          compositions: [],
        },
        jobs: [{
          id: "job-failed",
          runId: "run-current",
          kind: "scripts",
          status: "failed",
          progress: 100,
          error: "Ark 前贴脚本字段不完整",
          input: { highlightId: "highlight-1" },
          createdAt: "2026-08-17T06:20:26.327Z",
          updatedAt: "2026-08-17T06:25:17.872Z",
        }],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 120000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    expect(
      await screen.findByRole("tab", {
        name: /已完成.*高光剪辑/,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "重试高光剪辑",
      }),
    ).toBeNull();

    await user.click(
      await screen.findByRole("tab", { name: /AI 前贴脚本/ }),
    );
    expect(await screen.findByText("生成失败")).toBeTruthy();
    expect(screen.getByText("最近生成失败")).toBeTruthy();
    expect(
      screen.getByText("Ark 前贴脚本字段不完整"),
    ).toBeTruthy();
  });

  it("shows persistent regeneration progress and disables duplicate submission", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "scripts_ready",
          currentRunId: "run-current",
          productionConfig: defaultProductionConfig,
          arcs: [{
            id: "arc-1",
            title: "身份反转故事线",
            pitch: "冲突升级",
            payoffType: "身份反转",
            scores: {
              relevance: 98,
              visuality: 95,
              novelty: 90,
              risk: 5,
            },
          }],
          highlights: [{
            id: "highlight-1",
            arcId: "arc-1",
            status: "completed",
            anchor: {
              openingSummary: "高光开头冲突",
              recommendedTransition: "闪白切入",
            },
            result: {
              videoUrls: ["https://example.com/highlight.mp4"],
              variants: [{ duration: 120 }],
            },
          }],
          scripts: [],
          renders: [],
          compositions: [],
        },
        jobs: [{
          id: "job-running",
          runId: "run-current",
          kind: "scripts",
          status: "running",
          progress: 42,
          input: { highlightId: "highlight-1" },
          createdAt: "2026-08-17T06:20:26.327Z",
          updatedAt: "2026-08-17T06:25:17.872Z",
        }],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 120000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await user.click(
        await screen.findByRole("tab", { name: /AI 前贴脚本/ }),
    );
    expect(
      await screen.findByText("正在生成脚本 · 42%"),
    ).toBeTruthy();
    expect(screen.getByText("脚本生成中 42%")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "AI 生成脚本" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("retries failed opening analysis from the script action", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "highlights_ready",
          currentRunId: "run-current",
          productionConfig: defaultProductionConfig,
          arcs: [{
            id: "arc-1",
            title: "冲突故事线",
            pitch: "冲突升级",
            payoffType: "反转",
            scores: {
              relevance: 90,
              visuality: 90,
              novelty: 90,
              risk: 5,
            },
          }],
          highlights: [{
            id: "highlight-1",
            arcId: "arc-1",
            status: "completed",
            result: {
              videoUrls: ["https://example.com/highlight.mp4"],
              variants: [{ duration: 120 }],
            },
          }],
          scripts: [],
          renders: [],
          compositions: [],
        },
        jobs: [{
          id: "transition-failed",
          runId: "run-current",
          kind: "transition",
          status: "failed",
          progress: 1,
          error: "视频超过 50 MiB",
          input: {
            highlightId: "highlight-1",
            autoRun: true,
          },
          createdAt: "2026-08-20T05:00:00.000Z",
          updatedAt: "2026-08-20T05:01:00.000Z",
        }],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 120000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await user.click(
      await screen.findByRole("tab", { name: /AI 前贴脚本/ }),
    );
    const retryButton = screen.getByRole("button", {
      name: "重试开头理解并生成脚本",
    });
    expect(retryButton.hasAttribute("disabled")).toBe(false);
    await user.click(retryButton);

    expect(workflowPostBody("retry")).toEqual({
      action: "retry",
      jobId: "transition-failed",
    });
  });

  it("waits only for media duration metadata before enabling production", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, jobs: [] }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{ id: "asset-1", durationMs: null }]}
        probingDurations
        sourceCount={1}
      />,
    );

    const button = await screen.findByRole("button", {
      name: "正在读取素材时长",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(
      screen.queryByText(/不执行 AI 分析/),
    ).toBeNull();
  });

  it("starts the workflow with only selected source videos", async () => {
    const user = userEvent.setup();
    render(<PipelineWorkspace projectId="project-late-moon" />);

    await user.click(await screen.findByRole("button", { name: "选择素材" }));
    const secondAsset = screen.getByLabelText("选择 2.mp4") as HTMLInputElement;
    await waitFor(() => expect(secondAsset.checked).toBe(true));
    await user.click(secondAsset);
    await user.click(screen.getByRole("button", { name: "确认使用 1 个视频" }));
    await user.type(screen.getByLabelText(/目标时长（秒）/), "100");
    await user.type(screen.getByLabelText(/输出视频数/), "3");
    await user.click(screen.getByRole("button", { name: "开始新生产" }));

    expect(workflowPostBody()).toMatchObject({
      action: "run_full",
      sourceAssetIds: ["asset-1"],
      prerollType: "story_extended",
    });
  });

  it("requires at least one selected source video", async () => {
    const user = userEvent.setup();
    render(<PipelineWorkspace projectId="project-late-moon" />);

    await user.click(await screen.findByRole("button", { name: "选择素材" }));
    await user.click(screen.getByRole("button", { name: "清空选择" }));
    expect(screen.getByRole("button", { name: "请至少选择一个视频" }).hasAttribute("disabled")).toBe(true);
  });

  it("discards unconfirmed source selection changes", async () => {
    const user = userEvent.setup();
    render(<PipelineWorkspace projectId="project-late-moon" />);

    await user.click(await screen.findByRole("button", { name: "选择素材" }));
    const secondAsset = screen.getByLabelText("选择 2.mp4") as HTMLInputElement;
    await waitFor(() => expect(secondAsset.checked).toBe(true));
    await user.click(secondAsset);
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.type(screen.getByLabelText(/目标时长（秒）/), "180");
    await user.type(screen.getByLabelText(/输出视频数/), "3");
    await user.click(screen.getByRole("button", { name: "开始新生产" }));

    expect(workflowPostBody()).toMatchObject({
      action: "run_full",
      sourceAssetIds: ["asset-1", "asset-2"],
      prerollType: "story_extended",
    });
  });

  it("supports episode batches and a full-drama upload mode", async () => {
    const user = userEvent.setup();
    render(<PipelineWorkspace projectId="project-late-moon" />);

    await user.click((await screen.findAllByRole("button", { name: "上传原始剧集" }))[0]);
    const input = await screen.findByLabelText("选择原始剧集文件");
    await user.upload(input, [
      new File(["10"], "短剧第10集.mp4", { type: "video/mp4" }),
      new File(["2"], "短剧第02集.mp4", { type: "video/mp4" }),
    ]);
    expect((screen.getByLabelText("短剧第02集.mp4 集数") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("短剧第10集.mp4 集数") as HTMLInputElement).value).toBe("10");

    await user.click(screen.getByRole("button", { name: "整剧单文件" }));
    expect(screen.getByLabelText("选择原始剧集文件").hasAttribute("multiple")).toBe(false);
  });

  it("shows all seven real production stages", async () => {
    const user = userEvent.setup();
    render(<PipelineWorkspace projectId="project-late-moon" />);

    const start = await screen.findByRole("button", {
      name: "开始新生产",
    });
    const topbar = screen.getByRole("banner", {
      name: "项目与素材操作",
    });
    const statusPanel = screen.getByRole("region", {
      name: "生产进度与阶段",
    });
    expect(topbar.classList.contains("pipeline-topbar")).toBe(true);
    expect(statusPanel.classList.contains("pipeline-status-panel")).toBe(true);
    expect(
      screen.queryByRole("region", {
        name: "当前生产上下文",
      }),
    ).toBeNull();
    expect(
      within(statusPanel).queryByText("当前任务完成度"),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "刷新流水线",
      }),
    ).toBeNull();
    expect(
      within(topbar).queryByRole("button", {
        name: "导出成片",
      }),
    ).toBeNull();
    expect(screen.getByText(/生产版本/)).toBeTruthy();
    expect(
      start.closest(".pipeline-heading-actions"),
    ).not.toBeNull();
    const headingMeta = statusPanel.querySelector(
      ".pipeline-heading-meta",
    );
    expect(
      headingMeta?.lastElementChild?.classList.contains(
        "production-version-summary",
      ),
    ).toBe(true);
    expect(
      document.querySelector(".production-plan-actions"),
    ).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    const scriptStage = screen.getByRole("tab", {
      name: /AI 前贴脚本/,
    });
    const scriptStatus = scriptStage.querySelector("small");
    expect(scriptStatus?.textContent).toMatch(
      /总数\d+ · 已确认\d+ · 运行中\d+/,
    );
    expect(scriptStatus?.getAttribute("title")).toBe(
      scriptStatus?.textContent,
    );
    expect(
      screen.queryByRole("button", { name: "正片素材" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "源素材准备" }),
    ).toBeNull();
    expect(
      within(topbar).getByRole("button", { name: "选择素材" }),
    ).toBeTruthy();
    expect(
      within(topbar).getByRole("button", { name: "上传原始剧集" }),
    ).toBeTruthy();
    expect(
      within(topbar)
        .getByRole("radio", { name: "人工" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      within(topbar).getByRole("radio", {
        name: "Agent",
      }),
    ).toBeTruthy();
    expect(
      within(topbar)
        .getByRole("link", {
          name: "返回全链路素材创作",
        })
        .getAttribute("href"),
    ).toBe("/production/full-chain");
    for (const stage of ["生产设置", "剧情理解", "爽点故事线", "高光剪辑", "AI 前贴脚本", "AI 前贴视频", "最终成片"]) {
      expect(
        screen.getByRole("tab", { name: new RegExp(stage) }),
      ).toBeTruthy();
    }
    const activeStage = screen.getByRole("tab", {
      name: /生产设置/,
    });
    const completedStage = screen.getByRole("tab", {
      name: /剧情理解/,
    });
    expect(activeStage.classList.contains("active")).toBe(true);
    expect(completedStage.classList.contains("active")).toBe(false);
    await user.click(completedStage);
    expect(completedStage.classList.contains("active")).toBe(true);
    expect(
      screen.getByRole("button", { name: "开始新生产" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: /保存生产设置|重新保存设置|保存默认设置/,
      }),
    ).toBeNull();
    expect(screen.queryByText(/旧版重复生成/)).toBeNull();
  });

  it("shows top actions only when the creative type needs them", async () => {
    const { unmount } = render(
      <PipelineWorkspace
        projectId="project-late-moon"
        workType={parseCreativeWorkType(
          "highlight-preroll",
        )}
      />,
    );

    const highlightTopbar = await screen.findByRole(
      "banner",
      {
        name: "项目与素材操作",
      },
    );
    expect(
      within(highlightTopbar).queryByRole("button", {
        name: "选择素材",
      }),
    ).toBeNull();
    expect(
      within(highlightTopbar).queryByRole("button", {
        name: "上传原始剧集",
      }),
    ).toBeNull();
    expect(
      within(highlightTopbar)
        .getByRole("radio", { name: "人工" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      within(highlightTopbar).getByRole("radio", {
        name: "Agent",
      }),
    ).toBeTruthy();

    unmount();
    render(
      <PipelineWorkspace
        projectId="project-late-moon"
        workType={parseCreativeWorkType(
          "batch-highlights",
        )}
      />,
    );

    const batchTopbar = await screen.findByRole(
      "banner",
      {
        name: "项目与素材操作",
      },
    );
    expect(
      within(batchTopbar).getByRole("button", {
        name: "选择素材",
      }),
    ).toBeTruthy();
    expect(
      within(batchTopbar).getByRole("button", {
        name: "上传原始剧集",
      }),
    ).toBeTruthy();
    expect(
      within(batchTopbar).queryByRole("radiogroup", {
        name: "执行方式",
      }),
    ).toBeNull();
  });

  it("shows only the six stages used by highlight preroll creation", async () => {
    render(
      <BatchPipelinePanel
        projectId="project-real"
        workType={parseCreativeWorkType(
          "highlight-preroll",
        )}
        hasSources={false}
        highlightAssets={[]}
        selectedAssetIds={[]}
        selectedAssets={[]}
        probingDurations={false}
        sourceCount={0}
      />,
    );

    await screen.findByText("高光前贴创作");
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    for (const stage of [
      "生产设置",
      "剧情理解",
      "爽点故事线",
      "AI 前贴脚本",
      "AI 前贴视频",
      "最终成片",
    ]) {
      expect(
        screen.getByRole("tab", {
          name: new RegExp(stage),
        }),
      ).toBeTruthy();
    }
    expect(
      screen.queryByRole("tab", {
        name: /高光剪辑/,
      }),
    ).toBeNull();
    expect(
      screen.queryByLabelText(/目标时长（秒）/),
    ).toBeNull();
    expect(
      screen.queryByRole("radiogroup", {
        name: "执行方式",
      }),
    ).toBeNull();
  });

  it("keeps batch highlight creation limited to planning and clipping", async () => {
    render(
      <BatchPipelinePanel
        projectId="project-real"
        workType={parseCreativeWorkType(
          "batch-highlights",
        )}
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[
          {
            id: "asset-1",
            durationMs: 600000,
          },
        ]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    await screen.findByText("批量高光剪辑");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(
      screen.getByRole("tab", {
        name: /生产设置/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", {
        name: /高光剪辑/,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("radio", {
        name: /Agent 自动/,
      }),
    ).toBeNull();
    expect(
      screen.queryByLabelText("AI 前贴类型"),
    ).toBeNull();
    expect(
      screen.getByLabelText(/目标时长（秒）/),
    ).toBeTruthy();
  });

  it("uses only the latest task for running, failed and retry state", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "scripts_ready",
          currentRunId: "run-current",
          arcs: [],
          highlights: [],
          scripts: [{
            id: "script-1",
            arcId: "arc-1",
            highlightId: "highlight-1",
            title: "已确认脚本",
            duration: 15,
            voiceover: "已确认",
            transition: "硬切",
            reviewStatus: "confirmed",
            videoPrompt: "竖屏视频",
            shots: [],
          }, {
            id: "script-2",
            arcId: "arc-1",
            highlightId: "highlight-1",
            title: "待确认脚本",
            duration: 15,
            voiceover: "待确认",
            transition: "硬切",
            reviewStatus: "draft",
            videoPrompt: "竖屏视频",
            shots: [],
          }],
          renders: [{
            id: "render-script-1",
            scriptId: "script-1",
            status: "completed",
            videoUrl: "https://example.com/preroll.mp4",
          }],
          compositions: [],
        },
        jobs: [{
          id: "preroll-failed-old",
          runId: "run-current",
          kind: "preroll",
          status: "failed",
          progress: 100,
          input: { scriptId: "script-1" },
          updatedAt: "2026-08-17T08:00:00.000Z",
        }, {
          id: "preroll-completed-latest",
          runId: "run-current",
          kind: "preroll",
          status: "completed",
          progress: 100,
          input: { scriptId: "script-1" },
          updatedAt: "2026-08-17T08:10:00.000Z",
        }, {
          id: "preroll-running-latest",
          runId: "run-current",
          kind: "preroll",
          status: "running",
          progress: 40,
          input: { scriptId: "script-2" },
          updatedAt: "2026-08-17T08:20:00.000Z",
        }],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{ id: "asset-1", durationMs: 120000 }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    expect(
      await screen.findByRole("tab", {
        name: /总数\s*2.*已确认\s*1.*运行中\s*0.*AI 前贴脚本/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", {
        name: /已生成\s*1.*运行中\s*1.*失败\s*0.*AI 前贴视频/,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "重试AI 前贴视频",
      }),
    ).toBeNull();
  });

  it("shows a memorable production time without repeating the input count", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "prerolls_ready",
          currentRunId: "run-current",
          currentRunCreatedAt: "2026-08-21T17:10:00.000Z",
          productionConfig: defaultProductionConfig,
          arcs: [],
          highlights: [],
          scripts: [],
          renders: [],
          compositions: [],
        },
        jobs: [],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 120000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    expect(
      await screen.findByText("2026-08-22 01:10"),
    ).toBeTruthy();
    expect(
      screen.queryByText(/输入 1 \/ 1 个源视频/),
    ).toBeNull();
  });

  it("switches to an older production batch and reloads its workspace", async () => {
    const user = userEvent.setup();
    let activeRunId = "run-newer";
    const runs = [
      {
        id: "run-newer",
        status: "scripts_ready",
        createdAt: "2026-08-21T17:10:00.000Z",
        updatedAt: "2026-08-21T17:10:00.000Z",
        sourceAssetCount: 1,
      },
      {
        id: "run-older",
        status: "scripts_ready",
        createdAt: "2026-08-20T08:00:00.000Z",
        updatedAt: "2026-08-20T08:00:00.000Z",
        sourceAssetCount: 1,
      },
    ];
    vi.mocked(fetch).mockImplementation(
      async (_input, init) => {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as {
            action: string;
            runId: string;
          };
          expect(body).toMatchObject({
            action: "activate_run",
            runId: "run-older",
          });
          activeRunId = body.runId;
          return {
            ok: true,
            json: async () => ({ data: { currentRunId: activeRunId } }),
          } as Response;
        }
        const activeRun = runs.find(
          (run) => run.id === activeRunId,
        )!;
        return {
          ok: true,
          json: async () => ({
            data: {
              status: activeRun.status,
              currentRunId: activeRun.id,
              currentRunCreatedAt: activeRun.createdAt,
              runs,
              productionConfig: defaultProductionConfig,
              arcs: [],
              highlights: [],
              scripts: [],
              renders: [],
              compositions: [],
            },
            jobs: [],
          }),
        } as Response;
      },
    );

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 120000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    const runSelect = await screen.findByRole("combobox", {
      name: "切换生产批次",
    }) as HTMLSelectElement;
    expect(runSelect.value).toBe("run-newer");

    await user.selectOptions(runSelect, "run-older");

    await waitFor(() => {
      expect(runSelect.value).toBe("run-older");
    });
  });

  it("keeps a preroll stage with failures out of the completed state", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "prerolls_ready",
          currentRunId: "run-current",
          productionConfig: defaultProductionConfig,
          arcs: [],
          highlights: [],
          scripts: [],
          renders: [{
            id: "render-1",
            scriptId: "script-1",
            status: "completed",
            videoUrl: "https://example.com/preroll.mp4",
            createdAt: "2026-08-21T17:10:00.000Z",
          }],
          compositions: [],
        },
        jobs: [{
          id: "preroll-failed",
          runId: "run-current",
          kind: "preroll",
          status: "failed",
          progress: 100,
          input: { scriptId: "script-2" },
          updatedAt: "2026-08-21T17:11:00.000Z",
        }],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 120000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    const stage = await screen.findByRole("tab", {
      name: /已生成\s*1.*失败\s*1.*AI 前贴视频/,
    });
    expect(stage.classList.contains("failed")).toBe(true);
    expect(stage.classList.contains("completed")).toBe(false);
  });

  it("keeps partially generated prerolls out of the completed state", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "prerolls_ready",
          currentRunId: "run-current",
          productionConfig: defaultProductionConfig,
          arcs: [],
          highlights: [],
          scripts: [
            {
              id: "script-1",
              reviewStatus: "confirmed",
              shots: [],
            },
            {
              id: "script-2",
              reviewStatus: "confirmed",
              shots: [],
            },
          ],
          renders: [{
            id: "render-1",
            scriptId: "script-1",
            status: "completed",
            videoUrl: "https://example.com/preroll.mp4",
            createdAt: "2026-08-21T17:10:00.000Z",
          }],
          compositions: [],
        },
        jobs: [],
      }),
    } as Response);

    render(
      <BatchPipelinePanel
        projectId="project-real"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[{
          id: "asset-1",
          durationMs: 120000,
        }]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    const stage = await screen.findByRole("tab", {
      name: /已生成\s*1.*AI 前贴视频/,
    });
    expect(stage.classList.contains("attention")).toBe(true);
    expect(stage.classList.contains("completed")).toBe(false);
  });

  it("edits a custom expression type in the production plan", async () => {
    const user = userEvent.setup();
    render(
      <BatchPipelinePanel
        projectId="project-late-moon"
        hasSources
        selectedAssetIds={["asset-1"]}
        selectedAssets={[
          { id: "asset-1", durationMs: 120000 },
        ]}
        probingDurations={false}
        sourceCount={1}
      />,
    );

    const style = await screen.findByRole("combobox", {
      name: "AI 前贴类型",
    });
    await user.click(style);
    expect(screen.getByRole("option", {
      name: "反常台词悬念",
    })).toBeTruthy();
    expect(screen.getByRole("option", {
      name: "违和奇观",
    })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "自定义" }));
    const customInput = screen.getByLabelText(
      "AI 前贴类型自定义内容",
    );
    expect(customInput).toBe(document.activeElement);
    expect(screen.queryByRole("listbox", {
      name: "AI 前贴类型选项",
    })).toBeNull();
    await user.type(customInput, "冷幽默快节奏");

    expect((customInput as HTMLInputElement).value).toBe(
      "冷幽默快节奏",
    );
    await user.click(screen.getByRole("button", {
      name: "打开AI 前贴类型选项",
    }));
    const reopenedOptions = screen.getByRole("listbox", {
      name: "AI 前贴类型选项",
    });
    expect(within(reopenedOptions).queryByRole("textbox")).toBeNull();
    expect(within(reopenedOptions).getByRole("option", {
      name: "自定义",
    })).toBeTruthy();
    expect(within(reopenedOptions).queryByRole("option", {
      name: "冷幽默快节奏",
    })).toBeNull();
  });

  it("keeps target duration and output count directly editable", async () => {
    render(<PipelineWorkspace projectId="project-late-moon" />);

    const duration = await screen.findByLabelText(/目标时长（秒）/);
    const count = screen.getByLabelText(/输出视频数/) as HTMLInputElement;

    expect((duration as HTMLInputElement).disabled).toBe(false);
    expect((duration as HTMLInputElement).readOnly).toBe(false);
    expect(count.disabled).toBe(false);
    expect(count.readOnly).toBe(false);
  });
});

describe("dashboard interactions", () => {
  it("keeps the project center focused on project management", async () => {
    const user = userEvent.setup();
    render(
      <UploadManagerProvider>
        <ProjectDashboard />
      </UploadManagerProvider>,
    );

    expect(await screen.findByRole("heading", { name: "项目列表" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "任务动态" })).toBeNull();
    expect(
      screen
        .getByText("真实短剧项目")
        .closest("a")
        ?.getAttribute("href"),
    ).toBe("/projects/project-real");
    await user.click(
      screen.getByRole("button", {
        name: /打开真实短剧项目创作菜单/,
      }),
    );
    expect(
      screen
        .getByRole("link", {
          name: "全链路素材创作",
        })
        .getAttribute("href"),
    ).toBe(
      "/projects/project-real?workType=full-chain",
    );
    for (const workType of [
      "高光前贴创作",
      "批量高光剪辑",
      "视频后期剪辑",
    ]) {
      expect(
        screen.getByRole("link", {
          name: workType,
        }),
      ).toBeTruthy();
    }
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("link", {
        name: "全链路素材创作",
      }),
    ).toBeNull();
  });

  it("uses one destination-aware picker while creating a project", async () => {
    const user = userEvent.setup();
    render(
      <UploadManagerProvider>
        <ProjectDashboard />
      </UploadManagerProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "新建短剧项目",
      }),
    );

    const uploadInput = screen.getByLabelText(
      "选择上传文件",
    );

    expect(
      uploadInput.hasAttribute("multiple"),
    ).toBe(true);
    expect(
      screen.queryByText("单个文件"),
    ).toBeNull();
    expect(
      screen.queryByText("多个文件"),
    ).toBeNull();
    expect(
      screen.queryByText("选择文件夹"),
    ).toBeNull();
    for (const target of [
      "源视频",
      "图像资产",
      "高光剪辑",
    ]) {
      expect(
        screen.getByRole("button", {
          name: target,
        }),
      ).toBeTruthy();
    }

    await user.upload(uploadInput, [
      new File(["1"], "第01集.mp4", {
        type: "video/mp4",
      }),
      new File(["2"], "第02集.mov", {
        type: "video/quicktime",
      }),
      new File(["x"], "说明.txt", {
        type: "text/plain",
      }),
    ]);

    expect(
      screen.getByText("已选择 2 个视频"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "创建并后台上传",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByText("说明.txt"),
    ).toBeNull();
  });
});
