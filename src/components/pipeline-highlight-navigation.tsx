"use client";

import { Clapperboard } from "lucide-react";
import type { PipelineData } from "@/components/pipeline-workspace-types";
import {
  highlightNavigationTitle,
  highlightVideoName,
  type PipelineHighlightAsset,
} from "@/components/pipeline-highlight-name";

export function PipelineHighlightNavigation({
  highlights,
  highlightAssets = [],
  arcs,
  activeHighlightId,
  ariaLabel,
  describeHighlight,
  onSelect,
}: {
  highlights: PipelineData["highlights"];
  highlightAssets?: PipelineHighlightAsset[];
  arcs: PipelineData["arcs"];
  activeHighlightId: string;
  ariaLabel: string;
  describeHighlight: (
    highlight: PipelineData["highlights"][number],
  ) => string;
  onSelect: (highlightId: string) => void;
}) {
  if (!highlights.length) return null;

  return (
    <nav
      className="highlight-navigation"
      aria-label={ariaLabel}
    >
      {highlights.map((highlight, index) => {
        const fallbackTitle =
          arcs.find((arc) => arc.id === highlight.arcId)?.title ??
          `高光视频 ${index + 1}`;
        const title = highlightVideoName(
          highlight,
          highlightAssets,
          fallbackTitle,
        );
        const navigationTitle = highlightNavigationTitle(
          highlight,
          highlightAssets,
          fallbackTitle,
          index,
        );
        const videoUrl = highlight.result?.videoUrls[0];
        const active = highlight.id === activeHighlightId;
        return (
          <article
            className={`highlight-navigation-item ${
              active ? "active" : ""
            }`}
            key={highlight.id}
          >
            <span className="highlight-navigation-thumbnail">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`播放高光 ${index + 1}：${title}`}
                />
              ) : (
                <Clapperboard size={20} aria-hidden="true" />
              )}
              <i>{index + 1}</i>
            </span>
            <button
              className="highlight-navigation-copy"
              type="button"
              aria-current={active ? "true" : undefined}
              aria-label={`查看高光 ${index + 1}：${title}`}
              onClick={() => onSelect(highlight.id)}
            >
              <strong>{navigationTitle}</strong>
              <small>{describeHighlight(highlight)}</small>
            </button>
          </article>
        );
      })}
    </nav>
  );
}
