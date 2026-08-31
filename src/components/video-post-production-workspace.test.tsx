// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { parseCreativeWorkType } from "@/lib/creative-work-types";
import { VideoPostProductionWorkspace } from "./video-post-production-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("video post-production workspace", () => {
  beforeEach(() => {
    const storedValues = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) =>
          storedValues.get(key) ?? null,
        setItem: (key: string, value: string) =>
          storedValues.set(key, value),
        removeItem: (key: string) =>
          storedValues.delete(key),
        clear: () => storedValues.clear(),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        const url = String(input);
        if (url === "/api/projects") {
          return {
            ok: true,
            json: async () => ({
              data: [{
                id: "project-1",
                name: "测试短剧",
                genre: "都市",
                sourceCount: 1,
              }, {
                id: "project-2",
                name: "第二项目",
                genre: "悬疑",
                sourceCount: 1,
              }],
            }),
          };
        }
        if (url.endsWith("/post-production")) {
          if (init?.method === "POST") {
            const body = JSON.parse(String(init.body)) as {
              action: "start" | "status";
              operation: string;
            };
            return {
              ok: true,
              status: 200,
              json: async () => ({
                data:
                  body.action === "start"
                    ? { id: `${body.operation}-task` }
                    : {
                        status: "completed",
                        progress: 100,
                        videoUrl:
                          `https://example.com/${body.operation}-result.mp4`,
                        ...(body.operation === "asr"
                          ? {
                              subtitles: [{
                                id: "sub-1",
                                subtitleText: "第一句字幕",
                                startTime: 1,
                                endTime: 4,
                              }],
                            }
                          : {}),
                        ...(body.operation === "add_subtitles"
                          ? {
                              subtitleVerification: {
                                status: "verified",
                                method:
                                  "ffmpeg_frame_difference_v1",
                                sampleTimes: [1.5],
                                strongDifferenceScores: [42],
                                verifiedAt:
                                  "2026-08-21T00:00:00.000Z",
                              },
                            }
                          : {}),
                      },
              }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              data: { vodWatermarkConfigured: false },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            data: {
              id: url.includes("project-2")
                ? "project-2"
                : "project-1",
              name: url.includes("project-2")
                ? "第二项目"
                : "测试短剧",
              genre: "都市",
              assets: [{
                id: "asset-1",
                name: "第1集.mp4",
                sourceUrl: "https://example.com/1.mp4",
                durationMs: 30000,
                episodeNumber: 1,
              }],
              highlightAssets: [],
              prerollAssets: [{
                id: "preroll-1",
                name: "精选前贴",
                sourceUrl:
                  "https://example.com/preroll.mp4",
                durationMs: 15000,
              }],
              finalAssets: [{
                id: "final-1",
                name: "精选成片",
                sourceUrl:
                  "https://example.com/final.mp4",
                durationMs: 90000,
              }],
            },
          }),
        };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps post-production outside the ad pipeline", async () => {
    render(
      <VideoPostProductionWorkspace
        projectId="project-1"
        workType={parseCreativeWorkType(
          "post-production",
        )}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("处理范围"),
      ).toBeTruthy();
    });
    expect(screen.getByText("字幕擦除")).toBeTruthy();
    expect(screen.getByText("裁剪与拼接")).toBeTruthy();
    expect(screen.getByText("音视频调速")).toBeTruthy();
    expect(screen.getByText("添加字幕")).toBeTruthy();
    expect(screen.queryByText("语音转字幕")).toBeNull();
    expect(screen.queryByText("视频加字幕")).toBeNull();
    expect(screen.getByText("添加明水印")).toBeTruthy();
    expect(screen.getByText("画质增强")).toBeTruthy();
    expect(
      screen.getByText("请选择需要处理的视频"),
    ).toBeTruthy();
    expect(document.querySelector("video")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /选择项目/ }),
    );
    expect(screen.getByText("原视频")).toBeTruthy();
    expect(screen.getByText("高光剪辑")).toBeTruthy();
    expect(screen.getByText("AI 前贴视频")).toBeTruthy();
    expect(screen.getByText("成片视频")).toBeTruthy();
    expect(screen.queryByText("候选成片")).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "选择 第1集.mp4",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "选择 精选前贴",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/已将 2 个视频按选择顺序加入轨道/),
      ).toBeTruthy();
    });
    const trackLabels = Array.from(
      document.querySelectorAll(
        ".video-segment-track button strong",
      ),
    ).map((item) => item.textContent);
    expect(trackLabels).toEqual([
      "第1集.mp4",
      "精选前贴",
    ]);
    fireEvent.click(
      screen.getByRole("button", {
        name: "从处理范围移除 精选前贴",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/已将 1 个视频按选择顺序加入轨道/),
      ).toBeTruthy();
    });
    expect(
      screen.getByRole("checkbox", {
        name: "选择 精选前贴",
      }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: /第二项目/,
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /选择项目/,
        }).getAttribute("aria-expanded"),
      ).toBe("true");
      expect(
        screen.getByText("第二项目", {
          selector:
            ".post-production-picker-assets header strong",
        }),
      ).toBeTruthy();
    });
    expect(
      screen
        .getByText("下载成片")
        .closest("a")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("shows the latest project task instead of a default video", async () => {
    window.localStorage.setItem(
      "frameflow:post-production:last-task:project-1",
      JSON.stringify({
        projectId: "project-1",
        taskId: "task-completed",
        operation: "enhance",
        label: "大模型画质增强",
        status: "completed",
        progress: 100,
        statusContext: {},
        videoUrl: "https://example.com/output.mp4",
        updatedAt: "2026-08-20T10:00:00.000Z",
      }),
    );

    render(
      <VideoPostProductionWorkspace
        projectId="project-1"
        workType={parseCreativeWorkType(
          "post-production",
        )}
      />,
    );

    expect(
      await screen.findByText("上次后期任务"),
    ).toBeTruthy();
    expect(
      screen.getByText("大模型画质增强 · 已完成"),
    ).toBeTruthy();
    expect(document.querySelector("video")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: /选择项目/,
      }).textContent,
    ).toContain("已选 0 个视频");
  });

  it("uses the selected final video's measured duration for the timeline", async () => {
    render(
      <VideoPostProductionWorkspace
        projectId="project-1"
        workType={parseCreativeWorkType(
          "post-production",
        )}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /选择项目/,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "选择 精选成片",
      }),
    );
    expect(
      await screen.findByText("00:00.0 / 01:30.0"),
    ).toBeTruthy();

    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    Object.defineProperty(video!, "duration", {
      configurable: true,
      value: 251,
    });
    fireEvent.loadedMetadata(video!);

    expect(
      await screen.findByText("00:00.0 / 04:11.0"),
    ).toBeTruthy();
    expect(
      screen.getAllByText("00:00.0–04:11.0"),
    ).toHaveLength(2);
  });

  it("restores the previous editing workspace for the project", async () => {
    window.localStorage.setItem(
      "frameflow:post-production:workspace:project-1",
      JSON.stringify({
        version: 1,
        projectId: "project-1",
        selectedAssetIds: ["final-1"],
        selectedAssetId: "final-1",
        measuredDurations: { "final-1": 90 },
        activeOperation: "timeline",
        duration: 90,
        playhead: 30,
        segments: [{
          id: "segment-final-1-a-30",
          start: 0,
          end: 30,
          sourceId: "final-1",
          sourceUrl:
            "https://example.com/final.mp4",
          sourceName: "精选成片",
        }, {
          id: "segment-final-1-b-30",
          start: 30,
          end: 90,
          sourceId: "final-1",
          sourceUrl:
            "https://example.com/final.mp4",
          sourceName: "精选成片",
        }],
        selectedSegmentId:
          "segment-final-1-b-30",
        history: [],
        workingUrl:
          "https://example.com/final.mp4",
        outputUrl: "",
        speed: 1,
        resolution: "1080p",
        subtitles: [],
        subtitlesConfirmed: false,
        processedClips: [],
        updatedAt: "2026-08-20T10:00:00.000Z",
      }),
    );

    render(
      <VideoPostProductionWorkspace
        projectId="project-1"
        workType={parseCreativeWorkType(
          "post-production",
        )}
      />,
    );

    expect(
      await screen.findByText("00:30.0 / 01:30.0"),
    ).toBeTruthy();
    expect(
      document.querySelectorAll(
        ".video-segment-track > button",
      ),
    ).toHaveLength(2);
    expect(
      document.querySelector(
        ".video-segment-track > button.active small",
      )?.textContent,
    ).toBe("00:30.0–01:30.0");
    expect(
      screen.getByRole("button", {
        name: /选择项目/,
      }).textContent,
    ).toContain("已选 1 个视频");
  });

  it("keeps the playhead stable across repeated splits", async () => {
    render(
      <VideoPostProductionWorkspace
        projectId="project-1"
        workType={parseCreativeWorkType(
          "post-production",
        )}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /选择项目/,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "选择 精选成片",
      }),
    );
    const playhead = screen.getByLabelText(
      "视频播放头",
    ) as HTMLInputElement;
    fireEvent.change(playhead, {
      target: { value: "30" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "在播放头切分",
      }),
    );
    expect(playhead.value).toBe("30");

    fireEvent.change(playhead, {
      target: { value: "60" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "在播放头切分",
      }),
    );

    expect(playhead.value).toBe("60");
    expect(
      Array.from(
        document.querySelectorAll(
          ".video-segment-track > button small",
        ),
      ).map((item) => item.textContent),
    ).toEqual([
      "00:00.0–00:30.0",
      "00:30.0–01:00.0",
      "01:00.0–01:30.0",
    ]);
  });

  it("processes only the selected segment and inserts the result into the timeline", async () => {
    render(
      <VideoPostProductionWorkspace
        projectId="project-1"
        workType={parseCreativeWorkType(
          "post-production",
        )}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /选择项目/,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "选择 精选成片",
      }),
    );
    await screen.findByText("00:00.0 / 01:30.0");
    fireEvent.change(
      screen.getByLabelText("视频播放头"),
      { target: { value: "30" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "在播放头切分",
      }),
    );
    const timelineButtons = document.querySelectorAll(
      ".video-segment-track > button",
    );
    expect(timelineButtons).toHaveLength(2);
    fireEvent.click(timelineButtons[1]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "画质增强",
      }),
    );
    expect(
      screen.getAllByText("00:30.0–01:30.0"),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", {
        name: "开始增强",
      }),
    );

    const result = await screen.findByLabelText("处理结果");
    expect(
      screen.getByText("精选成片-大模型画质增强"),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/project-1/post-production",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "start",
          operation: "trim",
          videoUrl: "https://example.com/final.mp4",
          startTime: 30,
          endTime: 90,
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/project-1/post-production",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "start",
          operation: "enhance",
          videoUrl:
            "https://example.com/trim-result.mp4",
          resolution: "1080p",
        }),
      }),
    );

    fireEvent.click(
      result.querySelector(
        "button[aria-label^='加入轨道']",
      )!,
    );
    expect(
      document.querySelectorAll(
        ".video-segment-track > button",
      ),
    ).toHaveLength(3);
  });

  it("concatenates the verified subtitle version, not the original clip", async () => {
    render(
      <VideoPostProductionWorkspace
        projectId="project-1"
        workType={parseCreativeWorkType(
          "post-production",
        )}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /选择项目/,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "选择 精选成片",
      }),
    );
    await screen.findByText("00:00.0 / 01:30.0");

    // Switch to the subtitle tool and run the identify → confirm → burn
    // flow, then assert the export concatenates the verified URL.
    fireEvent.click(
      screen.getByRole("button", { name: "添加字幕" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "识别语音字幕",
      }),
    );
    await screen.findByLabelText("字幕 1");
    expect(
      (screen.getByLabelText(
        "后期字幕字号",
      ) as HTMLInputElement).value,
    ).toBe("52");
    expect(
      (screen.getByLabelText(
        "后期字幕位置",
      ) as HTMLSelectElement).value,
    ).toBe("bottom_center");

    fireEvent.change(
      screen.getByLabelText("后期字幕字体"),
      { target: { value: "pm_zhengdao" } },
    );
    fireEvent.change(
      screen.getByLabelText("后期字幕字号"),
      { target: { value: "52" } },
    );
    fireEvent.change(
      screen.getByLabelText("后期字幕颜色代码"),
      { target: { value: "#F0F0F0CC" } },
    );
    fireEvent.change(
      screen.getByLabelText("后期字幕位置"),
      { target: { value: "lower_third" } },
    );

    // Before a verified burn, "裁剪并拼接" must be blocked so a
    // caption-less original can never sneak into the composition.
    const exportButton = screen.getByRole("button", {
      name: "裁剪并拼接",
    });
    expect(
      (exportButton as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "确认字幕内容",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "生成字幕视频",
      }),
    );

    await screen.findByText(
      /字幕已通过画面验收并替换到轨道/,
    );
    const addSubtitleCall = (
      fetch as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => {
      const body = call[1]?.body;
      return (
        typeof body === "string" &&
        body.includes('"operation":"add_subtitles"') &&
        body.includes('"action":"start"')
      );
    });
    expect(JSON.parse(String(addSubtitleCall?.[1]?.body))).toMatchObject({
      fontType: "pm_zhengdao",
      fontSize: 52,
      fontColor: "#F0F0F0CC",
      position: "lower_third",
    });
    await waitFor(() => {
      expect(
        (
          screen.getByRole("button", {
            name: "裁剪并拼接",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    (fetch as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(
      screen.getByRole("button", {
        name: "裁剪并拼接",
      }),
    );

    // The trim that feeds the concat must reference the verified
    // add_subtitles output, not the original source URL.
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/project-1/post-production",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "start",
            operation: "trim",
            videoUrl:
              "https://example.com/add_subtitles-result.mp4",
            startTime: 0,
            endTime: 90,
          }),
        }),
      );
    });
    const trimCalls = (
      fetch as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => {
      const body = call[1]?.body;
      return (
        typeof body === "string" &&
        body.includes('"operation":"trim"')
      );
    });
    for (const call of trimCalls) {
      expect(call[1]?.body).not.toContain(
        "https://example.com/final.mp4",
      );
    }
  });
});
