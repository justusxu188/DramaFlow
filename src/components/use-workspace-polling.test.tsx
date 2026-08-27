// @vitest-environment jsdom

import {
  act,
  cleanup,
  renderHook,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  WORKSPACE_POLL_INTERVAL_MS,
  useWorkspacePolling,
} from "./use-workspace-polling";

function setVisibility(
  value: DocumentVisibilityState,
) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("useWorkspacePolling", () => {
  it("loads once and remains idle without running jobs", async () => {
    const refresh = vi.fn(async () => undefined);

    renderHook(() =>
      useWorkspacePolling({
        refresh,
        hasRunningJobs: false,
      }),
    );

    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WORKSPACE_POLL_INTERVAL_MS * 3,
      );
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("polls every five seconds while jobs are running", async () => {
    const refresh = vi.fn(async () => undefined);

    renderHook(() =>
      useWorkspacePolling({
        refresh,
        hasRunningJobs: true,
      }),
    );

    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WORKSPACE_POLL_INTERVAL_MS,
      );
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and refreshes on visibility and focus", async () => {
    setVisibility("hidden");
    const refresh = vi.fn(async () => undefined);

    renderHook(() =>
      useWorkspacePolling({
        refresh,
        hasRunningJobs: true,
      }),
    );

    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WORKSPACE_POLL_INTERVAL_MS * 2,
      );
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      setVisibility("visible");
      document.dispatchEvent(
        new Event("visibilitychange"),
      );
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledOnce();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);

    await act(async () => {
      setVisibility("hidden");
      document.dispatchEvent(
        new Event("visibilitychange"),
      );
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WORKSPACE_POLL_INTERVAL_MS * 2,
      );
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not overlap unresolved polling requests", async () => {
    let resolveRefresh!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    renderHook(() =>
      useWorkspacePolling({
        refresh,
        hasRunningJobs: true,
      }),
    );

    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WORKSPACE_POLL_INTERVAL_MS * 2,
      );
    });
    expect(refresh).toHaveBeenCalledOnce();

    await act(async () => {
      resolveRefresh();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WORKSPACE_POLL_INTERVAL_MS,
      );
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
