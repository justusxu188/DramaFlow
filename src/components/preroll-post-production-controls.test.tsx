// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
import {
  normalizeSubtitles,
  PrerollPostProductionControls,
} from "./preroll-post-production-controls";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const body = JSON.parse(
          String(init?.body ?? "{}"),
        ) as Record<string, unknown>;
        if (url.endsWith("/post-production")) {
          if (body.action === "start") {
            return {
              ok: true,
              json: async () => ({
                data: { id: `${body.operation}-task` },
              }),
            } as Response;
          }
          return {
            ok: true,
            json: async () => ({
              data:
                body.operation === "asr"
                  ? {
                      status: "completed",
                      subtitles: [{
                        id: "subtitle-1",
                        subtitleText: "确认后再添加",
                        startTime: 0,
                        endTime: 2,
                      }],
                    }
                  : {
                      status: "completed",
                      videoUrl:
                        "https://example.com/with-subtitles.mp4",
                      subtitleVerification: {
                        status: "verified",
                        method:
                          "ffmpeg_frame_difference_v1",
                        sampleTimes: [1],
                        strongDifferenceScores: [8.5],
                        verifiedAt:
                          "2026-08-21T00:00:00.000Z",
                      },
                    },
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ data: {} }),
        } as Response;
      },
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("preroll subtitle normalization", () => {
  it("converts millisecond timestamps and keeps captions in the video", () => {
    expect(
      normalizeSubtitles([
        {
          id: "subtitle-1",
          subtitleText: "第一句字幕",
          startTime: 500,
          endTime: 2800,
        },
      ], 16),
    ).toEqual([
      {
        id: "subtitle-1",
        subtitleText: "第一句字幕",
        startTime: 0.5,
        endTime: 2.8,
      },
    ]);
  });

  it("converts obvious millisecond timestamps before metadata loads", () => {
    expect(
      normalizeSubtitles([
        {
          id: "subtitle-1",
          subtitleText: "第一句字幕",
          startTime: 500,
          endTime: 2800,
        },
      ], 0),
    ).toEqual([
      {
        id: "subtitle-1",
        subtitleText: "第一句字幕",
        startTime: 0.5,
        endTime: 2.8,
      },
    ]);
  });

  it("drops empty and out-of-range captions", () => {
    expect(
      normalizeSubtitles([
        {
          id: "empty",
          subtitleText: " ",
          startTime: 0,
          endTime: 2,
        },
        {
          id: "late",
          subtitleText: "超出视频",
          startTime: 20,
          endTime: 22,
        },
        {
          id: "valid",
          subtitleText: "有效字幕",
          startTime: 14,
          endTime: 18,
        },
      ], 16),
    ).toEqual([
      {
        id: "valid",
        subtitleText: "有效字幕",
        startTime: 14,
        endTime: 16,
      },
    ]);
  });
});

