"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Layers3,
  MoreHorizontal,
  Play,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { SourceUpload } from "./source-upload";
import { BatchPipelinePanel } from "./batch-pipeline-panel";
import { probeVideoDuration } from "@/lib/video-duration";
import type { ProductionConfig } from "@/lib/production-config";
import {
  creativeWorkTypes,
  parseCreativeWorkType,
  type CreativeWorkType,
} from "@/lib/creative-work-types";
import { VideoPostProductionWorkspace } from "@/components/video-post-production-workspace";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ProjectOverview } from "@/components/project-overview";

type ProjectAsset = {
  id: string;
  name: string;
  sourceUrl: string;
  sizeBytes: number;
  durationMs: number | null;
  uploadMode: "episodes" | "full";
  episodeNumber: number | null;
};

type ProjectDetail = {
  id: string;
  name: string;
  genre: string;
  episodeCount: number;
  outputs: number;
  sourceCount: number;
  assets: ProjectAsset[];
  highlightAssets: Array<{
    id: string;
    name: string;
    sourceUrl: string;
    durationMs: number | null;
    metadata: {
      sourceType: "user" | "mediakit";
      sourceAssetId?: string;
    };
  }>;
};

const MAX_SELECTED_ASSETS = 30;

export function ProjectWorkspaceRoute({
  projectId,
}: {
  projectId: string;
}) {
  const searchParams = useSearchParams();
  const requestedWorkType = searchParams.get("workType");
  if (!requestedWorkType) {
    return <ProjectOverview projectId={projectId} />;
  }
  const workType = parseCreativeWorkType(requestedWorkType);

  return (
    <PipelineWorkspace projectId={projectId} workType={workType} />
  );
}

export function PipelineWorkspace({
  projectId,
  workType = creativeWorkTypes[0],
}: {
  projectId: string;
  workType?: CreativeWorkType;
}) {
  if (workType.id === "post-production") {
    return (
      <VideoPostProductionWorkspace
        projectId={projectId}
        workType={workType}
      />
    );
  }

  return (
    <CreativePipelineWorkspace projectId={projectId} workType={workType} />
  );
}

