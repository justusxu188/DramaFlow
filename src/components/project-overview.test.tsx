// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ProjectOverview } from "./project-overview";

describe("project overview assets", () => {
  let highlightAssets: Array<{
    id: string;
    kind: "highlight";
    metadata: {
      sourceArtifactId: string;
    };
  }>;

  beforeEach(() => {
    highlightAssets = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async (_input: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "POST") {
            return {
              ok: true,
              json: async () => ({
                data: { id: "curated-1" },
              }),
            } as Response;
          }
          return {
            ok: true,
            json: async () => ({
              data: {
                id: "project-1",
                name: "轮椅留下的证言",
                genre: "都市逆袭",
                episodeCount: 10,
                assets: [{ id: "source-1" }],
                imageAssets: [],
                highlightAssets,
                prerollAssets: [],
                finalAssets: [],
                runs: [
                  {
                    id: "run-1",
                    status: "completed",
                    createdAt:
                      "2026-08-20T00:00:00.000Z",
                    arcs: [],
                    highlights: [{
                      id: "highlight-1",
                      result: {
                        videoUrls: [
                          "https://example.com/highlight.mp4",
                        ],
                      },
                      createdAt:
                        "2026-08-20T01:02:00.000Z",
                      updatedAt:
                        "2026-08-20T01:02:00.000Z",
                    }],
                    scripts: [
                      {
                        id: "script-1",
                        highlightId: "highlight-1",
                        title: "身份揭露",
                        duration: 15,
                        videoPrompt: "只属于 AI 前贴视频的提示词",
                      },
                    ],
                    renders: [
                      {
                        id: "render-1",
                        scriptId: "script-1",
                        status: "completed",
                        videoUrl:
                          "https://example.com/preroll.mp4",
                        createdAt:
                          "2026-08-20T01:00:00.000Z",
                        updatedAt:
                          "2026-08-20T01:00:00.000Z",
                      },
                    ],
                    compositions: [
                      {
                        id: "composition-1",
                        renderId: "render-1",
                        highlightId: "highlight-1",
                        status: "completed",
                        videoUrl:
                          "https://example.com/final.mp4",
                        createdAt:
                          "2026-08-20T01:05:00.000Z",
                        updatedAt:
                          "2026-08-20T01:05:00.000Z",
                      },
                    ],
                  },
                ],
              },
            }),
          } as Response;
        },
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads real production runs and promotes a selected video", async () => {
    const user = userEvent.setup();
    render(<ProjectOverview projectId="project-1" />);

    const runTitle = await screen.findByText("生产批次 1");
    expect(screen.getByText("项目素材")).toBeTruthy();
    await user.click(runTitle);
    const prerollCard = screen.getByLabelText("AI 前贴视频");
    const highlightCard =
      screen.getByLabelText("Mediakit高光视频");
    const finalCard = screen.getByLabelText("完整成片视频");
    expect(
      within(prerollCard).getByText(
        "只属于 AI 前贴视频的提示词",
      ),
    ).toBeTruthy();
    expect(
      within(finalCard).queryByText(
        "只属于 AI 前贴视频的提示词",
      ),
    ).toBeNull();
    expect(screen.queryByText("候选成片")).toBeNull();
    expect(screen.queryByText("过程产物")).toBeNull();
    expect(screen.getByText("完整成片视频")).toBeTruthy();
    expect(screen.getByText("AI 前贴视频")).toBeTruthy();
    expect(
      within(highlightCard).getByText("Mediakit高光视频"),
    ).toBeTruthy();
    expect(
      within(highlightCard).getByText(/2026\/08\/20/),
    ).toBeTruthy();
    expect(
      Array.from(
        screen.getByLabelText("关联视频 身份揭露").children,
      ),
    ).toEqual([
      prerollCard,
      highlightCard,
      finalCard,
    ]);
    expect(
      screen
        .getByLabelText("关联视频 身份揭露")
        .contains(prerollCard),
    ).toBe(true);
    expect(
      screen
        .getByLabelText("关联视频 身份揭露")
        .contains(finalCard),
    ).toBe(true);

    await user.click(
      within(prerollCard).getByRole("button", {
        name: "设为精选",
      }),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/project-1/assets",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "curate_pipeline_video",
            runId: "run-1",
            artifactType: "preroll",
            artifactId: "render-1",
          }),
        }),
      );
    });

    await user.click(
      within(highlightCard).getByRole("button", {
        name: "设为精选",
      }),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/project-1/assets",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "curate_pipeline_video",
            runId: "run-1",
            artifactType: "highlight",
            artifactId: "highlight-1",
            artifactIndex: 0,
          }),
        }),
      );
    });
  });

  it("removes a selected MediaKit highlight from the library", async () => {
    highlightAssets = [{
      id: "featured-highlight-1",
      kind: "highlight",
      metadata: {
        sourceArtifactId: "highlight-1:0",
      },
    }];
    const user = userEvent.setup();
    render(<ProjectOverview projectId="project-1" />);

    await user.click(await screen.findByText("生产批次 1"));
    const highlightCard =
      screen.getByLabelText("Mediakit高光视频");
    await user.click(
      within(highlightCard).getByRole("button", {
        name: "取消精选",
      }),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/project-1/assets",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({
            assetId: "featured-highlight-1",
            assetType: "highlight",
          }),
        }),
      );
    });
  });
});
