"use client";

import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Film,
  FolderClosed,
  FolderOpen,
  LoaderCircle,
  Play,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { resolveSubmittedSeedancePrompt } from "@/lib/seedance-prompt";

type PromptSegment = {
  index: number;
  duration: number;
  prompt: string;
  sound: string;
  referenceAssets: string[];
  submittedPrompt?: string;
};

type PromptPlan = {
  globalVisualStyle: string;
  characterLock: string;
  sceneLock: string;
  voiceCards?: string;
  musicLine?: string;
  soundPrinciple?: string;
  persistentText?: string;
  subtitleStyle?: string;
  negativePrompt: string;
  segments: PromptSegment[];
};

type ProjectRun = {
  id: string;
  status: string;
  createdAt: string;
  analysis?: { clips: unknown[] };
  arcs: unknown[];
  highlights: Array<{
    id: string;
    result?: {
      videoUrls?: string[];
      variants?: Array<{ duration?: number }>;
    };
    createdAt?: string;
    updatedAt?: string;
  }>;
  scripts: Array<{
    id: string;
    highlightId: string;
    title: string;
    duration: number;
    videoPrompt?: string;
    videoPromptPlan?: PromptPlan;
  }>;
  renders: Array<{
    id: string;
    scriptId: string;
    status: string;
    videoUrl?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  compositions: Array<{
    id: string;
    renderId: string;
    highlightId: string;
    status: string;
    videoUrl?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
};

type OverviewPayload = {
  project?: {
    id: string;
    name: string;
    genre: string;
    episodeCount: number;
    assets: unknown[];
    highlightAssets: HighlightAsset[];
    imageAssets: unknown[];
    prerollAssets: CuratedAsset[];
    finalAssets: CuratedAsset[];
    runs?: ProjectRun[];
  };
  runs?: ProjectRun[];
};

type CuratedAsset = {
  id: string;
  kind: "preroll_video" | "final_video";
  name: string;
  sourceUrl: string;
  metadata: {
    sourceArtifactId: string;
  };
};

type HighlightAsset = {
  id: string;
  kind: "highlight";
  metadata: {
    sourceArtifactId?: string;
  };
};

type RunOutputGroup = {
  id: string;
  render?: ProjectRun["renders"][number];
  script?: ProjectRun["scripts"][number];
  highlight?: ProjectRun["highlights"][number];
  compositions: ProjectRun["compositions"];
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function artifactTime(
  artifact: {
    createdAt?: string;
    updatedAt?: string;
  },
) {
  return artifact.updatedAt || artifact.createdAt || "";
}

function runOutputGroups(run: ProjectRun): RunOutputGroup[] {
  const displayedHighlightIds = new Set<string>();
  const renderGroups: RunOutputGroup[] = run.renders
    .filter((item) => item.videoUrl)
    .map((render) => {
      const script = run.scripts.find(
        (item) => item.id === render.scriptId,
      );
      const compositions = run.compositions
        .filter(
          (item) =>
            item.renderId === render.id &&
            item.videoUrl,
        )
        .sort((left, right) =>
          artifactTime(right).localeCompare(
            artifactTime(left),
          ),
        );
      const highlightId =
        compositions[0]?.highlightId ?? script?.highlightId;
      const highlight = run.highlights.find(
        (item) =>
          item.id === highlightId &&
          item.result?.videoUrls?.length,
      );
      if (highlight) displayedHighlightIds.add(highlight.id);
      return {
        id: render.id,
        render,
        script,
        highlight,
        compositions,
      };
    });
  const attachedCompositionIds = new Set(
    renderGroups.flatMap((group) =>
      group.compositions.map((composition) => composition.id),
    ),
  );
  const compositionOnlyGroups: RunOutputGroup[] =
    run.compositions
      .filter(
        (composition) =>
          composition.videoUrl &&
          !attachedCompositionIds.has(composition.id),
      )
      .map((composition) => {
        const script = run.scripts.find((item) =>
          composition.renderId.startsWith(
            `render-${item.id}`,
          ),
        );
        const highlight = run.highlights.find(
          (item) => item.id === composition.highlightId,
        );
        if (highlight) displayedHighlightIds.add(highlight.id);
        return {
          id: composition.id,
          script,
          highlight,
          compositions: [composition],
        };
      });
  const highlightOnlyGroups: RunOutputGroup[] = run.highlights
    .filter(
      (highlight) =>
        highlight.result?.videoUrls?.length &&
        !displayedHighlightIds.has(highlight.id),
    )
    .map((highlight) => ({
      id: highlight.id,
      highlight,
      compositions: [] as ProjectRun["compositions"],
    }));

  return [
    ...renderGroups,
    ...compositionOnlyGroups,
    ...highlightOnlyGroups,
  ].sort(
    (left, right) => {
      const leftLatest = [
        left.render,
        left.highlight,
        left.compositions[0],
      ]
        .filter(Boolean)
        .map((item) => artifactTime(item!))
        .sort()
        .at(-1) ?? "";
      const rightLatest = [
        right.render,
        right.highlight,
        right.compositions[0],
      ]
        .filter(Boolean)
        .map((item) => artifactTime(item!))
        .sort()
        .at(-1) ?? "";
      return rightLatest.localeCompare(leftLatest);
    },
  );
}

function completePrompt(plan: PromptPlan, segment: PromptSegment) {
  return resolveSubmittedSeedancePrompt({
    globalVisualStyle: plan.globalVisualStyle,
    characterLock: plan.characterLock,
    sceneLock: plan.sceneLock,
    voiceCards: plan.voiceCards,
    musicLine: plan.musicLine,
    soundPrinciple: plan.soundPrinciple,
    persistentText: plan.persistentText,
    subtitleStyle: plan.subtitleStyle,
    negativePrompt: plan.negativePrompt,
    segment,
  });
}

function VideoPromptDetails({
  script,
}: {
  script?: ProjectRun["scripts"][number];
}) {
  if (!script) return null;
  return (
    <details className="project-video-prompt">
      <summary>
        <FileText size={14} />
        <strong>{script.title}</strong>
        <small>{script.duration} 秒</small>
      </summary>
      {script.videoPromptPlan ? (
        <div>
          {script.videoPromptPlan.segments.map((segment) => (
            <article key={segment.index}>
              <header>
                <strong>
                  第 {segment.index + 1} 段 · {segment.duration} 秒
                </strong>
                <span>
                  <Play size={13} />
                  Seedance 实际提交提示词
                </span>
              </header>
              <pre>
                {completePrompt(script.videoPromptPlan!, segment)}
              </pre>
            </article>
          ))}
        </div>
      ) : (
        <pre>{script.videoPrompt || "尚未编译生视频提示词"}</pre>
      )}
    </details>
  );
}

export function ProjectOverview({
  projectId,
}: {
  projectId: string;
}) {
  const [payload, setPayload] = useState<OverviewPayload>();
  const [error, setError] = useState("");
  const [curatingId, setCuratingId] = useState("");

  const load = useCallback(async () => {
      try {
        const projectResponse = await fetch(
          `/api/projects/${projectId}?includeRuns=1`,
        );
        const projectPayload = await projectResponse.json() as {
          data?: OverviewPayload["project"];
          error?: string;
        };
        if (!projectResponse.ok || !projectPayload.data) {
          throw new Error(projectPayload.error ?? "项目加载失败");
        }
        setPayload({
          project: projectPayload.data,
          runs: projectPayload.data.runs ?? [],
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "项目加载失败");
      }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleCurated(
    runId: string,
    artifactType: "highlight" | "preroll" | "final",
    artifactId: string,
    current?: CuratedAsset | HighlightAsset,
    artifactIndex?: number,
  ) {
    const operationId =
      artifactType === "highlight"
        ? `${artifactId}:${artifactIndex ?? 0}`
        : artifactId;
    setCuratingId(operationId);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/assets`,
        current
          ? {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assetId: current.id,
                assetType: current.kind,
              }),
            }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "curate_pipeline_video",
                runId,
                artifactType,
                artifactId,
                artifactIndex,
              }),
            },
      );
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "精选状态更新失败");
      }
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "精选状态更新失败",
      );
    } finally {
      setCuratingId("");
    }
  }

  if (!payload && !error) {
    return (
      <div className="post-production-loading">
        <LoaderCircle className="spin" size={18} />
        正在读取项目档案
      </div>
    );
  }

  const project = payload?.project;
  const runs = payload?.runs ?? [];

  return (
    <div className="page project-overview-page">
      <header className="page-header project-overview-header">
        <div>
          <Link className="project-overview-back" href="/projects">
            <ArrowLeft size={16} />
            项目中心
          </Link>
          <h1>{project?.name ?? "项目档案"}</h1>
          <p className="page-subtitle">
            {project?.genre} · {project?.episodeCount ?? 0} 集 ·{" "}
            {runs.length} 个生产批次
          </p>
        </div>
      </header>

      {error && <div className="pipeline-callout error">{error}</div>}

      <section className="project-materials">
        <header>
          <div>
            <h2>项目素材</h2>
            <p>源素材和已精选视频可直接用于后续生产；全部候选过程仍保留在下方生产批次中。</p>
          </div>
        </header>
        <div className="project-overview-summary">
        <span>
          <strong>{project?.assets.length ?? 0}</strong>
          原视频
        </span>
        <span>
          <strong>{project?.imageAssets.length ?? 0}</strong>
          图像资产
        </span>
        <span>
          <strong>{project?.highlightAssets.length ?? 0}</strong>
          正式高光
        </span>
        <span>
          <strong>
            {project?.prerollAssets.length ?? 0}
          </strong>
          精选 AI 前贴
        </span>
        <span>
          <strong>{project?.finalAssets.length ?? 0}</strong>
          精选成片
        </span>
        </div>
      </section>

      <section className="project-run-list">
        <header>
          <div>
            <h2>生产批次</h2>
            <p>中间过程、候选结果、完整提示词和最终成片均保留在项目档案中。</p>
          </div>
        </header>

        {!runs.length && (
          <div className="empty-state">
            <Film size={22} />
            <strong>还没有生产批次</strong>
            <span>从项目菜单选择一种创作流程开始生产。</span>
          </div>
        )}

        {runs.map((run, index) => (
          <details className="project-run-folder" key={run.id}>
            <summary>
              <span className="library-folder-icon">
                <FolderClosed className="closed" size={18} />
                <FolderOpen className="open" size={18} />
              </span>
              <span>
                <strong>生产批次 {runs.length - index}</strong>
                <small>{formatTime(run.createdAt)} · {run.status}</small>
              </span>
              <span className="project-run-counts">
                {run.highlights.reduce(
                  (total, item) =>
                    total + (item.result?.videoUrls?.length ?? 0),
                  0,
                )} 个高光 · {run.scripts.length} 个脚本 ·{" "}
                {run.renders.filter((item) => item.videoUrl).length} 个前贴 ·{" "}
                {run.compositions.filter((item) => item.videoUrl).length} 个成片
              </span>
            </summary>

            <div className="project-run-stages">
              <span>剧情片段 <strong>{run.analysis?.clips.length ?? 0}</strong></span>
              <span>爽点故事线 <strong>{run.arcs.length}</strong></span>
              <span>AI 前贴脚本 <strong>{run.scripts.length}</strong></span>
              <span>
                未完成
                <strong>
                  {run.renders.filter((item) => item.status !== "completed").length +
                    run.compositions.filter((item) => item.status !== "completed").length}
                </strong>
              </span>
            </div>

            <div className="project-run-output-list">
              {runOutputGroups(run)
                .map(({
                  id,
                  render,
                  script,
                  highlight,
                  compositions,
                }) => {
                  const curated = project?.prerollAssets.find(
                    (item) =>
                      item.metadata.sourceArtifactId === render?.id,
                  );
                  return (
                    <section
                      className="project-video-pair"
                      aria-label={`关联视频 ${
                        script?.title ?? highlight?.id ?? id
                      }`}
                      key={id}
                    >
                      {render && (
                        <article
                          className="project-artifact preroll"
                          aria-label="AI 前贴视频"
                        >
                          <video controls preload="metadata" src={render.videoUrl} />
                          <div className="project-artifact-heading">
                            <span>
                              <strong>AI 前贴视频</strong>
                              <small>{formatTime(artifactTime(render))}</small>
                            </span>
                            <button
                              type="button"
                              className={`button ghost curate-button ${
                                curated ? "selected" : ""
                              }`}
                              disabled={curatingId === render.id}
                              onClick={() =>
                                void toggleCurated(
                                  run.id,
                                  "preroll",
                                  render.id,
                                  curated,
                                )
                              }
                            >
                              {curatingId === render.id ? (
                                <LoaderCircle className="spin" size={14} />
                              ) : (
                                <Star size={14} />
                              )}
                              {curated ? "取消精选" : "设为精选"}
                            </button>
                          </div>
                          <VideoPromptDetails script={script} />
                        </article>
                      )}
                      {highlight?.result?.videoUrls?.map(
                        (videoUrl, videoIndex) => {
                          const sourceArtifactId =
                            `${highlight.id}:${videoIndex}`;
                          const highlightCurated =
                            project?.highlightAssets.find(
                              (item) =>
                                item.metadata.sourceArtifactId ===
                                sourceArtifactId,
                            );
                          return (
                            <article
                              className="project-artifact highlight"
                              aria-label="Mediakit高光视频"
                              key={`${highlight.id}-${videoIndex}`}
                            >
                              <video
                                controls
                                preload="metadata"
                                src={videoUrl}
                              />
                              <div className="project-artifact-heading">
                                <span>
                                  <strong>Mediakit高光视频</strong>
                                  <small>
                                    {formatTime(artifactTime(highlight))}
                                  </small>
                                </span>
                                <button
                                  type="button"
                                  className={`button ghost curate-button ${
                                    highlightCurated ? "selected" : ""
                                  }`}
                                  disabled={
                                    curatingId === sourceArtifactId
                                  }
                                  onClick={() =>
                                    void toggleCurated(
                                      run.id,
                                      "highlight",
                                      highlight.id,
                                      highlightCurated,
                                      videoIndex,
                                    )
                                  }
                                >
                                  {curatingId === sourceArtifactId ? (
                                    <LoaderCircle
                                      className="spin"
                                      size={14}
                                    />
                                  ) : (
                                    <Star size={14} />
                                  )}
                                  {highlightCurated
                                    ? "取消精选"
                                    : "设为精选"}
                                </button>
                              </div>
                            </article>
                          );
                        },
                      )}
                      {compositions.map((composition) => {
                        const finalCurated =
                          project?.finalAssets.find(
                            (item) =>
                              item.metadata.sourceArtifactId ===
                              composition.id,
                          );
                        return (
                          <article
                            className="project-artifact final"
                            aria-label="完整成片视频"
                            key={composition.id}
                          >
                            <video
                              controls
                              preload="metadata"
                              src={composition.videoUrl}
                            />
                            <div className="project-artifact-heading">
                              <span>
                                <strong>完整成片视频</strong>
                                <small>
                                  {formatTime(
                                    artifactTime(composition),
                                  )}
                                </small>
                              </span>
                              <button
                                type="button"
                                className={`button ghost curate-button ${
                                  finalCurated ? "selected" : ""
                                }`}
                                disabled={
                                  curatingId === composition.id
                                }
                                onClick={() =>
                                  void toggleCurated(
                                    run.id,
                                    "final",
                                    composition.id,
                                    finalCurated,
                                  )
                                }
                              >
                                {curatingId === composition.id ? (
                                  <LoaderCircle
                                    className="spin"
                                    size={14}
                                  />
                                ) : (
                                  <Star size={14} />
                                )}
                                {finalCurated
                                  ? "取消精选"
                                  : "设为精选"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </section>
                  );
                })}
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
