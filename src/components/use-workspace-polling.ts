"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export const WORKSPACE_POLL_INTERVAL_MS = 5_000;

export function useWorkspacePolling({
  refresh,
  hasRunningJobs,
}: {
  refresh: () => Promise<void>;
  hasRunningJobs: boolean;
}) {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const [pageVisible, setPageVisible] = useState(
    () =>
      typeof document === "undefined" ||
      document.visibilityState !== "hidden",
  );

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const runPollingRefresh = useCallback(() => {
    if (inFlightRef.current) {
      return;
    }

    let refreshResult: Promise<void>;
    try {
      refreshResult = refreshRef.current();
    } catch {
      return;
    }
    const request = Promise.resolve(refreshResult).catch(
      () => undefined,
    );
    inFlightRef.current = request;
    void request.finally(() => {
      if (inFlightRef.current === request) {
        inFlightRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    if (document.visibilityState !== "hidden") {
      runPollingRefresh();
    }
  }, [refresh, runPollingRefresh]);

  useEffect(() => {
    function handleVisibilityChange() {
      const visible =
        document.visibilityState !== "hidden";
      setPageVisible(visible);
      if (visible) {
        runPollingRefresh();
      }
    }

    function handleFocus() {
      if (document.visibilityState !== "hidden") {
        runPollingRefresh();
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      window.removeEventListener("focus", handleFocus);
    };
  }, [runPollingRefresh]);

  useEffect(() => {
    if (!pageVisible || !hasRunningJobs) {
      return;
    }

    const timer = window.setInterval(
      runPollingRefresh,
      WORKSPACE_POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [
    hasRunningJobs,
    pageVisible,
    runPollingRefresh,
  ]);
}
