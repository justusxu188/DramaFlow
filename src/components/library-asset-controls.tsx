"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import type { ProjectAssetKind } from "@/lib/project-store";

export function LibraryAssetDeleteButton({
  projectId,
  assetId,
  assetType,
  assetName,
  deletesRemoteAvatar = false,
}: {
  projectId: string;
  assetId: string;
  assetType: ProjectAssetKind;
  assetName: string;
  deletesRemoteAvatar?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        deletesRemoteAvatar
          ? `确定删除“${assetName}”吗？对应的 Seedance 自定义人像素材也会同步删除，删除后无法恢复。`
          : `确定删除“${assetName}”吗？删除后无法恢复。`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/assets`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assetId,
            assetType,
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "素材删除失败",
        );
      }
      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "素材删除失败",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="icon-button library-delete-button"
      aria-label={`删除 ${assetName}`}
      title={`删除 ${assetName}`}
      disabled={busy}
      onClick={remove}
    >
      <Trash2 size={15} />
    </button>
  );
}

export function LibraryImagePreview({
  sourceUrl,
  alt,
}: {
  sourceUrl: string;
  alt: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="library-image-thumb library-image-preview-trigger"
        aria-label={`放大查看 ${alt}`}
        onClick={() => setOpen(true)}
      >
        <img src={sourceUrl} alt={alt} />
      </button>
      {open && (
        <div
          className="modal-backdrop library-image-lightbox"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            className="library-image-lightbox-content"
            role="dialog"
            aria-modal="true"
            aria-label={alt}
          >
            <button
              type="button"
              className="icon-button"
              aria-label="关闭图片预览"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
            <img src={sourceUrl} alt={alt} />
            <strong>{alt}</strong>
          </div>
        </div>
      )}
    </>
  );
}
