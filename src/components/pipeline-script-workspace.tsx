"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clapperboard,
  Edit3,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { PipelineScriptDetails } from "@/components/pipeline-script-details";
import { PipelineScriptEditorModal } from "@/components/pipeline-script-editor-modal";
import {
  highlightNavigationTitle,
  highlightVideoName,
  type PipelineHighlightAsset,
} from "@/components/pipeline-highlight-name";
import type {
  PipelineData,
  PipelineJob,
  PipelineScript,
} from "@/components/pipeline-workspace-types";
import type { ProductionConfig } from "@/lib/production-config";

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

function latestJobByInputId(
  jobs: PipelineJob[],
  kind: string,
  inputKey: string,
) {
  const result = new Map<string, PipelineJob>();
  jobs
    .filter((job) => job.kind === kind)
    .forEach((job) => {
      const value = job.input?.[inputKey];
      const id = typeof value === "string" ? value : "";
      if (!id) return;
      const current = result.get(id);
      const currentTime =
        current?.updatedAt ?? current?.createdAt ?? "";
      const candidateTime =
        job.updatedAt ?? job.createdAt ?? "";
      if (!current || candidateTime >= currentTime) {
        result.set(id, job);
      }
    });
  return result;
}

function sourceAssetIdFromHighlightId(highlightId: string) {
  const prefix = "highlight-upload-";
  return highlightId.startsWith(prefix)
    ? highlightId.slice(prefix.length)
    : "";
}

function highlightPreparationCopy(
  highlight: PipelineData["highlights"][number],
  transitionJob?: PipelineJob,
  arcJob?: PipelineJob,
) {
  if (highlight.anchor?.openingSummary) {
    return {
      summary: highlight.anchor.openingSummary,
      empty: "尚未生成关联脚本",
      failed: false,
    };
  }
  if (transitionJob?.status === "failed") {
    return {
      summary: `开头理解失败：${
        transitionJob.error ?? "任务执行失败"
      }`,
      empty: "开头理解失败，暂时无法生成脚本",
      failed: true,
    };
  }
  if (transitionJob?.status === "running") {
    return {
      summary: `正在理解开头 · ${transitionJob.progress}%`,
      empty: "高光开头理解完成后可生成脚本",
      failed: false,
    };
  }
  if (transitionJob?.status === "queued") {
    return {
      summary: "等待理解开头",
      empty: "高光开头理解完成后可生成脚本",
      failed: false,
    };
  }
  if (arcJob?.status === "failed") {
    return {
      summary: `爽点故事线生成失败：${
        arcJob.error ?? "任务执行失败"
      }`,
      empty: "爽点故事线生成失败，暂时无法生成脚本",
      failed: true,
    };
  }
  if (
    arcJob &&
    ["queued", "running"].includes(arcJob.status)
  ) {
    return {
      summary: `正在生成爽点故事线 · ${arcJob.progress}%`,
      empty: "爽点故事线完成后可生成脚本",
      failed: false,
    };
  }
  return {
    summary: highlight.arcId
      ? "等待理解开头"
      : "尚未生成爽点故事线",
    empty: highlight.arcId
      ? "高光开头理解完成后可生成脚本"
      : "爽点故事线生成后可生成脚本",
    failed: false,
  };
}

