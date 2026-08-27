"use client";

import {
  PrerollPromptEditor,
  type PromptCharacterSelection,
  type PromptGenerationSettings,
} from "@/components/preroll-prompt-editor";
import { PipelineHighlightNavigation } from "@/components/pipeline-highlight-navigation";
import type { PipelineHighlightAsset } from "@/components/pipeline-highlight-name";
import { PrerollPostProductionControls } from "@/components/preroll-post-production-controls";
import type {
  CharacterImageAsset,
  FeaturedAsset,
  PipelineData,
  PipelineJob,
} from "@/components/pipeline-workspace-types";
import {
  artifactAvailabilityKey,
  type ArtifactAvailabilityMap,
  type ArtifactAvailabilityStatus,
} from "@/lib/artifact-availability";
import type { ProductionConfig } from "@/lib/production-config";

export function PipelinePrerollStage({
  projectId,
  pipeline,
  jobs,
  imageAssets,
  highlightAssets = [],
  featuredAssets,
  curatingArtifactId,
  productionConfig,
  characterSelections,
  submittingVideoIds,
  videoSubmitErrors,
  onCharacterSelectionChange,
  onCompilePrompt,
  onSavePrompt,
  onGenerate,
  onToggleFeatured,
  onChanged,
  onComposed,
  availability,
  onAvailabilityChange,
  onRegenerate,
  activeHighlightId = "",
  onActiveHighlightChange = () => {},
}: {
  projectId: string;
  pipeline: PipelineData | null;
  jobs: PipelineJob[];
  imageAssets: CharacterImageAsset[];
  highlightAssets?: PipelineHighlightAsset[];
  featuredAssets: FeaturedAsset[];
  curatingArtifactId: string;
  productionConfig: ProductionConfig;
  characterSelections: Record<string, string>;
  submittingVideoIds: string[];
  videoSubmitErrors: Record<string, string>;
  onCharacterSelectionChange: (key: string, assetId: string) => void;
  onCompilePrompt: (
    scriptId: string,
    settings: PromptGenerationSettings,
    selections: PromptCharacterSelection[],
  ) => Promise<boolean>;
  onSavePrompt: (
    scriptId: string,
    segments: Array<{ index: number; submittedPrompt: string }>,
    selections: PromptCharacterSelection[],
    settings: PromptGenerationSettings,
  ) => Promise<boolean>;
  onGenerate: (scriptId: string) => void;
  onToggleFeatured: (renderId: string) => Promise<void>;
  onChanged: () => Promise<void>;
  onComposed?: () => void;
  availability: ArtifactAvailabilityMap;
  onAvailabilityChange: (
    artifactKey: string,
    status: ArtifactAvailabilityStatus,
  ) => void;
  onRegenerate: (scriptId: string) => void;
  activeHighlightId?: string;
  onActiveHighlightChange?: (highlightId: string) => void;
}) {
  const highlights = pipeline?.highlights ?? [];
  const resolvedActiveHighlightId =
    highlights.some(
      (highlight) => highlight.id === activeHighlightId,
    )
      ? activeHighlightId
      : highlights[0]?.id ?? "";
  const visibleScripts = resolvedActiveHighlightId
    ? (pipeline?.scripts ?? []).filter(
        (script) =>
          script.highlightId === resolvedActiveHighlightId,
      )
    : pipeline?.scripts ?? [];

  return (
    <>
      <section className="pipeline-section">
        <div className="pipeline-section-title">
          <strong>按高光查看 AI 前贴视频</strong>
          <span>{highlights.length} 个高光</span>
        </div>
        <PipelineHighlightNavigation
          highlights={highlights}
          highlightAssets={highlightAssets}
          arcs={pipeline?.arcs ?? []}
          activeHighlightId={resolvedActiveHighlightId}
          ariaLabel="AI 前贴视频高光导航"
          describeHighlight={(highlight) => {
            const scriptIds = new Set(
              (pipeline?.scripts ?? [])
                .filter(
                  (script) =>
                    script.highlightId === highlight.id,
                )
                .map((script) => script.id),
            );
            const scriptCount = scriptIds.size;
            const videoCount = (pipeline?.renders ?? []).filter(
              (render) =>
                scriptIds.has(render.scriptId) &&
                Boolean(render.videoUrl),
            ).length;
            return `${scriptCount} 个脚本 · ${videoCount} 个前贴视频`;
          }}
          onSelect={onActiveHighlightChange}
        />
      </section>
      <PrerollPromptEditor
        scripts={visibleScripts}
        jobs={jobs}
        renders={pipeline?.renders ?? []}
        characters={pipeline?.characters ?? []}
        imageAssets={imageAssets}
        productionConfig={productionConfig}
        characterSelections={characterSelections}
        submittingVideoIds={submittingVideoIds}
        videoSubmitErrors={videoSubmitErrors}
        onCharacterSelectionChange={onCharacterSelectionChange}
        onCompile={onCompilePrompt}
        onSave={onSavePrompt}
        onGenerate={onGenerate}
        renderLatestActions={({ script, render, duration }) => {
          const artifactKey = artifactAvailabilityKey(
            "preroll",
            render.id,
          );
          const curated = featuredAssets.some(
            (asset) => asset.sourceArtifactId === render.id,
          );
          return (
            <PrerollPostProductionControls
              projectId={projectId}
              renderId={render.id}
              highlightId={script.highlightId}
              videoUrl={render.videoUrl!}
              currentRevisionId={render.currentRevisionId}
              revisions={render.revisions}
              presentation="toolbar"
              knownDuration={duration}
              jobs={jobs}
              processedOperation={render.processedOperation}
              subtitleEraseConfig={render.subtitleEraseConfig}
              subtitleVerificationStatus={
                render.subtitleVerificationStatus
              }
              curated={curated}
              curating={curatingArtifactId === render.id}
              onToggleCurated={() =>
                onToggleFeatured(render.id)
              }
              onChanged={onChanged}
              onComposed={onComposed ?? (() => {})}
              subtitleStyle={productionConfig}
              availability={availability[artifactKey]}
            />
          );
        }}
        onLatestRenderStatusChange={(render, status) =>
          onAvailabilityChange(
            artifactAvailabilityKey("preroll", render.id),
            status,
          )
        }
        onLatestRenderRecover={(render) =>
          onRegenerate(render.scriptId)
        }
      />
    </>
  );
}
