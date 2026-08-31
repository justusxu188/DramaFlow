import {
  Download,
  ExternalLink,
  Film,
  Folder,
  FolderClosed,
  FolderOpen,
  Images,
} from "lucide-react";
import {
  LibraryAssetDeleteButton,
  LibraryImagePreview,
} from "@/components/library-asset-controls";
import { LibraryImageActions } from "@/components/library-image-actions";
import { LibraryProjectSection } from "@/components/library-project-section";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import { isUsableCharacterImageAsset } from "@/lib/character-image-assets";
import { groupImageAssetsByIdentity } from "@/lib/image-asset-groups";
import { getProject, listProjects } from "@/lib/project-store";
import { requireUser } from "@/lib/auth";
import { accessForUser } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireUser();
  const access = accessForUser(user);
  const projects = await listProjects(access);
  const [details, creativeSettings] = await Promise.all([
    Promise.all(
      projects.map((project) => getProject(project.id, access)),
    ),
    getCreativeSettings(),
  ]);
  const totalSources = details.reduce(
    (total, project) => total + (project?.assets.length ?? 0),
    0,
  );
  const totalImages = details.reduce(
    (total, project) =>
      total +
      (
        project?.imageAssets.filter(
          isUsableCharacterImageAsset,
        ).length ?? 0
      ),
    0,
  );
  const totalHighlights = details.reduce(
    (total, project) => total + (project?.highlightAssets.length ?? 0),
    0,
  );
  const totalPrerolls = details.reduce(
    (total, project) =>
      total + (project?.prerollAssets.length ?? 0),
    0,
  );
  const totalFinals = details.reduce(
    (total, project) =>
      total + (project?.finalAssets.length ?? 0),
    0,
  );

  return (
    <div className="page work-index-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">PROJECT LIBRARY</p>
          <h1>素材库</h1>
          <p className="page-subtitle">
            管理源视频、人物多妆照及从生产批次中精选的可复用视频。
          </p>
        </div>
        <span className="work-count">
          {projects.length} 个项目 · {totalSources} 个源视频 · {totalImages} 张图片 · {totalHighlights} 个高光 · {totalPrerolls} 个前贴 · {totalFinals} 个成片
        </span>
      </header>

      {!projects.length && (
        <div className="empty-state">
          <Folder size={24} />
          <strong>还没有项目素材</strong>
        </div>
      )}

      <div className="library-project-list">
        {details.map((project) => {
          if (!project) return null;
          const visibleImageAssets =
            project.imageAssets.filter(
              isUsableCharacterImageAsset,
            );
          const characterGroups =
            groupImageAssetsByIdentity(
              visibleImageAssets,
            );
          return (
            <LibraryProjectSection
              key={project.id}
              projectId={project.id}
              projectName={project.name}
              summary={`${project.assets.length} 个源视频 · ${visibleImageAssets.length} 张角色图片 · ${project.highlightAssets.length} 个正式高光 · ${project.prerollAssets.length + project.finalAssets.length} 个精选视频`}
              defaultImageModel={
                creativeSettings.imageModel
              }
              sources={project.assets.map((asset) => ({
                id: asset.id,
                name: asset.name,
                sourceUrl: asset.sourceUrl,
                durationMs: asset.durationMs,
              }))}
              images={visibleImageAssets.map((asset) => ({
                id: asset.id,
                name: asset.name,
                sourceUrl: asset.sourceUrl,
                characterName:
                  asset.metadata.characterName,
                lookName: asset.metadata.lookName,
                prompt: asset.metadata.prompt,
              }))}
            >
              <details className="library-folder">
                <summary>
                  <span className="library-folder-icon">
                    <FolderClosed className="closed" size={17} />
                    <FolderOpen className="open" size={17} />
                  </span>
                  <strong>源视频</strong>
                  <small>{project.assets.length} 个文件</small>
                </summary>
                <div className="library-grid">
                  {!project.assets.length && (
                    <div className="library-empty-folder">尚未上传源视频</div>
                  )}
                  {project.assets.map((asset) => (
                    <article className="library-item" key={asset.id}>
                      <span className="asset-video-thumb"><Film size={16} /></span>
                      <div>
                        <strong>{asset.name}</strong>
                        <small>
                          {asset.uploadMode === "full"
                            ? "整剧"
                            : `第 ${asset.episodeNumber} 集`}
                          {" · "}
                          {(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </small>
                      </div>
                      <div className="library-item-actions">
                        <a
                          href={asset.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`预览 ${asset.name}`}
                        >
                          <ExternalLink size={15} />
                        </a>
                        <LibraryAssetDeleteButton
                          projectId={project.id}
                          assetId={asset.id}
                          assetType="source"
                          assetName={asset.name}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </details>

              <details className="library-folder">
                <summary>
                  <span className="library-folder-icon">
                    <FolderClosed className="closed" size={17} />
                    <FolderOpen className="open" size={17} />
                  </span>
                  <strong>图像资产</strong>
                  <small>{visibleImageAssets.length} 张图片</small>
                </summary>
                <div className="library-character-groups">
                  {!visibleImageAssets.length && (
                    <div className="library-empty-folder">
                      人物确认后，标准参考图会保存到这里
                    </div>
                  )}
                  {characterGroups.map(([identityKey, group]) => (
                    <section className="library-character-group" key={identityKey}>
                      <header>
                        <strong>{group.characterName}</strong>
                        <small>{group.assets.length} 张妆照</small>
                      </header>
                      <div className="library-image-grid">
                        {group.assets.map((asset) => (
                          <article key={asset.id}>
                            {asset.sourceUrl ? (
                              <LibraryImagePreview
                                sourceUrl={asset.sourceUrl}
                                alt={asset.name}
                              />
                            ) : (
                              <span className="library-image-thumb">
                                <Images size={16} />
                              </span>
                            )}
                            <div className="library-image-copy">
                              <strong>{asset.name}</strong>
                              <small>
                                {asset.metadata.isBaseline ? "基准图 · " : ""}
                                {asset.metadata.sourceType === "seedream" ||
                                asset.metadata.sourceType === "seedream_text"
                                  ? "文生图"
                                  : asset.metadata.sourceType === "seedream_from_capture"
                                    ? "视频截图"
                                    : asset.metadata.sourceType === "upload"
                                      ? "用户上传"
                                      : "剧情确认"}
                              </small>
                            </div>
                            <LibraryImageActions
                              projectId={project.id}
                              assetId={asset.id}
                              assetName={asset.name}
                              sourceUrl={asset.sourceUrl}
                              characterName={
                                asset.metadata.characterName
                              }
                              lookName={asset.metadata.lookName}
                              prompt={asset.metadata.prompt}
                              avatarAssetId={
                                asset.metadata.avatarAssetId
                              }
                              avatarStatus={
                                asset.metadata.avatarStatus
                              }
                              avatarError={
                                asset.metadata.avatarError
                              }
                            />
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </details>

              <details className="library-folder">
                <summary>
                  <span className="library-folder-icon">
                    <FolderClosed className="closed" size={17} />
                    <FolderOpen className="open" size={17} />
                  </span>
                  <strong>高光剪辑</strong>
                  <small>
                    {project.highlightAssets.length} 个正式高光
                  </small>
                </summary>
                <div className="library-video-grid">
                  {project.highlightAssets.map((asset) => (
                    <article key={asset.id}>
                      <video controls preload="metadata" src={asset.sourceUrl} />
                      <div>
                        <div className="library-video-card-heading">
                          <span
                            className={`library-source-badge ${
                              asset.metadata.sourceType
                            }`}
                          >
                            {asset.metadata.sourceType === "mediakit"
                              ? "MediaKit 高光"
                              : "用户高光"}
                          </span>
                          <LibraryAssetDeleteButton
                            projectId={project.id}
                            assetId={asset.id}
                            assetType="highlight"
                            assetName={asset.name}
                          />
                        </div>
                        <strong>{asset.name}</strong>
                        <small>
                          {asset.metadata.sourceAssetId
                            ? "已关联源视频"
                            : "独立高光视频"}
                        </small>
                      </div>
                    </article>
                  ))}
                  {!project.highlightAssets.length && (
                      <div className="library-empty-folder">尚无高光剪辑</div>
                  )}
                </div>
              </details>

              {[
                {
                  label: "AI 前贴视频",
                  empty: "尚未从生产批次精选 AI 前贴视频",
                  assets: project.prerollAssets,
                },
                {
                  label: "成片视频",
                  empty: "尚未从生产批次精选成片视频",
                  assets: project.finalAssets,
                },
              ].map((folder) => (
                <details className="library-folder" key={folder.label}>
                  <summary>
                    <span className="library-folder-icon">
                      <FolderClosed className="closed" size={17} />
                      <FolderOpen className="open" size={17} />
                    </span>
                    <strong>{folder.label}</strong>
                    <small>{folder.assets.length} 个精选视频</small>
                  </summary>
                  <div className="library-video-grid">
                    {!folder.assets.length && (
                      <div className="library-empty-folder">
                        {folder.empty}
                      </div>
                    )}
                    {folder.assets.map((asset) => (
                      <article key={asset.id}>
                        <video
                          controls
                          preload="metadata"
                          src={asset.sourceUrl}
                        />
                        <div>
                          <div className="library-video-card-heading">
                            <span className="library-source-badge complete">
                              精选
                            </span>
                            <div className="library-item-actions horizontal">
                              <a
                                href={asset.sourceUrl}
                                download={asset.name}
                                aria-label={`下载 ${asset.name}`}
                                title="下载"
                              >
                                <Download size={15} />
                              </a>
                              <LibraryAssetDeleteButton
                                projectId={project.id}
                                assetId={asset.id}
                                assetType={asset.kind}
                                assetName={asset.name}
                              />
                            </div>
                          </div>
                          <strong>{asset.name}</strong>
                          <small>来自生产批次 · 可用于后续创作和剪辑</small>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              ))}

            </LibraryProjectSection>
          );
        })}
      </div>
    </div>
  );
}