export function PipelineScriptWorkspace({
  pipeline,
  highlightAssets = [],
  currentJobs,
  effectiveCurrentJobs,
  productionConfig,
  activeHighlightId,
  selectedScriptIds,
  confirmingScripts,
  regeneratingHighlightId,
  savingScript,
  onActiveHighlightChange,
  onSelectedScriptIdsChange,
  onRequestScriptDeletion,
  onGenerateOrRetryScripts,
  onConfirmSelectedScripts,
  onConfirmScript,
  onGoToPrerolls,
  onGoToStoryArcs,
  onSaveScript,
}: {
  pipeline: PipelineData;
  highlightAssets?: PipelineHighlightAsset[];
  currentJobs: PipelineJob[];
  effectiveCurrentJobs: PipelineJob[];
  productionConfig: ProductionConfig;
  activeHighlightId: string;
  selectedScriptIds: string[];
  confirmingScripts: boolean;
  regeneratingHighlightId: string;
  savingScript: boolean;
  onActiveHighlightChange: (highlightId: string) => void;
  onSelectedScriptIdsChange: (scriptIds: string[]) => void;
  onRequestScriptDeletion: (
    scriptIds: string[],
    summary: string,
  ) => void;
  onGenerateOrRetryScripts: () => void;
  onConfirmSelectedScripts: () => void;
  onConfirmScript: (scriptId: string) => void;
  onGoToPrerolls: (scriptId: string) => void;
  onGoToStoryArcs: () => void;
  onSaveScript: (
    script: PipelineScript,
  ) => Promise<boolean>;
}) {
  const [expandedScriptIds, setExpandedScriptIds] =
    useState<string[]>([]);
  const [pendingGeneratedScripts, setPendingGeneratedScripts] =
    useState<{
      highlightId: string;
      existingScriptIds: string[];
    } | null>(null);
  const [editingScript, setEditingScript] =
    useState<PipelineScript | null>(null);
  const latestScriptJobByHighlight = latestJobByInputId(
    effectiveCurrentJobs,
    "scripts",
    "highlightId",
  );
  const latestTransitionJobByHighlight =
    latestJobByInputId(
      effectiveCurrentJobs,
      "transition",
      "highlightId",
    );
  const latestArcJobBySourceAsset =
    latestJobByInputId(
      effectiveCurrentJobs,
      "mine_arcs",
      "sourceHighlightAssetId",
    );
  const activeHighlight =
    pipeline.highlights.find(
      (highlight) => highlight.id === activeHighlightId,
    ) ?? pipeline.highlights[0];
  const resolvedActiveHighlightId =
    activeHighlight?.id ?? "";
  const activeHighlightScripts = pipeline.scripts.filter(
    (script) =>
      script.highlightId === resolvedActiveHighlightId,
  );
  const activeDraftScriptIds = activeHighlightScripts
    .filter(
      (script) =>
        (script.reviewStatus ?? "draft") === "draft",
    )
    .map((script) => script.id);
  const activeSelectedDraftIds =
    activeDraftScriptIds.filter((id) =>
      selectedScriptIds.includes(id),
    );
  const activeLatestScriptJob = currentJobs
    .filter(
      (job) =>
        job.kind === "scripts" &&
        job.input?.highlightId ===
          resolvedActiveHighlightId,
    )
    .sort((left, right) =>
      String(
        right.createdAt ?? right.updatedAt ?? "",
      ).localeCompare(
        String(
          left.createdAt ?? left.updatedAt ?? "",
        ),
      ),
    )[0];
  const activeLatestTransitionJob =
    latestTransitionJobByHighlight.get(
      resolvedActiveHighlightId,
    );
  const activeLatestArcJob =
    latestArcJobBySourceAsset.get(
      sourceAssetIdFromHighlightId(
        resolvedActiveHighlightId,
      ),
    );
  const canRetryActiveTransition =
    activeLatestTransitionJob?.status === "failed";
  const canRetryActiveArc =
    activeLatestArcJob?.status === "failed";
  const isSubmittingActiveScripts =
    regeneratingHighlightId ===
    resolvedActiveHighlightId;
  const isGeneratingActiveScripts = Boolean(
    activeLatestScriptJob &&
      ["queued", "running"].includes(
        activeLatestScriptJob.status,
      ),
  );
  const activeGeneratedScriptCount = Array.isArray(
    activeLatestScriptJob?.result,
  )
    ? activeLatestScriptJob.result.length
    : productionConfig.scriptCount;

  useEffect(() => {
    if (!pendingGeneratedScripts) return;

    const newScriptIds = pipeline.scripts
      .filter(
        (script) =>
          script.highlightId ===
            pendingGeneratedScripts.highlightId &&
          !pendingGeneratedScripts.existingScriptIds.includes(
            script.id,
          ),
      )
      .map((script) => script.id);

    if (!newScriptIds.length) return;

    setExpandedScriptIds((current) => [
      ...new Set([...current, ...newScriptIds]),
    ]);
    setPendingGeneratedScripts(null);
  }, [pendingGeneratedScripts, pipeline.scripts]);

  function toggleScriptSelection(
    scriptId: string,
    selected: boolean,
  ) {
    onSelectedScriptIdsChange(
      selected
        ? [...selectedScriptIds, scriptId]
        : selectedScriptIds.filter(
            (id) => id !== scriptId,
          ),
    );
  }

  return (
    <>
      <div className="pipeline-section highlight-script-section">
        <div className="pipeline-section-title">
          <Clapperboard size={16} />
          <strong>当前生产版本 AI 前贴脚本</strong>
          <span>
            {pipeline.highlights.length} 个高光，每个高光独立关联脚本
          </span>
        </div>
        <nav
          className="highlight-navigation"
          aria-label="高光视频导航"
        >
          {pipeline.highlights.map((highlight, index) => {
            const fallbackTitle =
              pipeline.arcs.find(
                (arc) => arc.id === highlight.arcId,
              )?.title ?? `高光视频 ${index + 1}`;
            const videoName = highlightVideoName(
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
            const linkedScriptCount =
              pipeline.scripts.filter(
                (script) =>
                  script.highlightId === highlight.id,
              ).length;
            const videoUrl =
              highlight.result?.videoUrls?.[0];
            const isActive =
              highlight.id === resolvedActiveHighlightId;
            const latestScriptJob =
              latestScriptJobByHighlight.get(
                highlight.id,
              );
            const generatedCount = Array.isArray(
              latestScriptJob?.result,
            )
              ? latestScriptJob.result.length
              : productionConfig.scriptCount;
            return (
              <article
                className={`highlight-navigation-item ${
                  isActive ? "active" : ""
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
                      aria-label={`播放高光 ${index + 1}：${videoName}`}
                    />
                  ) : (
                    <Clapperboard
                      size={20}
                      aria-hidden="true"
                    />
                  )}
                  <i>{index + 1}</i>
                </span>
                <button
                  className="highlight-navigation-copy"
                  type="button"
                  aria-current={
                    isActive ? "true" : undefined
                  }
                  aria-label={`查看高光 ${index + 1}：${videoName}`}
                  onClick={() =>
                    onActiveHighlightChange(highlight.id)
                  }
                >
                  <strong>{navigationTitle}</strong>
                  <small>
                    {linkedScriptCount} 个脚本版本
                  </small>
                  {latestScriptJob && (
                    <span
                      className={`highlight-navigation-status ${
                        latestScriptJob.status === "failed"
                          ? "failed"
                          : ["queued", "running"].includes(
                                latestScriptJob.status,
                              )
                            ? "running"
                            : ""
                      }`}
                      title={formatGeneratedAt(
                        latestScriptJob.updatedAt ??
                          latestScriptJob.createdAt,
                      )}
                    >
                      {latestScriptJob.status === "queued"
                        ? "脚本任务已提交"
                        : latestScriptJob.status ===
                            "running"
                          ? `脚本生成中 ${latestScriptJob.progress}%`
                          : latestScriptJob.status ===
                              "failed"
                            ? "最近生成失败"
                            : `最近新增 ${generatedCount} 个`}
                    </span>
                  )}
                </button>
              </article>
            );
          })}
        </nav>

        <div className="script-action-dock">
          <div className="script-action-controls">
            <div className="script-bulk-delete-actions">
              <button
                className="button ghost danger"
                disabled={
                  !activeSelectedDraftIds.length
                }
                onClick={() =>
                  onRequestScriptDeletion(
                    activeSelectedDraftIds,
                    "删除已勾选的未确认脚本",
                  )
                }
              >
                删除所选（
                {activeSelectedDraftIds.length}）
              </button>
            </div>
            <button
              className="button ghost"
              disabled={
                isSubmittingActiveScripts ||
                (!activeHighlight?.anchor &&
                  !canRetryActiveTransition &&
                  !canRetryActiveArc)
              }
              onClick={() => {
                if (
                  canRetryActiveArc &&
                  !activeHighlight?.anchor
                ) {
                  onGoToStoryArcs();
                  return;
                }
                setPendingGeneratedScripts({
                  highlightId: resolvedActiveHighlightId,
                  existingScriptIds: activeHighlightScripts.map(
                    (script) => script.id,
                  ),
                });
                onGenerateOrRetryScripts();
              }}
            >
              {isSubmittingActiveScripts ? (
                <LoaderCircle
                  className="spin"
                  size={14}
                />
              ) : (
                <RefreshCw size={14} />
              )}
              {canRetryActiveTransition &&
              !activeHighlight?.anchor
                ? "重试开头理解并生成脚本"
                : canRetryActiveArc &&
                    !activeHighlight?.anchor
                  ? "前往爽点故事线重试"
                : "AI 生成脚本"}
            </button>
            <button
              className="button primary"
              disabled={
                !activeSelectedDraftIds.length ||
                confirmingScripts
              }
              onClick={onConfirmSelectedScripts}
            >
              {confirmingScripts ? (
                <LoaderCircle
                  className="spin"
                  size={15}
                />
              ) : (
                <Check size={15} />
              )}
              批量确认（
              {activeSelectedDraftIds.length}）
            </button>
          </div>
          {isSubmittingActiveScripts && (
            <div
              className="script-generation-summary running"
              role="status"
            >
              <LoaderCircle className="spin" size={14} />
              <span>正在提交生成任务</span>
            </div>
          )}
          {!isSubmittingActiveScripts &&
            activeLatestScriptJob && (
              <div
                className={`script-generation-summary ${activeLatestScriptJob.status}`}
                role="status"
              >
                {isGeneratingActiveScripts ? (
                  <LoaderCircle
                    className="spin"
                    size={14}
                  />
                ) : activeLatestScriptJob.status ===
                  "completed" ? (
                  <Check size={14} />
                ) : (
                  <AlertCircle size={14} />
                )}
                <span>
                  {activeLatestScriptJob.status ===
                  "queued"
                    ? "任务已提交，等待生成"
                    : activeLatestScriptJob.status ===
                        "running"
                      ? `正在生成脚本 · ${activeLatestScriptJob.progress}%`
                      : activeLatestScriptJob.status ===
                          "completed"
                        ? `生成完成 · 新增 ${activeGeneratedScriptCount} 个版本`
                        : "生成失败"}
                </span>
                {activeLatestScriptJob.status ===
                  "failed" && (
                  <small>
                    {activeLatestScriptJob.error ??
                      "生成任务执行失败，请重新提交"}
                  </small>
                )}
              </div>
            )}
        </div>

        <div className="highlight-script-list">
          {activeHighlight &&
            [activeHighlight].map((highlight) => {
              const fallbackTitle =
                pipeline.arcs.find(
                  (arc) =>
                    arc.id === highlight.arcId,
                )?.title ?? "高光智剪";
              const videoName = highlightVideoName(
                highlight,
                highlightAssets,
                fallbackTitle,
              );
              const scripts = pipeline.scripts.filter(
                (script) =>
                  script.highlightId === highlight.id,
              );
              const preparation =
                highlightPreparationCopy(
                  highlight,
                  latestTransitionJobByHighlight.get(
                    highlight.id,
                  ),
                  latestArcJobBySourceAsset.get(
                    sourceAssetIdFromHighlightId(
                      highlight.id,
                    ),
                  ),
                );
              return (
                <article
                  className="highlight-script-group"
                  key={highlight.id}
                >
                  <div className="highlight-primary">
                    <div className="highlight-copy">
                      <span className="current-highlight-badge">
                        当前脚本关联高光
                      </span>
                      <strong>{videoName}</strong>
                      <small
                        className={
                          preparation.failed
                            ? "highlight-preparation-failed"
                            : undefined
                        }
                      >
                        {preparation.summary}
                      </small>
                    </div>
                  </div>
                  <div className="script-result-list linked-script-list">
                    {[...scripts]
                      .reverse()
                      .map((script) => {
                        return (
                          <article
                            className={`script-version-card ${
                              (script.reviewStatus ??
                                "draft") ===
                              "confirmed"
                                ? "confirmed"
                                : ""
                            }`}
                            key={script.id}
                          >
                            <div className="script-version-header">
                              <label className="script-select">
                                <input
                                  type="checkbox"
                                  checked={selectedScriptIds.includes(
                                    script.id,
                                  )}
                                  onChange={(
                                    event,
                                  ) =>
                                    toggleScriptSelection(
                                      script.id,
                                      event.target
                                        .checked,
                                    )
                                  }
                                  aria-label={`选择脚本 ${script.title}`}
                                />
                                <strong>
                                  {script.title}
                                </strong>
                              </label>
                              <div className="script-version-toolbar">
                                <div className="script-version-actions">
                                  {(script.reviewStatus ??
                                    "draft") ===
                                    "draft" && (
                                    <button
                                      className="icon-button danger"
                                      onClick={() =>
                                        onRequestScriptDeletion(
                                          [
                                            script.id,
                                          ],
                                          `删除脚本“${script.title}”`,
                                        )
                                      }
                                      aria-label={`删除脚本：${script.title}`}
                                      title="删除脚本"
                                    >
                                      <Trash2
                                        size={15}
                                      />
                                    </button>
                                  )}
                                  <button
                                    className="button ghost"
                                    aria-label={`编辑脚本：${script.title}`}
                                    onClick={() =>
                                      setEditingScript(
                                        script,
                                      )
                                    }
                                  >
                                    <Edit3
                                      size={14}
                                    />{" "}
                                    编辑脚本
                                  </button>
                                  {script.reviewStatus ===
                                  "confirmed" ? (
                                    <>
                                      <span className="script-review-status">
                                        <Check
                                          size={14}
                                        />
                                        已确认
                                      </span>
                                      <button
                                        className="button ghost script-video-link"
                                        onClick={() =>
                                          onGoToPrerolls(
                                            script.id,
                                          )
                                        }
                                      >
                                        AI 前贴视频
                                        <ArrowRight size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      className="button primary script-confirm-action"
                                      disabled={confirmingScripts}
                                      aria-label={`确认脚本：${script.title}`}
                                      onClick={() =>
                                        onConfirmScript(
                                          script.id,
                                        )
                                      }
                                    >
                                      {confirmingScripts ? (
                                        <LoaderCircle
                                          className="spin"
                                          size={14}
                                        />
                                      ) : (
                                        <Check
                                          size={14}
                                        />
                                      )}
                                      确认脚本
                                    </button>
                                  )}
                                  <time
                                    className="script-version-time"
                                    dateTime={
                                      script.createdAt ??
                                      script.updatedAt
                                    }
                                  >
                                    {formatGeneratedAt(
                                      script.createdAt ??
                                        script.updatedAt,
                                    )}
                                  </time>
                                  <span className="script-version-duration">
                                    {script.duration}s
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="script-detail-toggle"
                              aria-expanded={
                                expandedScriptIds.includes(
                                  script.id,
                                )
                              }
                              aria-controls={`script-details-${script.id}`}
                              onClick={() =>
                                setExpandedScriptIds(
                                  (current) =>
                                    current.includes(
                                      script.id,
                                    )
                                      ? current.filter(
                                          (id) =>
                                            id !== script.id,
                                        )
                                      : [
                                          ...current,
                                          script.id,
                                        ],
                                )
                              }
                            >
                              {expandedScriptIds.includes(
                                script.id,
                              )
                                ? "收起脚本详情"
                                : "查看脚本详情"}
                            </button>
                            {expandedScriptIds.includes(
                              script.id,
                            ) && (
                              <PipelineScriptDetails
                                script={script}
                              />
                            )}
                          </article>
                        );
                      })}
                    {!scripts.length && (
                      <div className="empty-linked-scripts">
                        {preparation.empty}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      </div>

      {editingScript && (
        <PipelineScriptEditorModal
          key={editingScript.id}
          script={editingScript}
          saving={savingScript}
          onClose={() => setEditingScript(null)}
          onSave={(script) => {
            void onSaveScript(script).then(
              (saved) => {
                if (saved) {
                  setEditingScript(null);
                }
              },
            );
          }}
        />
      )}
    </>
  );
}
