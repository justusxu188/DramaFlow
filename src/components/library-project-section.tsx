"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Upload,
} from "lucide-react";
import { LibraryAssetUploader } from "@/components/library-asset-uploader";
import {
  sourceVideoFiles,
  useUploadManager,
} from "@/components/upload-manager";

type SourceOption = {
  id: string;
  name: string;
  sourceUrl: string;
  durationMs: number | null;
};

type ImageOption = {
  id: string;
  name: string;
  sourceUrl: string;
  characterName: string;
  lookName?: string;
  prompt?: string;
};

export function LibraryProjectSection({
  projectId,
  projectName,
  summary,
  defaultImageModel,
  sources,
  images,
  children,
}: {
  projectId: string;
  projectName: string;
  summary: string;
  defaultImageModel:
    | "seedream_5_0_lite"
    | "seedream_5_0_pro";
  sources: SourceOption[];
  images: ImageOption[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { enqueueSourceUploads } = useUploadManager();

  function uploadEpisodes(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = sourceVideoFiles(
      Array.from(event.target.files ?? []),
    );
    event.target.value = "";
    if (!files.length) return;
    enqueueSourceUploads({
      projectId,
      projectName,
      files,
    });
  }

  return (
    <section className="library-project">
      <div className="library-project-heading">
        <button
          type="button"
          className="library-project-toggle"
          aria-label={`${open ? "折叠" : "展开"} ${projectName}`}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? (
            <FolderOpen size={20} />
          ) : (
            <FolderClosed size={20} />
          )}
          {open ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronRight size={13} />
          )}
        </button>
        <div>
          <h2>{projectName}</h2>
          <small>{summary}</small>
        </div>
        <div className="library-project-heading-actions">
          <LibraryAssetUploader
            projectId={projectId}
            defaultImageModel={defaultImageModel}
            sources={sources}
            images={images}
          />
          <input
            ref={uploadInputRef}
            className="visually-hidden"
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            multiple
            aria-label={`为${projectName}上传剧集`}
            onChange={uploadEpisodes}
          />
          <button
            type="button"
            className="button ghost"
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload size={16} />
            上传剧集
          </button>
        </div>
      </div>
      {open && (
        <div className="library-project-children">
          {children}
        </div>
      )}
    </section>
  );
}
