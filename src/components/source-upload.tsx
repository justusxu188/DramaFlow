"use client";

import { useRef, useState } from "react";
import {
  Check,
  FileVideo2,
  LoaderCircle,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { probeVideoDuration } from "@/lib/video-duration";

type UploadMode = "episodes" | "full";
type UploadStatus = "waiting" | "uploading" | "completed" | "failed";

type UploadItem = {
  id: string;
  file: File;
  episodeNumber: number | null;
  progress: number;
  status: UploadStatus;
  error?: string;
};

function episodeFromName(name: string, fallback: number) {
  const baseName = name.replace(/\.[^.]+$/, "");
  const matches = baseName.match(/\d+/g);
  return matches?.length ? Number(matches[matches.length - 1]) : fallback;
}

function putFile(url: string, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader(
      "Content-Type",
      file.type === "video/quicktime" ? "video/quicktime" : "video/mp4",
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        let detail = "";
        try {
          const payload = JSON.parse(request.responseText) as {
            Code?: string;
            Message?: string;
          };
          detail = payload.Code ? `：${payload.Code}${payload.Message ? ` ${payload.Message}` : ""}` : "";
        } catch {
          detail = request.responseText ? `：${request.responseText.slice(0, 120)}` : "";
        }
        reject(new Error(`TOS 上传失败（HTTP ${request.status}）${detail}`));
      }
    };
    request.onerror = () => reject(new Error("无法连接 TOS，请检查 Endpoint、网络或存储桶 CORS 配置"));
    request.send(file);
  });
}

