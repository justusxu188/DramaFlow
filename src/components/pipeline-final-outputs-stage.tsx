"use client";

import {
  Check,
  Download,
  LoaderCircle,
  Stamp,
  Star,
} from "lucide-react";
import { useState } from "react";
import { ArtifactVideo } from "@/components/artifact-video";
import { FinalWatermarkDialog } from "@/components/final-watermark-dialog";
import { PipelineHighlightNavigation } from "@/components/pipeline-highlight-navigation";
import type { PipelineHighlightAsset } from "@/components/pipeline-highlight-name";
import type {
  FeaturedAsset,
  PipelineData,
} from "@/components/pipeline-workspace-types";
import {
  artifactAvailabilityKey,
  artifactAvailabilitySummary,
  isArtifactUnavailable,
  type ArtifactAvailabilityMap,
  type ArtifactAvailabilityStatus,
} from "@/lib/artifact-availability";

function formatGeneratedAt(value?: string) {
  if (!value) return "生成时间未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "生成时间未记录";
  }
  const pad = (part: number) =>
    String(part).padStart(2, "0");
  return [
    `${date.getFullYear()}/${pad(
      date.getMonth() + 1,
    )}/${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(
      date.getMinutes(),
    )}:${pad(date.getSeconds())}`,
  ].join(" ");
}

export function PipelineFinalOutputsStage({
  projectId,
  compositions,
  highlights = [],
  highlightAssets = [],
  arcs = [],
  activeHighlightId = "",
  onActiveHighlightChange = () => {},
  featuredAssets,
  curatingArtifactId,
  onToggleFeatured,
  availability,
  onAvailabilityChange,
  onRecover,
  onChanged,
}: {
  projectId: string;
  compositions: PipelineData["compositions"];
  highlights?: PipelineData["highlights"];
  highlightAssets?: PipelineHighlightAsset[];
  arcs?: PipelineData["arcs"];
  activeHighlightId?: string;
  onActiveHighlightChange?: (highlightId: string) => void;
  featuredAssets: FeaturedAsset[];
  curatingArtifactId: string;
  onToggleFeatured: (compositionId: string) => void;
  availability: ArtifactAvailabilityMap;
  onAvailabilityChange: (
    artifactKey: string,
    status: ArtifactAvailabilityStatus,
  ) => void;
  onRecover: () => void;
  onChanged: () => Promise<void>;
}) {
  const [watermarkCompositionId, setWatermarkCompositionId] =
    useState("");
  const resolvedActiveHighlightId =
    highlights.some(
      (highlight) => highlight.id === activeHighlightId,
    )
      ? activeHighlightId
      : highlights[0]?.id ?? "";
  const completed = compositions
    .filter((item) => item.videoUrl)
    .sort((left, right) => {
      const statusOrder =
        Number(right.status === "completed") -
        Number(left.status === "completed");
      return statusOrder !== 0
        ? statusOrder
        : right.createdAt.localeCompare(left.createdAt);
    });

  const activeCompositions = resolvedActiveHighlightId
    ? completed.filter(
        (item) =>
          item.highlightId === resolvedActiveHighlightId,
      )
    : completed;
  const summary = artifactAvailabilitySummary(
    activeCompositions.map((item) =>
      artifactAvailabilityKey("final", item.id),
    ),
    availability,
  );

  return (
    <div className="pipeline-section final-outputs">
      <div className="pipeline-section-title">
        <Check size={16} />
        <strong>最终成片</strong>
        <span>
          可用 {summary.available} · 检查中{" "}
          {summary.checking} · 失效{" "}
          {summary.expired + summary.missing}
        </span>
      </div>
      <PipelineHighlightNavigation
        highlights={highlights}
        highlightAssets={highlightAssets}
        arcs={arcs}
        activeHighlightId={resolvedActiveHighlightId}
        ariaLabel="最终成片高光导航"
        describeHighlight={(highlight) => {
          const count = completed.filter(
            (composition) =>
              composition.highlightId === highlight.id,
          ).length;
          return `${count} 个最终成片`;
        }}
        onSelect={onActiveHighlightChange}
      />
      {activeCompositions.length ? (
        <div className="output-grid">
          {activeCompositions.map((item, index) => {
          const curated = featuredAssets.some(
            (asset) =>
              asset.sourceArtifactId === item.id,
          );
          return (
            <article
              className="pipeline-artifact-preview"
              key={item.id}
            >
              <div className="final-output-meta">
                <strong>
                  {item.sourceRenderSubtitleVerified
                    ? "字幕版前贴合成"
                    : "原始前贴合成"}
                </strong>
                <time dateTime={item.createdAt}>
                  {formatGeneratedAt(item.createdAt)}
                </time>
              </div>
              <ArtifactVideo
                src={item.videoUrl}
                controls
                playsInline
                preload="metadata"
                deferred={index > 0}
                artifactLabel={
                  item.sourceRenderSubtitleVerified
                    ? "字幕版前贴合成"
                    : "原始前贴合成"
                }
                contextLabel={formatGeneratedAt(
                  item.createdAt,
                )}
                recoverLabel="返回前贴重新拼接"
                onRecover={onRecover}
                onStatusChange={(status) =>
                  onAvailabilityChange(
                    artifactAvailabilityKey(
                      "final",
                      item.id,
                    ),
                    status,
                  )
                }
              />
              <div className="final-output-actions">
                <a
                  className="button primary"
                  href={item.videoUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={14} />
                  下载成片
                </a>
                <button
                  className="button ghost"
                  type="button"
                  disabled={isArtifactUnavailable(
                    availability[
                      artifactAvailabilityKey(
                        "final",
                        item.id,
                      )
                    ],
                  )}
                  onClick={() =>
                    setWatermarkCompositionId(item.id)
                  }
                >
                  <Stamp size={14} />
                  添加水印
                </button>
                <button
                  className={`button ghost curate-button ${
                    curated ? "selected" : ""
                  }`}
                  type="button"
                  disabled={
                    curatingArtifactId === item.id
                  }
                  onClick={() =>
                    onToggleFeatured(item.id)
                  }
                >
                  {curatingArtifactId === item.id ? (
                    <LoaderCircle
                      className="spin"
                      size={14}
                    />
                  ) : (
                    <Star size={14} />
                  )}
                  {curated ? "取消精选" : "设为精选"}
                </button>
              </div>
            </article>
          );
          })}
        </div>
      ) : (
        <div className="stage-empty">
          {resolvedActiveHighlightId
            ? "当前高光尚未生成最终成片。"
            : "AI 前贴视频与高光合成后，最终成片将在这里展示。"}
        </div>
      )}
      {watermarkCompositionId && (
        <FinalWatermarkDialog
          projectId={projectId}
          composition={
            completed.find(
              (item) =>
                item.id === watermarkCompositionId,
            )!
          }
          onClose={() => setWatermarkCompositionId("")}
          onCompleted={onChanged}
        />
      )}
    </div>
  );
}