describe("preroll subtitle workflow", () => {
  it("renders latest-video actions without a duplicate player", async () => {
    const user = userEvent.setup();
    render(
      <PrerollPostProductionControls
        projectId="project-1"
        renderId="render-latest"
        highlightId="highlight-1"
        videoUrl="https://example.com/latest.mp4"
        presentation="toolbar"
        knownDuration={16}
        onToggleCurated={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText("当前视频后期处理"),
    ).toBeTruthy();
    expect(document.querySelector("video")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "字幕擦除" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "精细字幕擦除",
      }),
    ).toBeTruthy();
    const dockVideo = document.querySelector(
      '.video-tool-preview-stage video',
    );
    expect(dockVideo?.getAttribute("src")).toBe(
      "https://example.com/latest.mp4",
    );
    expect((dockVideo as HTMLVideoElement).controls).toBe(false);
    expect(
      screen.getByRole("slider", { name: "视频进度" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("slider", { name: "视频进度" })
        .getAttribute("step"),
    ).toBe("0.001");
    expect(
      screen.getByRole("button", {
        name: "后退 10 毫秒，长按连续后退",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "前进 10 毫秒，长按连续前进",
      }),
    ).toBeTruthy();
    expect(document.querySelector(".modal-backdrop")).toBeNull();

    Object.defineProperty(dockVideo!, "currentTime", {
      configurable: true,
      writable: true,
      value: 6.423,
    });
    const exactSeek = screen.getByLabelText("精确定位");
    await user.clear(exactSeek);
    await user.type(exactSeek, "0:06.427");
    await user.click(screen.getByRole("button", { name: "跳转" }));
    expect((dockVideo as HTMLVideoElement).currentTime).toBe(6.427);
    await user.click(
      screen.getByRole("button", {
        name: "前进 10 毫秒，长按连续前进",
      }),
    );
    expect((dockVideo as HTMLVideoElement).currentTime).toBe(6.437);
    await user.click(
      screen.getByRole("button", {
        name: "后退 10 毫秒，长按连续后退",
      }),
    );
    expect((dockVideo as HTMLVideoElement).currentTime).toBe(6.427);
    const forwardButton = screen.getByRole("button", {
      name: "前进 10 毫秒，长按连续前进",
    });
    vi.useFakeTimers();
    fireEvent.pointerDown(forwardButton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(440);
    });
    fireEvent.pointerUp(forwardButton);
    vi.useRealTimers();
    expect((dockVideo as HTMLVideoElement).currentTime).toBeGreaterThan(
      6.437,
    );
    (dockVideo as HTMLVideoElement).currentTime = 6.427;

    await user.selectOptions(
      screen.getByLabelText("处理范围"),
      "selected",
    );
    expect(
      screen.getByRole("button", {
        name: "将当前播放时间设为开始",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "将当前播放时间设为结束",
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByTitle("将当前播放时间设为开始"),
    );
    expect(
      (screen.getByLabelText("开始") as HTMLInputElement).value,
    ).toBe("6.427");

    await user.click(screen.getByTitle("最小化"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "精细字幕擦除 · 当前版本",
      }),
    ).toBeTruthy();
  });

  it("rolls back the current pointer to a selected revision", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <PrerollPostProductionControls
        projectId="project-1"
        renderId="render-1"
        highlightId="highlight-1"
        videoUrl="https://example.com/subtitles.mp4"
        currentRevisionId="revision-2"
        revisions={[
          {
            id: "revision-1",
            videoUrl: "https://example.com/original.mp4",
            operation: "generated",
            createdAt: "2026-08-23T10:00:00.000Z",
          },
          {
            id: "revision-2",
            parentRevisionId: "revision-1",
            videoUrl: "https://example.com/subtitles.mp4",
            operation: "add_subtitles",
            createdAt: "2026-08-23T11:00:00.000Z",
          },
        ]}
        presentation="toolbar"
        onToggleCurated={vi.fn()}
        onChanged={onChanged}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "版本记录 V2",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "回退到此版本",
      }),
    );

    const rollbackCall = vi.mocked(fetch).mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/post-production") &&
        JSON.parse(String(init?.body)).action ===
          "activate_revision",
    );
    expect(
      JSON.parse(String(rollbackCall?.[1]?.body)),
    ).toEqual({
      action: "activate_revision",
      renderId: "render-1",
      revisionId: "revision-1",
      currentVideoUrl: "https://example.com/subtitles.mp4",
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows persisted background enhancement progress", () => {
    render(
      <PrerollPostProductionControls
        projectId="project-1"
        renderId="render-latest"
        highlightId="highlight-1"
        videoUrl="https://example.com/latest.mp4"
        presentation="toolbar"
        jobs={[{
          id: "enhance-job",
          kind: "post_production",
          status: "running",
          progress: 62,
          input: {
            renderId: "render-latest",
            operation: "enhance",
            sourceVideoUrl: "https://example.com/latest.mp4",
          },
        }]}
        onToggleCurated={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("status").textContent,
    ).toContain("正在增强画质 · 62%");
    expect(
      screen.getByRole("button", { name: "画质增强" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("recognizes subtitles in background before opening the editor", async () => {
    const user = userEvent.setup();
    const onComposed = vi.fn();
    const props = {
      projectId: "project-1",
      renderId: "render-1",
      highlightId: "highlight-1",
      videoUrl: "https://example.com/original.mp4",
      onToggleCurated: vi.fn(),
      onChanged: vi.fn(),
      onComposed,
    };
    const view = render(
      <PrerollPostProductionControls
        {...props}
      />,
    );
    const video = document.querySelector("video");
    Object.defineProperty(video!, "duration", {
      configurable: true,
      value: 16,
    });
    fireEvent.loadedMetadata(video!);

    await user.click(
      screen.getByRole("button", { name: "添加字幕" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      JSON.parse(
        String(
          vi.mocked(fetch).mock.calls.find(
            ([input, init]) =>
              String(input).endsWith("/post-production") &&
              JSON.parse(String(init?.body)).action === "enqueue",
          )?.[1]?.body,
        ),
      ),
    ).toMatchObject({
      action: "enqueue",
      operation: "asr",
      renderId: "render-1",
      videoUrl: "https://example.com/original.mp4",
    });

    view.rerender(
      <PrerollPostProductionControls
        {...props}
        jobs={[{
          id: "job-asr",
          kind: "post_production",
          status: "completed",
          progress: 100,
          input: {
            renderId: "render-1",
            operation: "asr",
            sourceVideoUrl: "https://example.com/original.mp4",
          },
          result: {
            subtitles: [{
              id: "subtitle-1",
              subtitleText: "确认后再添加",
              startTime: 0,
              endTime: 2,
            }],
          },
          updatedAt: "2026-08-23T12:00:00.000Z",
        }]}
      />,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "添加字幕",
    });
    expect(
      await within(dialog).findByDisplayValue("确认后再添加"),
    ).toBeTruthy();

    await user.selectOptions(
      within(dialog).getByLabelText("前贴字幕字体"),
      "zhanku_kuaile",
    );
    fireEvent.change(
      within(dialog).getByLabelText("前贴字幕字号"),
      { target: { value: "48" } },
    );
    fireEvent.change(
      within(dialog).getByLabelText("前贴字幕颜色代码"),
      { target: { value: "#FFFFFFBF" } },
    );
    await user.selectOptions(
      within(dialog).getByLabelText("前贴字幕位置"),
      "bottom_center",
    );

    await user.click(
      within(dialog).getByRole("button", {
        name: "添加字幕",
      }),
    );
    const addSubtitleCall = vi.mocked(fetch).mock.calls.findLast(
      ([input, init]) =>
        String(input).endsWith("/post-production") &&
        JSON.parse(String(init?.body)).action === "enqueue" &&
        JSON.parse(String(init?.body)).operation ===
          "add_subtitles",
    );
    expect(
      JSON.parse(String(addSubtitleCall?.[1]?.body)),
    ).toMatchObject({
      fontType: "zhanku_kuaile",
      fontSize: 48,
      fontColor: "#FFFFFFBF",
      position: "bottom_center",
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onComposed).not.toHaveBeenCalled();
  });

  it("clips initially recognized subtitles to the erased interval", async () => {
    const user = userEvent.setup();
    render(
      <PrerollPostProductionControls
        projectId="project-1"
        renderId="render-1"
        highlightId="highlight-1"
        videoUrl="https://example.com/erased.mp4"
        knownDuration={10}
        processedOperation="erase_subtitles"
        subtitleEraseConfig={{
          rangeMode: "selected",
          segments: [{
            startTime: 5.123,
            endTime: 6.456,
          }],
          eraseRatioLocations: [],
        }}
        jobs={[{
          id: "job-asr",
          kind: "post_production",
          status: "completed",
          progress: 100,
          input: {
            renderId: "render-1",
            operation: "asr",
            sourceVideoUrl: "https://example.com/erased.mp4",
          },
          result: {
            subtitles: [
              {
                id: "subtitle-outside",
                subtitleText: "范围外字幕",
                startTime: 1,
                endTime: 2,
              },
              {
                id: "subtitle-overlap",
                subtitleText: "范围内字幕",
                startTime: 4,
                endTime: 7,
              },
            ],
          },
        }]}
        onToggleCurated={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "校对字幕" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "添加字幕",
    });
    expect(
      within(dialog).queryByDisplayValue("范围外字幕"),
    ).toBeNull();
    expect(
      within(dialog).getByDisplayValue("范围内字幕"),
    ).toBeTruthy();
    const startTimeInput = within(dialog).getByLabelText(
      "第 1 条字幕开始时间",
    ) as HTMLInputElement;
    expect(startTimeInput.value).toBe("5.123");
    const endTimeInput = within(dialog).getByLabelText(
      "第 1 条字幕结束时间",
    ) as HTMLInputElement;
    expect(endTimeInput.value).toBe("6.456");

    await user.clear(startTimeInput);
    await user.tab();
    expect(startTimeInput.value).toBe("");
    await user.type(startTimeInput, "5.123");

    await user.clear(endTimeInput);
    await user.tab();
    expect(endTimeInput.value).toBe("");
    await user.type(endTimeInput, "5.3");
    await user.click(
      within(dialog).getByRole("button", {
        name: "添加字幕",
      }),
    );
    const addSubtitleCall = vi.mocked(fetch).mock.calls.findLast(
      ([input, init]) =>
        String(input).endsWith("/post-production") &&
        JSON.parse(String(init?.body)).operation ===
          "add_subtitles",
    );
    expect(
      JSON.parse(String(addSubtitleCall?.[1]?.body)),
    ).toMatchObject({
      subtitles: [{
        subtitleText: "范围内字幕",
        startTime: 5.123,
        endTime: 5.3,
      }],
      scope: "erase_scope",
      ranges: [{
        startTime: 5.123,
        endTime: 6.456,
      }],
      operationSettings: {
        scope: "erase_scope",
        ranges: [{
          startTime: 5.123,
          endTime: 6.456,
        }],
      },
    });
  });
});
