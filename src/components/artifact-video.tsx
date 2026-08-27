"use client";

import {
  AlertTriangle,
  Film,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import type { ArtifactAvailabilityStatus } from "@/lib/artifact-availability";

type ArtifactVideoProps = Omit<
  ComponentProps<"video">,
  "src" | "onError"
> & {
  src?: string;
  artifactLabel: string;
  contextLabel?: string;
  recoverLabel?: string;
  onRecover?: () => void;
  deferred?: boolean;
  onStatusChange?: (
    status: ArtifactAvailabilityStatus,
  ) => void;
};

export function ArtifactVideo({
  src,
  artifactLabel,
  contextLabel,
  recoverLabel,
  onRecover,
  deferred = false,
  onStatusChange,
  onLoadedMetadata,
  ...videoProps
}: ArtifactVideoProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] =
    useState<ArtifactAvailabilityStatus>(
      src ? "checking" : "missing",
    );
  const [attempt, setAttempt] = useState(0);
  const [mediaMounted, setMediaMounted] =
    useState(!deferred);

  useEffect(() => {
    const next = src ? "checking" : "missing";
    setStatus(next);
    setAttempt(0);
    onStatusChange?.(next);
  }, [src]);

  useEffect(() => {
    if (!deferred) {
      setMediaMounted(true);
    }
  }, [deferred]);

  useEffect(() => {
    if (!src || mediaMounted || !deferred) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setMediaMounted(true);
      return;
    }

    const target = shellRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMediaMounted(true);
        }
      },
      {
        rootMargin: "300px 0px",
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [deferred, mediaMounted, src]);

  function updateStatus(
    next: ArtifactAvailabilityStatus,
  ) {
    setStatus(next);
    onStatusChange?.(next);
  }

  function retry() {
    setAttempt((current) => current + 1);
    updateStatus(src ? "checking" : "missing");
  }

  const unavailable =
    status === "expired" || status === "missing";

  return (
    <div
      ref={shellRef}
      className={`artifact-video-shell ${status}`}
      data-availability={status}
      data-media-mounted={mediaMounted}
    >
      {!unavailable && src && mediaMounted && (
        <video
          {...videoProps}
          key={`${src}:${attempt}`}
          src={src}
          onLoadedMetadata={(event) => {
            updateStatus("available");
            onLoadedMetadata?.(event);
          }}
          onError={() => updateStatus("expired")}
        />
      )}
      {!unavailable && src && !mediaMounted && (
        <div
          className="artifact-video-deferred"
          role="status"
        >
          <Film size={18} />
          视频接近可视区域时加载
        </div>
      )}
      {status === "checking" && mediaMounted && (
        <div
          className="artifact-video-status"
          role="status"
        >
          <LoaderCircle
            className="spin"
            size={16}
          />
          正在检查视频
        </div>
      )}
      {unavailable && (
        <div
          className="artifact-video-unavailable"
          role="alert"
        >
          <AlertTriangle size={22} />
          <div>
            <strong>
              {status === "missing"
                ? "视频产物缺失"
                : "视频地址已失效"}
            </strong>
            <small>
              {artifactLabel}
              {contextLabel
                ? ` · ${contextLabel}`
                : ""}
            </small>
            <p>
              历史产物记录仍保留，但该视频当前无法访问。
            </p>
          </div>
          <div className="artifact-video-actions">
            {src && (
              <button
                className="button ghost"
                type="button"
                onClick={retry}
              >
                <RefreshCw size={14} />
                重新检测
              </button>
            )}
            {onRecover && recoverLabel && (
              <button
                className="button primary"
                type="button"
                onClick={onRecover}
              >
                {recoverLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
