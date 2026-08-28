"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Check,
  Clock3,
  File as FileIcon,
  Film,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import {
  type ProjectUploadTarget,
  uploadFilesForTarget,
  useUploadManager,
} from "@/components/upload-manager";
import { creativeWorkTypes } from "@/lib/creative-work-types";
import { filesFromDataTransfer } from "@/lib/file-drop";

type ProjectView = {
  id: string;
  name: string;
  genre: string;
  episodeCount: number;
  progress: number;
  status: string;
  outputs: number;
  sourceCount: number;
  runningJobs: number;
  updatedAt: string;
};

const statusLabels: Record<string, string> = {
  awaiting_upload: "待上传",
  ready: "待生产",
  production: "生产中",
  completed: "已完成",
};

const uploadTargets: Array<{
  id: ProjectUploadTarget;
  label: string;
}> = [
  { id: "source", label: "源视频" },
  { id: "character_image", label: "图像资产" },
  { id: "highlight", label: "高光剪辑" },
];

export function ProjectDashboard() {
  const router = useRouter();
  const { enqueueAssetUploads } =
    useUploadManager();
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createError, setCreateError] =
    useState("");
  const [selectedFiles, setSelectedFiles] = useState<
    File[]
  >([]);
  const [uploadTarget, setUploadTarget] =
    useState<ProjectUploadTarget>("source");
  const [dragActive, setDragActive] = useState(false);
  const [openProjectMenuId, setOpenProjectMenuId] =
    useState("");

  const visibleProjects = projects.filter((project) =>
    `${project.name}${project.genre}`.toLowerCase().includes(query.toLowerCase()),
  );
  const metrics = useMemo(() => ({
    sources: projects.reduce((sum, project) => sum + project.sourceCount, 0),
    outputs: projects.reduce((sum, project) => sum + project.outputs, 0),
    running: projects.reduce((sum, project) => sum + project.runningJobs, 0),
    ready: projects.filter((project) => project.sourceCount > 0).length,
  }), [projects]);

  useEffect(() => {
    fetch("/api/projects")
      .then(async (response) => {
        const payload = await response.json() as { data?: ProjectView[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "项目加载失败");
        setProjects(payload.data ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "项目加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!openProjectMenuId) return;
    function closeOnPointerDown(event: Event) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-project-menu]")
      ) {
        return;
      }
      setOpenProjectMenuId("");
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenProjectMenuId("");
    }
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("mousedown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("mousedown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openProjectMenuId]);

  async function createProject(formData: FormData) {
    setCreating(true);
    setCreateError("");
    const payload = {
      name: String(formData.get("name")),
      genre: String(formData.get("genre")),
      episodeCount: 0,
    };
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json()) as {
        data?: ProjectView;
        error?: string;
      };
      if (!response.ok || !responsePayload.data) {
        throw new Error(
          responsePayload.error ?? "项目创建失败",
        );
      }
      const data = responsePayload.data;
      setProjects((current) => [data, ...current]);
      if (selectedFiles.length) {
        enqueueAssetUploads({
          projectId: data.id,
          projectName: data.name,
          files: selectedFiles,
          assetType: uploadTarget,
        });
      }
      setShowCreate(false);
      setSelectedFiles([]);
      setUploadTarget("source");
      router.push(`/projects/${data.id}`);
    } catch (reason) {
      setCreateError(
        reason instanceof Error
          ? reason.message
          : "项目创建失败",
      );
    } finally {
      setCreating(false);
    }
  }

  function chooseUploadFiles(files: ArrayLike<File>) {
    setSelectedFiles(
      uploadFilesForTarget(
        Array.from(files),
        uploadTarget,
      ),
    );
  }

  async function handleFileDrop(
    event: React.DragEvent<HTMLLabelElement>,
  ) {
    event.preventDefault();
    setDragActive(false);
    try {
      const droppedFiles = await filesFromDataTransfer(
        event.dataTransfer,
      );
      setSelectedFiles((current) =>
        uploadFilesForTarget(
          [...current, ...droppedFiles],
          uploadTarget,
        ),
      );
    } catch (reason) {
      setCreateError(
        reason instanceof Error
          ? reason.message
          : "无法读取拖入的文件",
      );
    }
  }

  const selectedTotalBytes = selectedFiles.reduce(
    (total, file) => total + file.size,
    0,
  );
  const uploadAccept =
    uploadTarget === "character_image"
      ? ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
      : ".mp4,.mov,video/mp4,video/quicktime";

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">SHORT DRAMA OPERATIONS</p>
          <h1>项目中心</h1>
          <p className="page-subtitle">
            从正片理解到投流成片，掌控每一个创意版本。
          </p>
        </div>
        <button className="button primary" onClick={() => setShowCreate(true)}>
          <Plus size={17} />
          新建短剧项目
        </button>
      </header>

      <section className="metrics-grid" aria-label="项目指标">
        <article className="metric-card featured">
          <span className="metric-icon"><Sparkles size={18} /></span>
          <p>本周生成素材</p>
          <strong>{metrics.outputs}</strong>
          <small><TrendingUp size={14} /> 真实成片记录</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon"><Film size={18} /></span>
          <p>优质素材占比</p>
          <strong>{metrics.outputs ? "待审片" : "—"}</strong>
          <small>尚未接入投放效果回传</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon"><Clock3 size={18} /></span>
          <p>平均生产时长</p>
          <strong>—</strong>
          <small>{metrics.ready} 个项目已上传源片</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon"><Check size={18} /></span>
          <p>运行中任务</p>
          <strong>{metrics.running}</strong>
          <small>来自真实任务状态</small>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACTIVE PROJECTS</p>
            <h2>项目列表</h2>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索剧目或题材"
              aria-label="搜索项目"
            />
          </label>
        </div>

        <div className="project-list">
          {loading && <div className="empty-state"><LoaderCircle className="spin" size={20} /> 正在读取项目</div>}
          {!loading && error && <div className="empty-state">{error}</div>}
          {!loading && !error && visibleProjects.length === 0 && (
            <div className="empty-state">
              <Film size={24} />
              <strong>{query ? "没有匹配项目" : "还没有真实项目"}</strong>
              <span>{query ? "换个关键词试试" : "创建空项目，之后可随时上传分集或整剧源片"}</span>
              {!query && <button className="button primary" onClick={() => setShowCreate(true)}><Plus size={16} /> 新建项目</button>}
            </div>
          )}
          {visibleProjects.map((project) => (
            <div
              className={`project-row ${
                openProjectMenuId === project.id
                  ? "has-open-menu"
                  : ""
              }`}
              key={project.id}
            >
              <Link
                href={`/projects/${project.id}`}
                className="project-row-main"
              >
                <span
                  className="project-poster"
                  style={{ "--poster-accent": "#ff6b4a" } as React.CSSProperties}
                >
                  <Film size={23} />
                </span>
                <span className="project-copy">
                  <strong>{project.name}</strong>
                  <small>{project.genre} · {project.episodeCount} 集</small>
                </span>
                <span className="project-progress">
                  <span>
                    <small>生产进度</small>
                    <b>{project.progress}%</b>
                  </span>
                  <i><em style={{ width: `${project.progress}%` }} /></i>
                </span>
                <span className={`status-pill status-${statusLabels[project.status] ?? project.status}`}>
                  {statusLabels[project.status] ?? project.status}
                </span>
                <span className="project-output">
                  <strong>{project.outputs}</strong>
                  <small>成片</small>
                </span>
                <span className="project-updated">{new Date(project.updatedAt).toLocaleDateString("zh-CN")}</span>
              </Link>
              <div
                className="project-row-menu"
                data-project-menu
              >
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`打开${project.name}创作菜单`}
                  aria-expanded={
                    openProjectMenuId === project.id
                  }
                  onClick={() =>
                    setOpenProjectMenuId((current) =>
                      current === project.id
                        ? ""
                        : project.id,
                    )
                  }
                >
                  <MoreHorizontal size={18} />
                </button>
                {openProjectMenuId === project.id && (
                  <div className="project-creative-menu">
                    {creativeWorkTypes.map((workType) => (
                      <Link
                        href={`/projects/${project.id}?workType=${workType.id}`}
                        key={workType.id}
                        onClick={() =>
                          setOpenProjectMenuId("")
                        }
                      >
                        {workType.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {showCreate && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal create-project-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEW PRODUCTION</p>
                <h2 id="create-title">创建短剧项目</h2>
              </div>
              <button className="icon-button" onClick={() => setShowCreate(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <form action={createProject}>
              <label>剧目名称<input name="name" required minLength={2} placeholder="例如：我的短剧项目" /></label>
              <label>题材类型<input name="genre" required placeholder="都市逆袭 / 古风种田" /></label>
              <fieldset className="create-project-upload">
                <legend>上传素材（可选）</legend>
                <div
                  className="create-project-upload-targets"
                  role="group"
                  aria-label="上传到素材库目录"
                >
                  {uploadTargets.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      aria-pressed={
                        uploadTarget === target.id
                      }
                      onClick={() => {
                        setUploadTarget(target.id);
                        setSelectedFiles((current) =>
                          uploadFilesForTarget(
                            current,
                            target.id,
                          ),
                        );
                      }}
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
                <label
                  className={`create-project-dropzone ${
                    dragActive ? "is-dragging" : ""
                  }`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect =
                      "copy";
                  }}
                  onDragLeave={(event) => {
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node,
                      )
                    ) {
                      setDragActive(false);
                    }
                  }}
                  onDrop={(event) =>
                    void handleFileDrop(event)
                  }
                >
                  <Upload size={20} />
                  <span>
                    <strong>点击选择或拖入素材</strong>
                    <small>
                      支持单个、多个文件；文件夹可直接拖入
                    </small>
                  </span>
                  <input
                    type="file"
                    aria-label="选择上传文件"
                    accept={uploadAccept}
                    multiple
                    onChange={(event) =>
                      chooseUploadFiles(
                        event.target.files ?? [],
                      )
                    }
                  />
                </label>
                {selectedFiles.length > 0 && (
                  <div className="create-project-selected-files">
                    <header>
                      <strong>
                        已选择 {selectedFiles.length} 个
                        {uploadTarget ===
                        "character_image"
                          ? "图片"
                          : "视频"}
                      </strong>
                      <small>
                        {(
                          selectedTotalBytes /
                          1024 /
                          1024
                        ).toFixed(1)}{" "}
                        MB
                      </small>
                    </header>
                    <div>
                      {selectedFiles.map((file, index) => (
                        <article
                          key={`${file.name}-${file.size}-${file.lastModified}`}
                        >
                          <FileIcon size={14} />
                          <span>{file.name}</span>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`移除 ${file.name}`}
                            onClick={() =>
                              setSelectedFiles((current) =>
                                current.filter(
                                  (_, itemIndex) =>
                                    itemIndex !== index,
                                ),
                              )}
                          >
                            <Trash2 size={14} />
                          </button>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </fieldset>
              <div className="form-note">
                创建后素材将在后台继续上传，可立即进入其他页面。实际集数由上传文件自动统计。
              </div>
              {createError && (
                <div className="pipeline-callout error">
                  {createError}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="button ghost" onClick={() => setShowCreate(false)}>取消</button>
                <button className="button primary" disabled={creating}>
                  {creating ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
                  {creating
                    ? "创建中"
                    : selectedFiles.length
                      ? "创建并后台上传"
                      : "创建并进入"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
