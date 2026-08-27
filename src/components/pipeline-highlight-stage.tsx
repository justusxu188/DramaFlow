"use client";

import {
  ChevronDown,
  ChevronUp,
  Clapperboard,
  LoaderCircle,
  Star,
} from "lucide-react";
import { useState } from "react";

import { ArtifactVideo } from "@/components/artifact-video";
import {
  highlightVideoName,
  type PipelineHighlightAsset,
} from "@/components/pipeline-highlight-name";
import type {
  FeaturedAsset,
  PipelineArc,
  PipelineHighlight,
} from "@/components/pipeline-workspace-types";
import {
  artifactAvailabilityKey,
  artifactAvailabilitySummary,
  isArtifactUnavailable,
  type ArtifactAvailabilityMap,
  type ArtifactAvailabilityStatus,
} from "@/lib/artifact-availability";

type PipelineHighlightStageProps = {
  arcs: PipelineArc[];
  highlights: PipelineHighlight[];
  highlightAssets?: PipelineHighlightAsset[];
  featuredAssets: FeaturedAsset[];
  curatingArtifactId: string;
  onToggleFeatured: (
    kind: "highlight",
    artifactId: string,
    variantIndex: number,
  ) => void | Promise<void>;
  availability: ArtifactAvailabilityMap;
  onAvailabilityChange: (
    artifactKey: string,
    status: ArtifactAvailabilityStatus,
  ) => void;
  onRecover: () => void;
};

export function PipelineHighlightStage({
  arcs,
  highlights,
  highlightAssets = [],
  featuredAssets,
  curatingArtifactId,
  onToggleFeatured,
  availability,
  onAvailabilityChange,
  onRecover,
}: PipelineHighlightStageProps) {
  const [expanded, setExpanded] = useState(false);

  if (!highlights.length) {
    return (
      <div className="stage-empty">
        高光剪辑结果生成后将在这里展示。
      </div>
    );
  }

  const artifactKeys = highlights.flatMap((highlight) =>
    (highlight.result?.videoUrls ?? []).map((_, index) =>
      artifactAvailabilityKey(
        "highlight",
        highlight.id,
        index,
      ),
    ),
  );
  const summary = artifactAvailabilitySummary(
    artifactKeys,
    availability,
  );
  const eagerArtifactKey = artifactKeys[0];
  const needsAttention = (highlight: PipelineHighlight) =>
    highlight.status !== "completed" ||
    (highlight.result?.videoUrls ?? []).some((_, index) =>
      isArtifactUnavailable(
        availability[
          artifactAvailabilityKey(
            "highlight",
            highlight.id,
            index,
          )
        ],
      ),
    );
  const collapsibleHighlights = highlights.filter(
    (highlight, index) =>
      index >= 3 && !needsAttention(highlight),
  );
  const visibleHighlights = expanded
    ? highlights
    : highlights.filter(
        (highlight, index) =>
          index < 3 || needsAttention(highlight),
      );

  return (
    <div className="pipeline-section">
      <div className="pipeline-section-title">
        <Clapperboard size={16} />
        <strong>高光剪辑结果</strong>
        <span>
          可用 {summary.available} · 检查中{" "}
          {summary.checking} · 失效{" "}
          {summary.expired + summary.missing}
        </span>
      </div>
      <div className="media-result-list">
        {visibleHighlights.map((highlight) => {
          const fallbackTitle =
            arcs.find((arc) => arc.id === highlight.arcId)?.title ??
            "高光智剪";
          const videoName = highlightVideoName(
            highlight,
            highlightAssets,
            fallbackTitle,
          );
          return (
            <article key={highlight.id}>
              <div className="highlight-copy">
                <strong>{videoName}</strong>
                <small>
                  {highlight.anchor?.openingSummary ??
                    (highlight.status === "completed"
                      ? "正在理解高光开头"
                      : highlight.status)}
                </small>
                {highlight.anchor?.recommendedTransition && (
                  <small>
                    推荐衔接：{highlight.anchor.recommendedTransition}
                  </small>
                )}
              </div>
              {highlight.result?.videoUrls.map((videoUrl, videoIndex) => {
                const sourceArtifactId = `${highlight.id}:${videoIndex}`;
                const availabilityKey = artifactAvailabilityKey(
                  "highlight",
                  highlight.id,
                  videoIndex,
                );
                const curated = featuredAssets.some(
                  (asset) => asset.sourceArtifactId === sourceArtifactId,
                );
                return (
                  <div
                    className="pipeline-artifact-preview"
                    key={sourceArtifactId}
                  >
                    <ArtifactVideo
                      controls
                      preload="metadata"
                      src={videoUrl}
                      deferred={availabilityKey !== eagerArtifactKey}
                      aria-label={`播放高光：${videoName}`}
                      artifactLabel={`${videoName} · 高光版本 ${
                        videoIndex + 1
                      }`}
                      recoverLabel="返回生产设置"
                      onRecover={onRecover}
                      onStatusChange={(status) =>
                        onAvailabilityChange(
                          availabilityKey,
                          status,
                        )
                      }
                    />
                    <button
                      className={`button ghost curate-button ${
                        curated ? "selected" : ""
                      }`}
                      type="button"
                      disabled={curatingArtifactId === sourceArtifactId}
                      onClick={() =>
                        void onToggleFeatured(
                          "highlight",
                          highlight.id,
                          videoIndex,
                        )
                      }
                    >
                      {curatingArtifactId === sourceArtifactId ? (
                        <LoaderCircle className="spin" size={14} />
                      ) : (
                        <Star size={14} />
                      )}
                      {curated ? "取消精选" : "设为精选"}
                    </button>
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>
      {collapsibleHighlights.length > 0 && (
        <button
          className="button ghost artifact-history-toggle"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <ChevronUp size={15} />
          ) : (
            <ChevronDown size={15} />
          )}
          {expanded
            ? "收起更多高光"
            : `展开更多高光（${collapsibleHighlights.length}）`}
        </button>
      )}
    </div>
  );
}
