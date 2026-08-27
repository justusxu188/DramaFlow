// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ArtifactVideo } from "./artifact-video";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ArtifactVideo", () => {
  it("reports checking and available states", () => {
    const onStatusChange = vi.fn();
    render(
      <ArtifactVideo
        src="https://example.com/video.mp4"
        artifactLabel="前贴版本"
        aria-label="测试视频"
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByText("正在检查视频")).toBeTruthy();
    fireEvent.loadedMetadata(
      screen.getByLabelText("测试视频"),
    );
    expect(onStatusChange).toHaveBeenLastCalledWith(
      "available",
    );
    expect(
      screen.queryByText("正在检查视频"),
    ).toBeNull();
  });

  it("shows recovery actions for an expired URL", () => {
    const onRecover = vi.fn();
    const onStatusChange = vi.fn();
    render(
      <ArtifactVideo
        src="https://example.com/expired.mp4"
        artifactLabel="最终成片"
        contextLabel="批次 run-1"
        recoverLabel="返回前贴重新拼接"
        onRecover={onRecover}
        onStatusChange={onStatusChange}
        aria-label="失效视频"
      />,
    );

    fireEvent.error(screen.getByLabelText("失效视频"));
    expect(screen.getByText("视频地址已失效")).toBeTruthy();
    expect(
      screen.getByText(/批次 run-1/),
    ).toBeTruthy();
    expect(onStatusChange).toHaveBeenLastCalledWith(
      "expired",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "返回前贴重新拼接",
      }),
    );
    expect(onRecover).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", {
        name: "重新检测",
      }),
    );
    expect(screen.getByText("正在检查视频")).toBeTruthy();
  });

  it("shows a missing state without mounting video", () => {
    render(
      <ArtifactVideo artifactLabel="高光视频" />,
    );

    expect(screen.getByText("视频产物缺失")).toBeTruthy();
    expect(document.querySelector("video")).toBeNull();
  });

  it("mounts deferred media when it approaches the viewport", () => {
    let observerCallback:
      | IntersectionObserverCallback
      | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();

    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn((callback: IntersectionObserverCallback) => {
        observerCallback = callback;
        return {
          observe,
          unobserve: vi.fn(),
          disconnect,
          takeRecords: vi.fn(() => []),
          root: null,
          rootMargin: "300px 0px",
          thresholds: [0],
        };
      }),
    );

    render(
      <ArtifactVideo
        deferred
        src="https://example.com/deferred.mp4"
        artifactLabel="历史成片"
        aria-label="延迟视频"
      />,
    );

    expect(
      screen.getByText("视频接近可视区域时加载"),
    ).toBeTruthy();
    expect(document.querySelector("video")).toBeNull();
    expect(observe).toHaveBeenCalledOnce();

    act(() => {
      observerCallback?.(
        [
          {
            isIntersecting: true,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByLabelText("延迟视频")).toBeTruthy();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("mounts deferred media when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(
      <ArtifactVideo
        deferred
        src="https://example.com/fallback.mp4"
        artifactLabel="高光视频"
        aria-label="兼容视频"
      />,
    );

    expect(screen.getByLabelText("兼容视频")).toBeTruthy();
  });
});
