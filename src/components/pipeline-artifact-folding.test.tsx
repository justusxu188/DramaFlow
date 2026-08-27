// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PipelineFinalOutputsStage } from "./pipeline-final-outputs-stage";
import { PipelineHighlightStage } from "./pipeline-highlight-stage";
import { PipelinePrerollStage } from "./pipeline-preroll-stage";
import type {
  PipelineData,
  PipelineHighlight,
} from "./pipeline-workspace-types";
import { artifactAvailabilityKey } from "@/lib/artifact-availability";
import { defaultProductionConfig } from "@/lib/production-config";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function highlightFixture(index: number): PipelineHighlight {
  return {
    id: `highlight-${index}`,
    arcId: `arc-${index}`,
    status: "completed",
    result: {
      videoUrls: [`https://example.com/highlight-${index}.mp4`],
      variants: [{ duration: 60 }],
    },
  };
}

describe("pipeline artifact folding", () => {
  it("shows three highlights before expanding the remaining results", async () => {
    const user = userEvent.setup();
    const highlights = Array.from(
      { length: 5 },
      (_, index) => highlightFixture(index + 1),
    );

    render(
      <PipelineHighlightStage
        arcs={highlights.map((highlight, index) => ({
          id: highlight.arcId,
          title: `故事线 ${index + 1}`,
          pitch: "冲突升级",
          payoffType: "反转",
          scores: {
            relevance: 90,
            visuality: 90,
            novelty: 90,
            risk: 5,
          },
        }))}
        highlights={highlights}
        featuredAssets={[]}
        curatingArtifactId=""
        onToggleFeatured={vi.fn()}
        availability={{}}
        onAvailabilityChange={vi.fn()}
        onRecover={vi.fn()}
      />,
    );

    expect(screen.getByText("故事线 3")).toBeTruthy();
    expect(screen.queryByText("故事线 4")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "展开更多高光（2）",
      }),
    );
    expect(screen.getByText("故事线 4")).toBeTruthy();
    expect(screen.getByText("故事线 5")).toBeTruthy();
  });

  it("keeps an unavailable highlight visible while collapsed", () => {
    const highlights = Array.from(
      { length: 5 },
      (_, index) => highlightFixture(index + 1),
    );

    render(
      <PipelineHighlightStage
        arcs={highlights.map((highlight, index) => ({
          id: highlight.arcId,
          title: `故事线 ${index + 1}`,
          pitch: "冲突升级",
          payoffType: "反转",
          scores: {
            relevance: 90,
            visuality: 90,
            novelty: 90,
            risk: 5,
          },
        }))}
        highlights={highlights}
        featuredAssets={[]}
        curatingArtifactId=""
        onToggleFeatured={vi.fn()}
        availability={{
          [artifactAvailabilityKey(
            "highlight",
            "highlight-5",
            0,
          )]: "expired",
        }}
        onAvailabilityChange={vi.fn()}
        onRecover={vi.fn()}
      />,
    );

    expect(screen.getByText("故事线 5")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "展开更多高光（1）",
      }),
    ).toBeTruthy();
  });

  it("shows only the newest preroll result for each script", () => {
    const pipeline = {
      status: "prerolls_ready",
      characters: [],
      scripts: [
        {
          id: "script-1",
          arcId: "arc-1",
          highlightId: "highlight-1",
          title: "脚本一",
          duration: 15,
          voiceover: "旁白",
          transition: "硬切",
          reviewStatus: "confirmed",
          videoPrompt: "提示词",
          shots: [],
        },
        {
          id: "script-2",
          arcId: "arc-2",
          highlightId: "highlight-2",
          title: "脚本二",
          duration: 15,
          voiceover: "旁白",
          transition: "硬切",
          reviewStatus: "confirmed",
          videoPrompt: "提示词",
          shots: [],
        },
      ],
      renders: [
        {
          id: "render-oldest",
          scriptId: "script-1",
          status: "completed",
          videoUrl: "https://example.com/oldest.mp4",
          createdAt: "2026-08-20T08:00:00.000Z",
        },
        {
          id: "render-old",
          scriptId: "script-1",
          status: "completed",
          videoUrl: "https://example.com/old.mp4",
          createdAt: "2026-08-20T09:00:00.000Z",
        },
        {
          id: "render-new",
          scriptId: "script-1",
          status: "completed",
          videoUrl: "https://example.com/new.mp4",
          createdAt: "2026-08-20T10:00:00.000Z",
        },
        {
          id: "render-script-2",
          scriptId: "script-2",
          status: "completed",
          videoUrl: "https://example.com/script-2.mp4",
          createdAt: "2026-08-20T11:00:00.000Z",
        },
      ],
      compositions: [],
      arcs: [],
      highlights: [],
    } as PipelineData;

    const { container } = render(
      <PipelinePrerollStage
        projectId="project-1"
        pipeline={pipeline}
        jobs={[]}
        imageAssets={[]}
        featuredAssets={[]}
        curatingArtifactId=""
        productionConfig={defaultProductionConfig}
        characterSelections={{}}
        submittingVideoIds={[]}
        videoSubmitErrors={{}}
        onCharacterSelectionChange={vi.fn()}
        onCompilePrompt={vi.fn(async () => true)}
        onSavePrompt={vi.fn(async () => true)}
        onGenerate={vi.fn()}
        onToggleFeatured={vi.fn(async () => undefined)}
        onChanged={vi.fn(async () => undefined)}
        availability={{}}
        onAvailabilityChange={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.queryByText("最新生成版本")).toBeNull();
    expect(
      [...container.querySelectorAll(".preview-pane video")].map(
        (node) => node.getAttribute("src"),
      ),
    ).toEqual([
      "https://example.com/script-2.mp4",
      "https://example.com/new.mp4",
    ]);
    expect(screen.queryByText("历史视频版本")).toBeNull();
    expect(
      container.querySelector(
        'video[src="https://example.com/old.mp4"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        'video[src="https://example.com/oldest.mp4"]',
      ),
    ).toBeNull();
  });

  it("groups AI preroll videos by the selected highlight", async () => {
    const user = userEvent.setup();
    const onActiveHighlightChange = vi.fn();
    const highlights = [
      highlightFixture(1),
      highlightFixture(2),
    ];
    const pipeline = {
      status: "prerolls_ready",
      characters: [],
      arcs: highlights.map((highlight, index) => ({
        id: highlight.arcId,
        title: `故事线 ${index + 1}`,
        pitch: "",
        payoffType: "",
        scores: {
          relevance: 1,
          visuality: 1,
          novelty: 1,
          risk: 0,
        },
      })),
      highlights,
      scripts: [1, 2].map((index) => ({
        id: `script-${index}`,
        arcId: `arc-${index}`,
        highlightId: `highlight-${index}`,
        title: `脚本 ${index}`,
        duration: 15,
        voiceover: "旁白",
        transition: "硬切",
        reviewStatus: "confirmed" as const,
        videoPrompt: "提示词",
        shots: [],
      })),
      renders: [1, 2].map((index) => ({
        id: `render-${index}`,
        scriptId: `script-${index}`,
        status: "completed",
        videoUrl: `https://example.com/preroll-${index}.mp4`,
        createdAt: `2026-08-20T0${index}:00:00.000Z`,
      })),
      compositions: [],
    } as PipelineData;
    const commonProps = {
      projectId: "project-1",
      pipeline,
      jobs: [],
      imageAssets: [],
      featuredAssets: [],
      curatingArtifactId: "",
      productionConfig: defaultProductionConfig,
      characterSelections: {},
      submittingVideoIds: [],
      videoSubmitErrors: {},
      onCharacterSelectionChange: vi.fn(),
      onCompilePrompt: vi.fn(async () => true),
      onSavePrompt: vi.fn(async () => true),
      onGenerate: vi.fn(),
      onToggleFeatured: vi.fn(async () => undefined),
      onChanged: vi.fn(async () => undefined),
      availability: {},
      onAvailabilityChange: vi.fn(),
      onRegenerate: vi.fn(),
      onActiveHighlightChange,
    };
    const view = render(
      <PipelinePrerollStage
        {...commonProps}
        activeHighlightId="highlight-1"
      />,
    );

    expect(
      document.querySelector(
        '.preview-pane video[src="https://example.com/preroll-1.mp4"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(
        '.preview-pane video[src="https://example.com/preroll-2.mp4"]',
      ),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "查看高光 2：故事线 2",
      }),
    );
    expect(onActiveHighlightChange).toHaveBeenCalledWith(
      "highlight-2",
    );

    view.rerender(
      <PipelinePrerollStage
        {...commonProps}
        activeHighlightId="highlight-2"
      />,
    );
    expect(
      document.querySelector(
        '.preview-pane video[src="https://example.com/preroll-2.mp4"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(
        '.preview-pane video[src="https://example.com/preroll-1.mp4"]',
      ),
    ).toBeNull();
  });

  it("shows all final outputs by generation time without latest or history labels", () => {
    const compositions = Array.from(
      { length: 3 },
      (_, index) => ({
        id: `composition-${index + 1}`,
        renderId: `render-${index + 1}`,
        status: "completed",
        videoUrl: `https://example.com/final-${index + 1}.mp4`,
        createdAt: `2026-08-20T0${index + 1}:00:00.000Z`,
      }),
    );

    render(
      <PipelineFinalOutputsStage
        projectId="project-1"
        compositions={compositions}
        featuredAssets={[]}
        curatingArtifactId=""
        onToggleFeatured={vi.fn()}
        availability={{}}
        onAvailabilityChange={vi.fn()}
        onRecover={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.queryByText("最新成片")).toBeNull();
    expect(screen.queryByText(/历史成片/)).toBeNull();
    expect(
      [...document.querySelectorAll(".output-grid video")].map(
        (video) => video.getAttribute("src"),
      ),
    ).toEqual([
      "https://example.com/final-3.mp4",
      "https://example.com/final-2.mp4",
      "https://example.com/final-1.mp4",
    ]);
  });

  it("groups final outputs by the selected highlight", async () => {
    const user = userEvent.setup();
    const onActiveHighlightChange = vi.fn();
    const highlights = [{
      id: "highlight-1",
      arcId: "arc-1",
      status: "completed",
      result: {
        videoUrls: ["https://example.com/highlight-1.mp4"],
        variants: [{ duration: 60 }],
      },
    }, {
      id: "highlight-2",
      arcId: "arc-2",
      status: "completed",
      result: {
        videoUrls: ["https://example.com/highlight-2.mp4"],
        variants: [{ duration: 80 }],
      },
    }];
    const arcs = [{
      id: "arc-1",
      title: "第一段高光",
      pitch: "",
      payoffType: "",
      scores: {
        relevance: 1,
        visuality: 1,
        novelty: 1,
        risk: 0,
      },
    }, {
      id: "arc-2",
      title: "第二段高光",
      pitch: "",
      payoffType: "",
      scores: {
        relevance: 1,
        visuality: 1,
        novelty: 1,
        risk: 0,
      },
    }];
    const compositions = [{
      id: "composition-1",
      renderId: "render-1",
      highlightId: "highlight-1",
      status: "completed",
      videoUrl: "https://example.com/final-1.mp4",
      createdAt: "2026-08-20T01:00:00.000Z",
    }, {
      id: "composition-2",
      renderId: "render-2",
      highlightId: "highlight-2",
      status: "completed",
      videoUrl: "https://example.com/final-2.mp4",
      createdAt: "2026-08-20T02:00:00.000Z",
    }];
    const commonProps = {
      projectId: "project-1",
      compositions,
      highlights,
      arcs,
      featuredAssets: [],
      curatingArtifactId: "",
      onToggleFeatured: vi.fn(),
      availability: {},
      onAvailabilityChange: vi.fn(),
      onRecover: vi.fn(),
      onChanged: vi.fn(),
      onActiveHighlightChange,
    };
    const view = render(
      <PipelineFinalOutputsStage
        {...commonProps}
        activeHighlightId="highlight-1"
      />,
    );

    expect(
      document.querySelector(
        'video[src="https://example.com/final-1.mp4"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(
        'video[src="https://example.com/final-2.mp4"]',
      ),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "查看高光 2：第二段高光",
      }),
    );
    expect(onActiveHighlightChange).toHaveBeenCalledWith(
      "highlight-2",
    );

    view.rerender(
      <PipelineFinalOutputsStage
        {...commonProps}
        activeHighlightId="highlight-2"
      />,
    );
    expect(
      document.querySelector(
        'video[src="https://example.com/final-2.mp4"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(
        'video[src="https://example.com/final-1.mp4"]',
      ),
    ).toBeNull();
  });

  it("keeps an older-source composition visible by its generation time", () => {
    render(
      <PipelineFinalOutputsStage
        projectId="project-1"
        compositions={[{
          id: "composition-current",
          renderId: "render-current",
          status: "completed",
          videoUrl: "https://example.com/current-final.mp4",
          createdAt: "2026-08-20T01:00:00.000Z",
        }, {
          id: "composition-history",
          renderId: "render-old",
          status: "stale",
          videoUrl: "https://example.com/historical-final.mp4",
          createdAt: "2026-08-20T02:00:00.000Z",
        }]}
        featuredAssets={[]}
        curatingArtifactId=""
        onToggleFeatured={vi.fn()}
        availability={{}}
        onAvailabilityChange={vi.fn()}
        onRecover={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(
      document.querySelector(
        'video[src="https://example.com/current-final.mp4"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(
        'video[src="https://example.com/historical-final.mp4"]',
      ),
    ).toBeTruthy();
  });
});
