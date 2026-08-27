"use client";

import { useEffect, useState } from "react";
import {
  Captions,
  Eraser,
  Gauge,
  History,
  LoaderCircle,
  RotateCcw,
  Scissors,
  Star,
} from "lucide-react";
import { ArtifactVideo } from "@/components/artifact-video";
import {
  PrerollVideoToolsDialog,
  type PrerollVideoTool,
} from "@/components/preroll-video-tools-dialog";
import type { PipelineJob } from "@/components/pipeline-workspace-types";
import type { ArtifactAvailabilityStatus } from "@/lib/artifact-availability";
import type {
  RenderRevision,
  RenderVariant,
} from "@/lib/pipeline-store";
import type { ProductionConfig } from "@/lib/production-config";

export { normalizeSubtitles } from "@/lib/subtitle-post-production";

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type Props = {
  projectId: string;
  renderId: string;
  highlightId: string;
  videoUrl: string;
  currentRevisionId?: string;
  revisions?: RenderRevision[];
  presentation?: "card" | "toolbar";
  knownDuration?: number;
  jobs?: PipelineJob[];
  processedOperation?: RenderVariant["processedOperation"];
  subtitleEraseConfig?: RenderVariant["subtitleEraseConfig"];
  subtitleVerificationStatus?: "verified" | "failed";
  versionLabel?: string;
  createdAt?: string;
  curated?: boolean;
  curating?: boolean;
  onToggleCurated: () => Promise<void>;
  onChanged: () => Promise<void>;
  onComposed?: () => void;
  availability?: ArtifactAvailabilityStatus;
  onAvailabilityChange?: (
    status: ArtifactAvailabilityStatus,
  ) => void;
  onRegenerate?: () => void;
  deferVideoLoad?: boolean;
  subtitleStyle?: Pick<
    ProductionConfig,
    | "subtitleFontType"
    | "subtitleFontSize"
    | "subtitleFontColor"
    | "subtitlePosition"
  >;
};