function CreativePipelineWorkspace({
  projectId,
  workType,
}: {
  projectId: string;
  workType: CreativeWorkType;
}) {
  const [project, setProject] = useState<ProjectDetail>();
  const [projectError, setProjectError] = useState("");
  const [showAssets, setShowAssets] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [draftAssetIds, setDraftAssetIds] = useState<string[]>([]);
  const knownAssetIds = useRef(new Set<string>());
  const durationProbeIds = useRef(new Set<string>());
  const [probingDurations, setProbingDurations] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [toast, setToast] = useState("");
  const [executionMode, setExecutionMode] =
    useState<ProductionConfig["executionMode"]>();
  const selectedExecutionMode = executionMode ?? "manual";
  const usesSourceAssets =
    workType.id === "full-chain" ||
    workType.id === "batch-highlights";

  const refreshProject = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const payload = await response.json() as { data?: ProjectDetail; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "项目加载失败");
      setProject(payload.data);
      const nextAssetIds = payload.data.assets.map((asset) => asset.id);
      const previousAssetIds = knownAssetIds.current;
      const isInitialSelection = previousAssetIds.size === 0;
      setSelectedAssetIds((current) => {
        const currentSet = new Set(current.filter((id) => nextAssetIds.includes(id)));
        if (isInitialSelection) {
          return nextAssetIds.slice(0, MAX_SELECTED_ASSETS);
        }
        for (const id of nextAssetIds) {
          if (!previousAssetIds.has(id) && currentSet.size < MAX_SELECTED_ASSETS) {
            currentSet.add(id);
          }
        }
        return nextAssetIds.filter((id) => currentSet.has(id));
      });
      knownAssetIds.current = new Set(nextAssetIds);
      setProjectError("");
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "项目加载失败");
    }
  }, [projectId]);

  useEffect(() => {
    void refreshProject();
  }, [refreshProject]);

  useEffect(() => {
    const missing = project?.assets.filter(
      (asset) =>
        !asset.durationMs &&
        !durationProbeIds.current.has(asset.id),
    ) ?? [];
    if (!missing.length) return;

    let canceled = false;
    setProbingDurations(true);
    for (const asset of missing) durationProbeIds.current.add(asset.id);

    void (async () => {
      for (const asset of missing) {
        if (canceled) return;
        try {
          const durationMs = await probeVideoDuration(asset.sourceUrl, 30000);
          const response = await fetch(`/api/projects/${projectId}/assets`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId: asset.id, durationMs }),
          });
          if (!response.ok) throw new Error("素材时长回填失败");
        } catch {
          durationProbeIds.current.delete(asset.id);
        }
      }
      if (canceled) return;
      setProbingDurations(false);
      await refreshProject();
    })();

    return () => {
      canceled = true;
    };
  }, [project, projectId, refreshProject]);

  useEffect(() => {
    if (!showAssets) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAssets(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showAssets]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function openAssetSelection() {
    setDraftAssetIds(selectedAssetIds);
    setShowAssets(true);
  }

  function confirmAssetSelection() {
    if (!draftAssetIds.length) return;
    setSelectedAssetIds(draftAssetIds);
    setShowAssets(false);
    notify(`已确认使用 ${draftAssetIds.length} 个源视频`);
  }

  function toggleDraftAsset(assetId: string) {
    setDraftAssetIds((current) => {
      if (current.includes(assetId)) return current.filter((id) => id !== assetId);
      if (current.length >= MAX_SELECTED_ASSETS) {
        notify(`单次生产最多选择 ${MAX_SELECTED_ASSETS} 个源视频`);
        return current;
      }
      const selected = new Set([...current, assetId]);
      return project?.assets.filter((asset) => selected.has(asset.id)).map((asset) => asset.id) ?? [];
    });
  }

  async function copyProjectLink() {
    await navigator.clipboard.writeText(window.location.href);
    setShowMore(false);
    notify("项目链接已复制");
  }

  return (
    <div className="pipeline-page">
      <header className="pipeline-topbar" aria-label="项目与素材操作">
        <div className="project-breadcrumb">
          <Link
            href={`/production/${workType.id}`}
            aria-label={`返回${workType.label}`}
          >
            <ArrowLeft size={18} />
          </Link>
          <ProjectSwitcher
            projectId={projectId}
            projectName={
              project?.name ??
              (projectError || "正在加载项目")
            }
            projectMeta={
              project
                ? `${project.genre} · ${project.episodeCount || 0} 集 · ${project.sourceCount} 个源文件 · 本次选中 ${selectedAssetIds.length} 个`
                : undefined
            }
            workType={workType}
          />
        </div>
        <div className="topbar-actions">
          <span className="autosave"><Check size={13} /> 已自动保存</span>
          {workType.supportsExecutionMode && (
            <div
              className="topbar-execution-mode"
              role="radiogroup"
              aria-label="执行方式"
            >
              <button
                type="button"
                role="radio"
                aria-checked={selectedExecutionMode === "manual"}
                className={selectedExecutionMode === "manual" ? "active" : ""}
                onClick={() => setExecutionMode("manual")}
              >
                <Check size={13} />
                人工
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={selectedExecutionMode === "agent"}
                className={selectedExecutionMode === "agent" ? "active" : ""}
                onClick={() => setExecutionMode("agent")}
              >
                <Sparkles size={13} />
                Agent
              </button>
            </div>
          )}
          {usesSourceAssets && Boolean(project?.sourceCount) && (
            <button className="button ghost" onClick={openAssetSelection}>
              <Layers3 size={15} /> 选择素材
            </button>
          )}
          {usesSourceAssets && (
            <SourceUpload
              projectId={projectId}
              compact
              onUploaded={() => void refreshProject()}
            />
          )}
          <div className="menu-anchor">
            <button
              className="icon-button"
              onClick={() => setShowMore((value) => !value)}
              aria-label="更多操作"
            >
              <MoreHorizontal size={18} />
            </button>
            {showMore && (
              <div className="action-menu">
                <button onClick={copyProjectLink}><Copy size={14} /> 复制项目链接</button>
                <Link href="/settings"><Settings2 size={14} /> 系统设置</Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <BatchPipelinePanel
        projectId={projectId}
        workType={workType}
        executionMode={executionMode}
        onExecutionModeChange={setExecutionMode}
        hasSources={Boolean(project?.sourceCount)}
        sourceAssets={project?.assets ?? []}
        highlightAssets={project?.highlightAssets ?? []}
        selectedAssetIds={selectedAssetIds}
        selectedAssets={
          project?.assets.filter((asset) => selectedAssetIds.includes(asset.id)) ??
          []
        }
        probingDurations={probingDurations}
        sourceCount={project?.sourceCount ?? 0}
      />

      {showAssets && (
        <div
          className="modal-backdrop asset-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowAssets(false);
          }}
        >
          <div className="modal asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">PROJECT LIBRARY</p>
                <h2 id="asset-title">项目真实素材</h2>
              </div>
              <button className="icon-button" onClick={() => setShowAssets(false)} aria-label="关闭"><X size={18} /></button>
            </div>
            <div className="asset-selection-toolbar">
              <span>本次选择 <strong>{draftAssetIds.length}</strong> / {project?.assets.length ?? 0} 个源视频</span>
              <div>
                <button
                  className="button ghost"
                  onClick={() => setDraftAssetIds(project?.assets.slice(0, MAX_SELECTED_ASSETS).map((asset) => asset.id) ?? [])}
                >
                  全选
                </button>
                <button className="button ghost" onClick={() => setDraftAssetIds([])}>
                  清空选择
                </button>
              </div>
            </div>
            <div className="asset-browser">
              {!project?.assets.length && <div className="empty-state compact">尚未上传项目源片</div>}
              {project?.assets.map((asset) => (
                <div
                  className={`asset-source-row ${draftAssetIds.includes(asset.id) ? "selected" : ""}`}
                  key={asset.id}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={draftAssetIds.includes(asset.id)}
                      onChange={() => toggleDraftAsset(asset.id)}
                      aria-label={`选择 ${asset.name}`}
                    />
                    <span className="asset-video-thumb"><Play size={16} /></span>
                    <div>
                      <strong>{asset.name}</strong>
                      <small>
                        {asset.uploadMode === "full" ? "整剧源片" : `第 ${asset.episodeNumber} 集`}
                        {" · "}
                        {(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        {" · "}
                        {asset.durationMs
                          ? `${Math.round(asset.durationMs / 1000)} 秒`
                          : "正在读取时长"}
                      </small>
                    </div>
                  </label>
                  <a
                    className="icon-button"
                    href={asset.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`预览 ${asset.name}`}
                  >
                    <ExternalLink size={15} />
                  </a>
                </div>
              ))}
            </div>
            <div className="asset-selection-footer">
              <span>
                {draftAssetIds.length
                  ? "确认后将更新本次生产使用的源视频"
                  : "请至少选择一个源视频"}
              </span>
              <div>
                <button className="button ghost" onClick={() => setShowAssets(false)}>取消</button>
                <button
                  className="button primary"
                  disabled={!draftAssetIds.length}
                  onClick={confirmAssetSelection}
                >
                  {draftAssetIds.length
                    ? `确认使用 ${draftAssetIds.length} 个视频`
                    : "请至少选择一个视频"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status"><Check size={15} /> {toast}</div>}
    </div>
  );
}
