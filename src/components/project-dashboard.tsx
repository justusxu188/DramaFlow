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
  Files,
  Film,
  FolderOpen,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  sourceVideoFiles,
  useUploadManager,
} from "@/components/upload-manager";
import { creativeWorkTypes } from "@/lib/creative-work-types";

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

export function ProjectDashboard() {
  const router = useRouter();
  const { enqueueSourceUploads } =
    useUploadManager();
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createError, setCreateError] =
    useState("");
  const [sourceFiles, setSourceFiles] = useState<
    File[]
  >([]);
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
      if (sourceFiles.length) {
        enqueueSourceUploads({
          projectId: data.id,
          projectName: data.name,
          files: sourceFiles,
        });
      }
      setShowCreate(false);
      setSourceFiles([]);
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

  function chooseSourceFiles(files: FileList | null) {
    setSourceFiles(
      sourceVideoFiles(Array.from(files ?? [])),
    );
  }

  const sourceTotalBytes = sourceFiles.reduce(
    (total, file) => total + file.size,
    0,
  );

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
                <legend>上传源视频（可选）</legend>
                <div className="create-project-upload-options">
                  <label>
                    <FileIcon size={18} />
                    <span>
                      <strong>单个文件</strong>
                      <small>选择一个 MP4 / MOV</small>
                    </span>
                    <input
                      type="file"
                      accept=".mp4,.mov,video/mp4,video/quicktime"
                      onChange={(event) =>
                        chooseSourceFiles(
                          event.target.files,
                        )}
                    />
                  </label>
                  <label>
                    <Files size={18} />
                    <span>
                      <strong>多个文件</strong>
                      <small>一次选择多集视频</small>
                    </span>
                    <input
                      type="file"
                      accept=".mp4,.mov,video/mp4,video/quicktime"
                      multiple
                      onChange={(event) =>
                        chooseSourceFiles(
                          event.target.files,
                        )}
                    />
                  </label>
                  <label>
                    <FolderOpen size={18} />
                    <span>
                      <strong>选择文件夹</strong>
                      <small>读取文件夹内全部视频</small>
                    </span>
                    <input
                      type="file"
                      accept=".mp4,.mov,video/mp4,video/quicktime"
                      multiple
                      ref={(input) => {
                        input?.setAttribute(
                          "webkitdirectory",
                          "",
                        );
                        input?.setAttribute(
                          "directory",
                          "",
                        );
                      }}
                      onChange={(event) =>
                        chooseSourceFiles(
                          event.target.files,
                        )}
                    />
                  </label>
                </div>
                {sourceFiles.length > 0 && (
                  <div className="create-project-selected-files">
                    <header>
                      <strong>
                        已选择 {sourceFiles.length} 个视频
                      </strong>
                      <small>
                        {(
                          sourceTotalBytes /
                          1024 /
                          1024
                        ).toFixed(1)}{" "}
                        MB
                      </small>
                    </header>
                    <div>
                      {sourceFiles.map((file, index) => (
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
                              setSourceFiles((current) =>
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
                    : sourceFiles.length
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