export function SourceUpload({
  projectId,
  onUploaded,
  compact = false,
}: {
  projectId: string;
  onUploaded?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<UploadMode>("episodes");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const allCompleted = items.length > 0 && items.every((item) => item.status === "completed");
  const failedCount = items.filter((item) => item.status === "failed").length;
  const pendingCount = items.filter((item) => item.status !== "completed").length;

  function selectFiles(files: FileList | null) {
    if (!files?.length) return;
    const valid = Array.from(files).filter((file) =>
      ["video/mp4", "video/quicktime"].includes(file.type) ||
      /\.(mp4|mov)$/i.test(file.name),
    );
    const selected = mode === "full" ? valid.slice(0, 1) : valid;
    const prepared = selected.map((file, index) => ({
      id: `${file.name}-${file.size}-${index}`,
      file,
      episodeNumber: mode === "episodes" ? episodeFromName(file.name, index + 1) : null,
      progress: 0,
      status: "waiting" as const,
    }));
    prepared.sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
    setItems(prepared);
  }

  function switchMode(nextMode: UploadMode) {
    setMode(nextMode);
    setItems([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((current) =>
      current.map((item) => item.id === id ? { ...item, ...patch } : item),
    );
  }

  async function uploadItem(item: UploadItem) {
    updateItem(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const durationMs = await probeVideoDuration(item.file);
      const signResponse = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          fileName: item.file.name,
          mimeType: item.file.type === "video/quicktime" ? "video/quicktime" : "video/mp4",
          size: item.file.size,
        }),
      });
      const signPayload = await signResponse.json() as {
        data?: { uploadUrl: string; sourceUrl: string; objectKey: string };
        error?: string;
      };
      if (!signResponse.ok || !signPayload.data) {
        throw new Error(signPayload.error ?? "无法创建上传地址");
      }
      await putFile(signPayload.data.uploadUrl, item.file, (progress) =>
        updateItem(item.id, { progress }),
      );
      const assetResponse = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadMode: mode,
          name: item.file.name,
          objectKey: signPayload.data.objectKey,
          sourceUrl: signPayload.data.sourceUrl,
          mimeType: item.file.type === "video/quicktime" ? "video/quicktime" : "video/mp4",
          sizeBytes: item.file.size,
          durationMs,
          episodeNumber: mode === "episodes" ? item.episodeNumber : null,
        }),
      });
      const assetPayload = await assetResponse.json() as { error?: string };
      if (!assetResponse.ok) throw new Error(assetPayload.error ?? "素材登记失败");
      updateItem(item.id, { status: "completed", progress: 100 });
      return true;
    } catch (error) {
      updateItem(item.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "上传失败",
      });
      return false;
    }
  }

  async function uploadAll() {
    setUploading(true);
    let completed = false;
    for (const item of items.filter((current) => current.status !== "completed")) {
      completed = (await uploadItem(item)) || completed;
    }
    setUploading(false);
    if (completed) onUploaded?.();
  }

  return (
    <>
      <button
        className={`button primary ${compact ? "" : "wide"}`}
        onClick={() => setOpen(true)}
      >
        <Upload size={16} /> 上传原始剧集
      </button>

      {open && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SOURCE INGEST</p>
                <h2 id="upload-title">上传原始剧集</h2>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <div className="upload-mode-tabs" role="tablist" aria-label="上传方式">
              <button className={mode === "episodes" ? "active" : ""} onClick={() => switchMode("episodes")}>
                分集批量上传
              </button>
              <button className={mode === "full" ? "active" : ""} onClick={() => switchMode("full")}>
                整剧单文件
              </button>
            </div>

            <button className="upload-dropzone" onClick={() => inputRef.current?.click()}>
              <Upload size={24} />
              <strong>{mode === "episodes" ? "选择多集 MP4 / MOV" : "选择一个整剧 MP4 / MOV"}</strong>
              <span>
                {mode === "episodes"
                  ? "自动读取文件名中的集数并排序，可在上传前修正"
                  : "上传后可在剧情理解阶段进行场景或分集切分"}
              </span>
            </button>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept=".mp4,.mov,video/mp4,video/quicktime"
              multiple={mode === "episodes"}
              onChange={(event) => selectFiles(event.target.files)}
              aria-label="选择原始剧集文件"
            />

            {items.length > 0 && (
              <div className="upload-list">
                {items.map((item) => (
                  <article key={item.id}>
                    <span className="upload-file-icon"><FileVideo2 size={17} /></span>
                    {mode === "episodes" && (
                      <label>
                        第
                        <input
                          aria-label={`${item.file.name} 集数`}
                          type="number"
                          min={1}
                          max={500}
                          value={item.episodeNumber ?? 1}
                          disabled={item.status === "uploading" || item.status === "completed"}
                          onChange={(event) => updateItem(item.id, { episodeNumber: Number(event.target.value) })}
                        />
                        集
                      </label>
                    )}
                    <div className="upload-file-copy">
                      <strong>{item.file.name}</strong>
                      <small>{(item.file.size / 1024 / 1024).toFixed(1)} MB</small>
                      <i><em style={{ width: `${item.progress}%` }} /></i>
                      {item.error && <p>{item.error}</p>}
                    </div>
                    <span className={`upload-state ${item.status}`}>
                      {item.status === "uploading" && <LoaderCircle className="spin" size={15} />}
                      {item.status === "completed" && <Check size={15} />}
                      {item.status === "failed" && (
                        <button aria-label={`重试 ${item.file.name}`} onClick={() => void uploadItem(item)}>
                          <RefreshCw size={14} />
                        </button>
                      )}
                      {item.status === "waiting" ? "待上传" : item.status === "uploading" ? `${item.progress}%` : item.status === "completed" ? "完成" : "失败"}
                    </span>
                  </article>
                ))}
              </div>
            )}

            <div className="modal-actions">
              {!allCompleted && <button className="button ghost" onClick={() => setOpen(false)}>稍后上传</button>}
              <button
                className={`button primary ${allCompleted ? "upload-complete-button" : ""}`}
                disabled={!items.length || uploading}
                onClick={allCompleted ? () => setOpen(false) : uploadAll}
              >
                {uploading
                  ? <LoaderCircle className="spin" size={16} />
                  : allCompleted
                    ? <Check size={16} />
                    : failedCount
                      ? <RefreshCw size={16} />
                      : <Upload size={16} />}
                {uploading
                  ? "正在上传"
                  : allCompleted
                    ? "上传完成"
                    : failedCount
                      ? `重试失败 ${failedCount}`
                      : `开始上传 ${pendingCount || ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
