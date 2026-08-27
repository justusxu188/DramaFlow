import type { PipelineData } from "@/components/pipeline-workspace-types";

export type PipelineHighlightAsset = {
  id: string;
  name: string;
  sourceUrl: string;
  metadata?: {
    sourceType?: "user" | "mediakit";
  };
};

function matchingHighlightAsset(
  highlight: PipelineData["highlights"][number],
  assets: PipelineHighlightAsset[],
) {
  const sourceUrl = highlight.result?.videoUrls[0];
  return assets.find(
    (candidate) =>
      highlight.id === `highlight-upload-${candidate.id}` ||
      Boolean(
        sourceUrl && candidate.sourceUrl === sourceUrl,
      ),
  );
}

export function highlightVideoName(
  highlight: PipelineData["highlights"][number],
  assets: PipelineHighlightAsset[],
  fallback: string,
) {
  const asset = matchingHighlightAsset(highlight, assets);
  return asset?.name.trim() || fallback;
}

export function highlightNavigationTitle(
  highlight: PipelineData["highlights"][number],
  assets: PipelineHighlightAsset[],
  fallback: string,
  index: number,
) {
  const asset = matchingHighlightAsset(highlight, assets);
  const name = asset?.name.trim() || fallback;
  return asset && asset.metadata?.sourceType !== "mediakit"
    ? name
    : `高光 ${index + 1} · ${name}`;
}