export function PrerollPostProductionControls({
  projectId,
  renderId,
  highlightId,
  videoUrl,
  currentRevisionId,
  revisions = [],
  presentation = "card",
  knownDuration = 0,
  jobs = [],
  processedOperation,
  subtitleEraseConfig,
  subtitleVerificationStatus,
  versionLabel,
  createdAt,
  curated,
  curating,
  onToggleCurated,
  onChanged,
  onComposed = () => {},
  availability,
  onAvailabilityChange,
  onRegenerate,
  deferVideoLoad = false,
  subtitleStyle,
}: Props) {
  const [currentUrl, setCurrentUrl] = useState(videoUrl);
  const [duration, setDuration] = useState(knownDuration);
  const [activeTool, setActiveTool] =
    useState<PrerollVideoTool | null>(null);
  const [openWhenRecognized, setOpenWhenRecognized] =
    useState(false);
  const [processing, setProcessing] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [mediaStatus, setMediaStatus] =
    useState<ArtifactAvailabilityStatus>(
      availability ?? "checking",
    );

  useEffect(() => {
    setCurrentUrl(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    if (knownDuration > 0) {
      setDuration(knownDuration);
    }
  }, [knownDuration]);

  useEffect(() => {
    setMediaStatus(availability ?? "checking");
  }, [availability]);

  const mediaUnavailable =
    mediaStatus === "expired" ||
    mediaStatus === "missing";
  const subtitleResultInvalid =
    subtitleVerificationStatus === "failed" ||
    (
      processedOperation === "add_subtitles" &&
      subtitleVerificationStatus !== "verified"
    );
  const postProductionJobs = jobs
    .filter(
      (job) =>
        job.kind === "post_production" &&
        job.input?.renderId === renderId,
    )
    .sort((left, right) =>
      String(right.updatedAt ?? right.createdAt ?? "").localeCompare(
        String(left.updatedAt ?? left.createdAt ?? ""),
      ),
    );
  const latestCurrentPostProductionJob =
    postProductionJobs.find(
      (job) => job.input?.sourceVideoUrl === currentUrl,
    );
  const activePostProductionJob =
    latestCurrentPostProductionJob &&
    ["queued", "running"].includes(
      latestCurrentPostProductionJob.status,
    )
      ? latestCurrentPostProductionJob
      : undefined;
  const failedPostProductionJob =
    latestCurrentPostProductionJob?.status === "failed"
      ? latestCurrentPostProductionJob
      : undefined;
  const completedAsrJob = postProductionJobs.find(
    (job) =>
      job.status === "completed" &&
      job.input?.operation === "asr" &&
      job.input?.sourceVideoUrl === currentUrl &&
      Array.isArray(
        (job.result as { subtitles?: unknown[] } | undefined)
          ?.subtitles,
      ),
  );
  const recognizedSubtitles =
    (
      completedAsrJob?.result as
        | { subtitles?: Array<{
            id: string;
            subtitleText: string;
            startTime: number;
            endTime: number;
            speaker?: string;
          }> }
        | undefined
    )?.subtitles ?? [];
  const activeOperation = String(
    activePostProductionJob?.input?.operation ?? "",
  );
  const activeOperationLabel =
    activeOperation === "asr"
      ? "正在识别字幕"
      : activeOperation === "erase_subtitles"
        ? "正在擦除字幕"
        : activeOperation === "add_subtitles"
          ? "正在添加字幕"
          : activeOperation === "enhance"
            ? "正在增强画质"
            : "";
  const currentRevision =
    revisions.find(
      (revision) => revision.id === currentRevisionId,
    ) ??
    [...revisions]
      .reverse()
      .find((revision) => revision.videoUrl === currentUrl);
  const currentRevisionNumber = currentRevision
    ? revisions.findIndex(
        (revision) => revision.id === currentRevision.id,
      ) + 1
    : 0;

  useEffect(() => {
    if (
      openWhenRecognized &&
      completedAsrJob &&
      recognizedSubtitles.length
    ) {
      setOpenWhenRecognized(false);
      setActiveTool("add_subtitles");
    }
  }, [
    completedAsrJob,
    openWhenRecognized,
    recognizedSubtitles.length,
  ]);

  async function enqueuePostProduction(
    operation: "asr" | PrerollVideoTool,
    input: Record<string, unknown>,
  ) {
    setError("");
    const response = await fetch(
      `/api/projects/${projectId}/post-production`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enqueue",
          operation,
          renderId,
          videoUrl: currentUrl,
          ...input,
        }),
      },
    );
    const payload = await response.json() as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "后期处理任务提交失败");
    }
    setActiveTool(null);
    await onChanged();
  }

  async function openAddSubtitles() {
    if (recognizedSubtitles.length) {
      setActiveTool("add_subtitles");
      return;
    }
    setOpenWhenRecognized(true);
    try {
      await enqueuePostProduction("asr", {
        language: "cmn-Hans-CN",
      });
    } catch (reason) {
      setOpenWhenRecognized(false);
      setError(
        reason instanceof Error
          ? reason.message
          : "字幕识别任务提交失败",
      );
    }
  }

  async function compose() {
    setProcessing("正在合成成片");
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/workflow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "compose_preroll",
            renderId,
            highlightId,
            renderVideoUrl: currentUrl,
          }),
        },
      );
      const payload = await response.json() as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "合成成片失败");
      }
      await onChanged();
      onComposed();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "合成成片失败",
      );
    } finally {
      setProcessing("");
    }
  }

  async function activateRevision(revision: RenderRevision) {
    if (revision.id === currentRevision?.id) return;
    setProcessing("正在回退视频版本");
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/post-production`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "activate_revision",
            renderId,
            revisionId: revision.id,
            currentVideoUrl: currentUrl,
          }),
        },
      );
      const payload = await response.json() as {
        data?: { videoUrl?: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "视频版本回退失败");
      }
      setCurrentUrl(payload.data?.videoUrl ?? revision.videoUrl);
      setShowVersions(false);
      setActiveTool(null);
      setMessage("已回退到所选版本，可基于该版本继续处理。");
      await onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "视频版本回退失败",
      );
    } finally {
      setProcessing("");
    }
  }

  return (
    <article
      className={`preroll-post-production ${
        presentation === "toolbar"
          ? "preroll-post-production-toolbar"
          : ""
      }`}
      aria-label={
        presentation === "toolbar"
          ? "当前视频后期处理"
          : undefined
      }
    >
      {presentation === "card" && (versionLabel || createdAt) && (
        <div className="preroll-version-label">
          {versionLabel && <span>{versionLabel}</span>}
          {createdAt && (
            <time
              className="preroll-version-time"
              dateTime={createdAt}
            >
              {formatTime(createdAt)}
            </time>
          )}
        </div>
      )}
      {presentation === "card" && (
        <div className="preroll-review-player">
          <ArtifactVideo
            src={currentUrl}
            controls
            playsInline
            preload="metadata"
            deferred={deferVideoLoad}
            artifactLabel={
              versionLabel ??
              (formatTime(createdAt) || "AI 前贴视频")
            }
            contextLabel={formatTime(createdAt)}
            recoverLabel="重新生成前贴视频"
            onRecover={onRegenerate}
            onStatusChange={(status) => {
              setMediaStatus(status);
              onAvailabilityChange?.(status);
            }}
            onLoadedMetadata={(event) =>
              setDuration(event.currentTarget.duration)
            }
          />
        </div>
      )}
      <div className="preroll-review-action-area">
        <div className="preroll-review-actions">
          {revisions.length > 0 && (
            <button
              className="button ghost"
              type="button"
              aria-expanded={showVersions}
              disabled={
                Boolean(processing) ||
                Boolean(activePostProductionJob)
              }
              onClick={() => setShowVersions((current) => !current)}
            >
              <History size={15} />
              版本记录
              {currentRevisionNumber > 0 && ` V${currentRevisionNumber}`}
            </button>
          )}
          <button
            className="button ghost"
            type="button"
            disabled={
              Boolean(processing) ||
              Boolean(activePostProductionJob) ||
              mediaUnavailable
            }
            onClick={() => setActiveTool("erase_subtitles")}
          >
            <Eraser size={15} />
            字幕擦除
          </button>
          <button
            className="button ghost"
            type="button"
            disabled={
              Boolean(processing) ||
              Boolean(activePostProductionJob) ||
              mediaUnavailable
            }
            onClick={() => void openAddSubtitles()}
          >
            <Captions size={15} />
            {recognizedSubtitles.length
              ? "校对字幕"
              : "添加字幕"}
          </button>
          <button
            className="button ghost"
            type="button"
            disabled={
              Boolean(processing) ||
              Boolean(activePostProductionJob) ||
              mediaUnavailable
            }
            onClick={() => setActiveTool("enhance")}
          >
            <Gauge size={15} />
            画质增强
          </button>
          <button
            className="button primary"
            type="button"
            disabled={
              Boolean(processing) ||
              Boolean(activePostProductionJob) ||
              mediaUnavailable ||
              subtitleResultInvalid
            }
            title={
              subtitleResultInvalid
                ? "当前字幕版本未通过画面验收"
                : undefined
            }
            onClick={() => void compose()}
          >
            <Scissors size={15} />
            合成成片
          </button>
          <button
            className={`button ghost curate-button ${
              curated ? "selected" : ""
            }`}
            type="button"
            disabled={
              Boolean(processing) ||
              Boolean(activePostProductionJob) ||
              curating
            }
            onClick={() => void onToggleCurated()}
          >
            {curating ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Star size={15} />
            )}
            {curated ? "取消精选" : "设为精选"}
          </button>
        </div>
        {showVersions && (
          <div
            className="preroll-revision-history"
            aria-label="视频版本记录"
          >
            {[...revisions].reverse().map((revision) => {
              const revisionNumber =
                revisions.findIndex(
                  (item) => item.id === revision.id,
                ) + 1;
              const isCurrent =
                revision.id === currentRevision?.id;
              return (
                <div
                  className={`preroll-revision-row ${
                    isCurrent ? "current" : ""
                  }`}
                  key={revision.id}
                >
                  <div>
                    <strong>V{revisionNumber}</strong>
                    <span>
                      {revision.operation === "generated"
                        ? "原始生成"
                        : revision.operation === "baseline"
                          ? "历史起点"
                        : revision.operation === "erase_subtitles"
                          ? "字幕擦除"
                          : revision.operation === "add_subtitles"
                            ? "添加字幕"
                            : "画质增强"}
                    </span>
                    <time dateTime={revision.createdAt}>
                      {formatTime(revision.createdAt)}
                    </time>
                  </div>
                  {isCurrent ? (
                    <span className="preroll-revision-current">
                      当前
                    </span>
                  ) : (
                    <button
                      className="button ghost compact"
                      type="button"
                      aria-label="回退到此版本"
                      title="回退到此版本"
                      onClick={() => void activateRevision(revision)}
                    >
                      <RotateCcw size={13} />
                      回退
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {processing && (
        <div className="preroll-review-status" role="status">
          <LoaderCircle className="spin" size={15} />
          {processing}
        </div>
      )}
      {activePostProductionJob && (
        <div className="preroll-review-status" role="status">
          <LoaderCircle className="spin" size={15} />
          {activeOperationLabel} ·{" "}
          {activePostProductionJob.progress ?? 0}%
        </div>
      )}
      {!activePostProductionJob && failedPostProductionJob && (
        <div className="pipeline-callout error">
          {failedPostProductionJob.error ??
            "后期处理任务失败，请重试。"}
        </div>
      )}
      {!activePostProductionJob &&
        !failedPostProductionJob &&
        processedOperation && (
          <div className="pipeline-callout success">
            {processedOperation === "add_subtitles"
              ? "字幕添加完成，当前播放为带字幕版本。"
              : processedOperation === "erase_subtitles"
                ? "字幕擦除完成，当前播放为处理后版本。"
                : "画质增强完成，当前播放为增强后版本。"}
          </div>
        )}
      {message && (
        <div className="pipeline-callout success">{message}</div>
      )}
      {error && (
        <div className="pipeline-callout error">{error}</div>
      )}
      {activeTool && (
        <PrerollVideoToolsDialog
          tool={activeTool}
          videoUrl={currentUrl}
          sourceVersionLabel={
            currentRevisionNumber > 0
              ? `V${currentRevisionNumber}`
              : "当前版本"
          }
          duration={duration}
          initialSubtitles={
            activeTool === "add_subtitles"
              ? recognizedSubtitles
              : undefined
          }
          subtitleEraseConfig={subtitleEraseConfig}
          subtitleStyle={subtitleStyle}
          onClose={() => setActiveTool(null)}
          onSubmit={enqueuePostProduction}
        />
      )}
    </article>
  );
}
