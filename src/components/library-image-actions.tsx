"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FilePenLine,
  LoaderCircle,
  Pencil,
  RefreshCw,
  UserRoundPlus,
  X,
} from "lucide-react";
import { LibraryAssetDeleteButton } from "@/components/library-asset-controls";

export function LibraryImageActions({
  projectId,
  assetId,
  assetName,
  sourceUrl,
  characterName,
  lookName,
  prompt,
  avatarAssetId,
  avatarStatus,
  avatarError,
}: {
  projectId: string;
  assetId: string;
  assetName: string;
  sourceUrl: string;
  characterName: string;
  lookName?: string;
  prompt?: string;
  avatarAssetId?: string;
  avatarStatus?: "processing" | "active" | "failed";
  avatarError?: string;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [nextName, setNextName] = useState(assetName);
  const [saving, setSaving] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] =
    useState(false);
  const [error, setError] = useState("");

  async function renameImage() {
    const name = nextName.trim();
    if (!name) {
      setError("请输入图片名称");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/assets`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "rename_image",
            assetId,
            name,
          }),
        },
      );
      const payload = await response.json() as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "图片重命名失败",
        );
      }
      setRenaming(false);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "图片重命名失败",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateAvatar() {
    setUpdatingAvatar(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/assets/avatar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: avatarAssetId
              ? "refresh"
              : "register",
            assetId,
          }),
        },
      );
      const payload = await response.json() as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "虚拟人像状态更新失败",
        );
      }
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "虚拟人像状态更新失败",
      );
    } finally {
      setUpdatingAvatar(false);
    }
  }

  return (
    <>
      <div className="library-item-actions">
        <a
          href={sourceUrl}
          download={assetName}
          aria-label={`下载 ${assetName}`}
          title="下载"
        >
          <Download size={15} />
        </a>
        <button
          type="button"
          className="button ghost avatar-store-button"
          aria-label={
            avatarAssetId
              ? `刷新 ${assetName} 的虚拟人像状态`
              : `将 ${assetName} 登记为虚拟人像`
          }
          title={
            avatarAssetId
              ? "刷新虚拟人像状态"
              : "登记为虚拟人像"
          }
          disabled={updatingAvatar}
          onClick={() => void updateAvatar()}
        >
          {updatingAvatar || avatarAssetId ? (
            <RefreshCw
              className={
                updatingAvatar ? "spin" : undefined
              }
              size={15}
            />
          ) : (
            <UserRoundPlus size={15} />
          )}
          {avatarAssetId
            ? avatarStatus === "active"
              ? "已入库"
              : "刷新"
            : "入库"}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`重命名 ${assetName}`}
          title="重命名"
          onClick={() => {
            setNextName(assetName);
            setError("");
            setRenaming(true);
          }}
        >
          <FilePenLine size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`编辑 ${assetName}`}
          title="基于此图生成新妆照"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("library:edit-image", {
                detail: {
                  projectId,
                  assetId,
                  characterName,
                  lookName,
                  prompt,
                },
              }),
            );
          }}
        >
          <Pencil size={15} />
        </button>
        <LibraryAssetDeleteButton
          projectId={projectId}
          assetId={assetId}
          assetType="character_image"
          assetName={assetName}
          deletesRemoteAvatar={Boolean(avatarAssetId)}
        />
      </div>
      {avatarStatus && (
        <div
          className={`avatar-asset-state ${avatarStatus}`}
        >
          {avatarStatus === "active"
            ? "虚拟人像可用"
            : avatarStatus === "processing"
              ? "虚拟人像处理中"
              : "虚拟人像处理失败"}
        </div>
      )}
      {(avatarError || error) && (
        <div className="avatar-asset-error">
          {avatarError || error}
        </div>
      )}
      {renaming && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`rename-image-${assetId}`}
          >
            <div className="modal-heading">
              <h2 id={`rename-image-${assetId}`}>
                重命名图片
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭"
                onClick={() => setRenaming(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              图片名称
              <input
                autoFocus
                value={nextName}
                onChange={(event) =>
                  setNextName(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void renameImage();
                  }
                }}
              />
            </label>
            {error && (
              <div className="pipeline-callout error">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setRenaming(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="button primary"
                disabled={saving}
                onClick={() => void renameImage()}
              >
                {saving && (
                  <LoaderCircle
                    className="spin"
                    size={15}
                  />
                )}
                保存名称
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
