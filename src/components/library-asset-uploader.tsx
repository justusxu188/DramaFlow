"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";

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

type Mode = "image" | "generate" | "highlight";
type GenerateMode = "text_to_image" | "capture_to_image";
type ImageAspectRatio = "9:16" | "16:9";
type CaptureJob = {
  id: string;
  timestamp: number;
  status: "running" | "completed" | "failed";
  error?: string;
};

type GenerateJob = {
  id: string;
  characterName: string;
  status: "running" | "completed" | "failed";
  error?: string;
};

type EditImageDetail = {
  projectId: string;
  assetId: string;
  characterName: string;
  lookName?: string;
  prompt?: string;
};

const editImageEventName = "library:edit-image";
const defaultGeneratePrompt =
  "参考人物的脸型、发型不变，生成人物的全身、从头到脚、正面形象，背景为纯白色";

async function uploadToTos(input: {
  projectId: string;
  file: File;
  assetType: "character_image" | "highlight";
}) {
  const response = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: input.projectId,
      fileName: input.file.name,
      mimeType: input.file.type,
      size: input.file.size,
      assetType: input.assetType,
    }),
  });
  const payload = await response.json() as {
    data?: { uploadUrl: string; sourceUrl: string; objectKey: string };
    error?: string;
  };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? "无法创建上传地址");
  }
  const upload = await fetch(payload.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.file.type },
    body: input.file,
  });
  if (!upload.ok) throw new Error(`文件上传失败 (${upload.status})`);
  return payload.data;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function uploadedImageName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  const baseName =
    extensionIndex > 0
      ? fileName.slice(0, extensionIndex)
      : fileName;
  return `${baseName}-上传图片`;
}

export function LibraryAssetUploader({
  projectId,
  sources,
  images,
  defaultImageModel = "seedream_5_0_pro",
  defaultMode = "image",
}: {
  projectId: string;
  sources: SourceOption[];
  images: ImageOption[];
  defaultImageModel?: "seedream_5_0_lite" | "seedream_5_0_pro";
  defaultMode?: Mode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [generateMode, setGenerateMode] =
    useState<GenerateMode>("text_to_image");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [characterName, setCharacterName] = useState("");
  const [lookName, setLookName] = useState("基准造型");
  const [viewType, setViewType] = useState("front");
  const [isBaseline, setIsBaseline] = useState(true);
  const [sourceAssetId, setSourceAssetId] = useState(sources[0]?.id ?? "");
  const [timestamp, setTimestamp] = useState(0);
  const [baselineAssetId, setBaselineAssetId] =
    useState("");
  const [prompt, setPrompt] = useState(
    defaultGeneratePrompt,
  );
  const [seedreamModel, setSeedreamModel] =
    useState<"seedream_5_0_lite" | "seedream_5_0_pro">(
      defaultImageModel,
    );
  const [imageAspectRatio, setImageAspectRatio] =
    useState<ImageAspectRatio>("9:16");
  const [highlightName, setHighlightName] = useState("");
  const [captureSubmitting, setCaptureSubmitting] = useState(false);
  const [captureJobs, setCaptureJobs] = useState<CaptureJob[]>([]);
  const [generateJobs, setGenerateJobs] = useState<GenerateJob[]>([]);
  const [operationMessage, setOperationMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const selectedSource = sources.find((source) => source.id === sourceAssetId);

  function show(nextMode: Mode) {
    if (nextMode === "generate") {
      setCharacterName("");
      setPrompt(defaultGeneratePrompt);
      setGenerateMode("text_to_image");
    }
    setMode(nextMode);
    setOpen(true);
    setError("");
    setOperationMessage("");
  }

  useEffect(() => {
    function editImage(event: Event) {
      const detail = (event as CustomEvent<EditImageDetail>).detail;
      if (detail.projectId !== projectId) return;
      show("generate");
      setCharacterName(`重绘-${detail.characterName}`);
      setLookName(detail.lookName ?? "新造型");
      setPrompt(detail.prompt || defaultGeneratePrompt);
      setBaselineAssetId(detail.assetId);
    }

    window.addEventListener(editImageEventName, editImage);
    return () => window.removeEventListener(editImageEventName, editImage);
  }, [projectId]);

  async function uploadImages() {
    if (!files.length || !characterName.trim() || !lookName.trim()) {
      setError("请选择图片并填写角色名和妆造名");
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        const stored = await uploadToTos({
          projectId,
          file,
          assetType: "character_image",
        });
        const response = await fetch(`/api/projects/${projectId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetType: "character_image",
            name: uploadedImageName(file.name),
            objectKey: stored.objectKey,
            sourceUrl: stored.sourceUrl,
            mimeType: file.type,
            sizeBytes: file.size,
            characterName,
            lookName,
            viewType,
            isBaseline,
          }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "图像资产登记失败");
      }
      setFiles([]);
      setOpen(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function pollCaptureTask(
    taskId: string,
    jobId: string,
    capture: {
      sourceAssetId: string;
      timestamp: number;
      characterName: string;
      lookName: string;
      viewType: string;
      isBaseline: boolean;
      prompt: string;
      model: typeof seedreamModel;
      aspectRatio: ImageAspectRatio;
    },
  ) {
    try {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (attempt > 0) await wait(2000);
        const completeResponse = await fetch(
          `/api/projects/${projectId}/assets/capture`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "complete",
              taskId,
              ...capture,
            }),
          },
        );
        const completed = await completeResponse.json() as {
          data?: {
            status?: string;
            id?: string;
          };
          error?: string;
        };
        if (!completeResponse.ok) {
          throw new Error(completed.error ?? "抽帧任务查询失败");
        }
        if (completeResponse.status === 201) {
          if (!completed.data?.id) {
            throw new Error("视频截图未返回中间资产");
          }
          setCaptureJobs((current) =>
            current.map((job) =>
              job.id === jobId
                ? { ...job, status: "completed" }
                : job,
            ),
          );
          await submitGeneration({
            baselineAssetId: completed.data.id,
            generationMode: "capture_to_image",
            characterName: capture.characterName,
            lookName: capture.lookName,
            prompt: capture.prompt,
            model: capture.model,
            viewType: capture.viewType,
            aspectRatio: capture.aspectRatio,
            isBaseline: capture.isBaseline,
          });
          return;
        }
        if (completed.data?.status === "failed") {
          throw new Error("MediaKit 抽帧失败");
        }
      }
      throw new Error("抽帧任务处理超时，请重新提交");
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "视频截图失败";
      setCaptureJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? { ...job, status: "failed", error: message }
            : job,
        ),
      );
    }
  }

  async function captureFrame() {
    if (
      !sourceAssetId ||
      !characterName.trim() ||
      !lookName.trim() ||
      !prompt.trim()
    ) {
      setError("请选择视频并填写角色、妆造和生成要求");
      return;
    }
    setCaptureSubmitting(true);
    setError("");
    try {
      const capture = {
        sourceAssetId,
        timestamp,
        characterName: characterName.trim(),
        lookName: lookName.trim(),
        viewType,
        isBaseline,
        prompt: prompt.trim(),
        model: seedreamModel,
        aspectRatio: imageAspectRatio,
      };
      const startResponse = await fetch(
        `/api/projects/${projectId}/assets/capture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            sourceAssetId: capture.sourceAssetId,
            timestamp: capture.timestamp,
          }),
        },
      );
      const started = await startResponse.json() as {
        data?: { id: string };
        error?: string;
      };
      if (!startResponse.ok || !started.data) {
        throw new Error(started.error ?? "抽帧任务提交失败");
      }
      const jobId = `${started.data.id}-${crypto.randomUUID()}`;
      setCaptureJobs((current) => [
        {
          id: jobId,
          timestamp: capture.timestamp,
          status: "running",
        },
        ...current,
      ]);
      void pollCaptureTask(started.data.id, jobId, capture);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "视频截图失败");
    } finally {
      setCaptureSubmitting(false);
    }
  }

  async function submitGeneration(request: {
    baselineAssetId?: string;
    generationMode:
      | "text_to_image"
      | "capture_to_image"
      | "reference_image";
    characterName: string;
    lookName: string;
    prompt: string;
    model: typeof seedreamModel;
    viewType: string;
    aspectRatio: ImageAspectRatio;
    isBaseline: boolean;
  }) {
    const jobId = crypto.randomUUID();
    setGenerateJobs((current) => [
      {
        id: jobId,
        characterName: request.characterName,
        status: "running",
      },
      ...current,
    ]);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/assets/generate-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "角色图片生成失败");
      }
      setGenerateJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? { ...job, status: "completed" }
            : job,
        ),
      );
      router.refresh();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "角色图片生成失败";
      setGenerateJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "failed",
                error: message,
              }
            : job,
        ),
      );
    }
  }

  async function generateLook() {
    if (
      !characterName.trim() ||
      !lookName.trim() ||
      !prompt.trim()
    ) {
      setError("请填写角色、妆造和生成图片提示词");
      return;
    }
    setError("");
    await submitGeneration({
      baselineAssetId: baselineAssetId || undefined,
      generationMode: baselineAssetId
        ? "reference_image"
        : "text_to_image",
      characterName: characterName.trim(),
      lookName: lookName.trim(),
      prompt: prompt.trim(),
      model: seedreamModel,
      viewType,
      aspectRatio: imageAspectRatio,
      isBaseline,
    });
  }

  async function uploadHighlight() {
    const videoFiles = files.filter((file) =>
      ["video/mp4", "video/quicktime"].includes(file.type) ||
      /\.(mp4|mov)$/i.test(file.name),
    );
    if (!videoFiles.length) {
      setError("请选择 MP4 或 MOV 高光视频");
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const [index, file] of videoFiles.entries()) {
        setOperationMessage(
          `正在上传 ${index + 1} / ${videoFiles.length}：${file.name}`,
        );
        const stored = await uploadToTos({
          projectId,
          file,
          assetType: "highlight",
        });
        const response = await fetch(`/api/projects/${projectId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetType: "highlight",
            name:
              videoFiles.length === 1 && highlightName.trim()
                ? highlightName.trim()
                : file.name,
            objectKey: stored.objectKey,
            sourceUrl: stored.sourceUrl,
            mimeType: file.type || (
              file.name.toLowerCase().endsWith(".mov")
                ? "video/quicktime"
                : "video/mp4"
            ),
            sizeBytes: file.size,
            durationMs: null,
            sourceAssetId: sourceAssetId || undefined,
            characterNames: [],
          }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `“${file.name}”登记失败`);
        }
      }
      setFiles([]);
      setHighlightName("");
      setOperationMessage("");
      setOpen(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "高光上传失败");
    } finally {
      setBusy(false);
      setOperationMessage("");
    }
  }

  return (
    <>
      <div className="library-asset-actions">
        <button className="button ghost" onClick={() => show("image")}>
          <ImagePlus size={15} /> 上传角色图片
        </button>
        <button className="button ghost" onClick={() => show("generate")}>
          <Sparkles size={15} /> 生成角色图片
        </button>
        <button className="button ghost" onClick={() => show("highlight")}>
          <Video size={15} /> 上传高光剪辑
        </button>
      </div>

      {open && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal library-upload-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-upload-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">PROJECT ASSET</p>
                <h2 id="library-upload-title">
                  {mode === "image"
                    ? "上传角色图片"
                    : mode === "generate"
                      ? "生成角色图片"
                      : "上传高光剪辑"}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>

            {mode !== "highlight" && (
              <div className="asset-form-grid">
                <label>
                  <span>角色名称</span>
                  <input
                    value={characterName}
                    onChange={(event) => setCharacterName(event.target.value)}
                    placeholder="例如：林夏"
                  />
                </label>
                <label>
                  <span>妆造名称</span>
                  <input
                    value={lookName}
                    onChange={(event) => setLookName(event.target.value)}
                    placeholder="例如：医院造型"
                  />
                </label>
                <label>
                  <span>画面类型</span>
                  <select
                    value={viewType}
                    onChange={(event) => setViewType(event.target.value)}
                  >
                    <option value="front">正面</option>
                    <option value="side">侧面</option>
                    <option value="half_body">半身</option>
                    <option value="full_body">全身</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                <label className="asset-checkbox">
                  <input
                    type="checkbox"
                    checked={isBaseline}
                    onChange={(event) => setIsBaseline(event.target.checked)}
                  />
                  设为该角色的基准图
                </label>
              </div>
            )}

            {mode === "image" && (
              <label className="library-file-picker">
                <ImagePlus size={22} />
                <strong>选择一张或多张角色图片</strong>
                <span>{files.length ? `${files.length} 张已选择` : "JPG、PNG、WebP"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) =>
                    setFiles(Array.from(event.target.files ?? []))}
                />
              </label>
            )}

            {mode === "generate" && (
              <>
                <div className="library-generation-modes" role="tablist">
                  <button
                    className={generateMode === "text_to_image" ? "active" : ""}
                    role="tab"
                    aria-selected={generateMode === "text_to_image"}
                    onClick={() => setGenerateMode("text_to_image")}
                  >
                    <Sparkles size={15} /> 文生图
                  </button>
                  <button
                    className={generateMode === "capture_to_image" ? "active" : ""}
                    role="tab"
                    aria-selected={generateMode === "capture_to_image"}
                    onClick={() => setGenerateMode("capture_to_image")}
                  >
                    <Camera size={15} /> 视频截图
                  </button>
                </div>
                {generateMode === "capture_to_image" && (
                  <div className="capture-workspace">
                    <label>
                      <span>源视频</span>
                      <select
                        aria-label="源视频"
                        value={sourceAssetId}
                        onChange={(event) => {
                          setSourceAssetId(event.target.value);
                          setTimestamp(0);
                        }}
                      >
                        {sources.map((source) => (
                          <option value={source.id} key={source.id}>
                            {source.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedSource ? (
                      <>
                        <video
                          ref={videoRef}
                          src={selectedSource.sourceUrl}
                          controls
                          playsInline
                          onTimeUpdate={(event) =>
                            setTimestamp(event.currentTarget.currentTime)}
                        />
                        <div className="capture-time">
                          <input
                            aria-label="截图时间"
                            type="range"
                            min="0"
                            max={Math.max(
                              1,
                              (selectedSource.durationMs ?? 0) / 1000,
                            )}
                            step="0.001"
                            value={timestamp}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              setTimestamp(value);
                              if (videoRef.current) {
                                videoRef.current.currentTime = value;
                              }
                            }}
                          />
                          <strong>{timestamp.toFixed(3)} 秒</strong>
                        </div>
                      </>
                    ) : (
                      <div className="library-empty-folder">
                        当前项目没有源视频
                      </div>
                    )}
                  </div>
                )}
                <div className="seedream-form">
                {generateMode === "text_to_image" && (
                  <label>
                    <span>参考已有角色图（可选）</span>
                    <select
                      aria-label="基准图"
                      value={baselineAssetId}
                      onChange={(event) =>
                        setBaselineAssetId(event.target.value)}
                    >
                      <option value="">无（直接文生图）</option>
                      {images.map((image) => (
                        <option value={image.id} key={image.id}>
                          {image.characterName} · {image.lookName ?? image.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span>画面宽高比</span>
                  <select
                    value={imageAspectRatio}
                    onChange={(event) =>
                      setImageAspectRatio(
                        event.target.value as ImageAspectRatio,
                      )}
                  >
                    <option value="9:16">9:16 竖屏</option>
                    <option value="16:9">16:9 横屏</option>
                  </select>
                  <small>
                    {seedreamModel === "seedream_5_0_lite"
                      ? imageAspectRatio === "9:16"
                        ? "2304 × 4096"
                        : "4096 × 2304"
                      : imageAspectRatio === "9:16"
                        ? "1152 × 2048"
                        : "2048 × 1152"}
                  </small>
                </label>
                <label>
                  <span>图片模型</span>
                  <select
                    value={seedreamModel}
                    onChange={(event) =>
                      setSeedreamModel(
                        event.target.value as typeof seedreamModel,
                      )}
                  >
                    <option value="seedream_5_0_lite">Seedream 5.0 Lite</option>
                    <option value="seedream_5_0_pro">Seedream 5.0 Pro</option>
                  </select>
                </label>
                <label>
                  <span>输入生成图片提示词</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="例如：医院场景，浅色病号服，干净自然妆，正面半身定妆照"
                  />
                </label>
              </div>
              </>
            )}

            {mode === "highlight" && (
              <div className="seedream-form">
                <label>
                  <span>高光名称</span>
                  <input
                    value={highlightName}
                    onChange={(event) => setHighlightName(event.target.value)}
                    placeholder={
                      files.length > 1
                        ? "多文件上传时分别使用原文件名"
                        : "选择文件后默认显示原文件名"
                    }
                    disabled={files.length > 1}
                  />
                </label>
                <label>
                  <span>关联源视频（可选）</span>
                  <select
                    value={sourceAssetId}
                    onChange={(event) => setSourceAssetId(event.target.value)}
                  >
                    <option value="">不关联源视频</option>
                    {sources.map((source) => (
                      <option value={source.id} key={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="library-file-picker">
                  <Upload size={22} />
                  <strong>选择一个或多个高光视频</strong>
                  <span>
                    {files.length
                      ? files.length === 1
                        ? files[0].name
                        : `已选择 ${files.length} 个文件`
                      : "MP4、MOV"}
                  </span>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime"
                    multiple
                    onChange={(event) => {
                      const selected = Array.from(event.target.files ?? []);
                      setFiles(selected);
                      setHighlightName(
                        selected.length === 1 ? selected[0].name : "",
                      );
                    }}
                  />
                </label>
                <label className="library-folder-picker">
                  <Upload size={16} />
                  <span>选择文件夹</span>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,.mp4,.mov"
                    multiple
                    ref={(input) => {
                      input?.setAttribute("webkitdirectory", "");
                      input?.setAttribute("directory", "");
                    }}
                    onChange={(event) => {
                      const selected = Array.from(event.target.files ?? []);
                      setFiles(selected);
                      setHighlightName(
                        selected.length === 1 ? selected[0].name : "",
                      );
                    }}
                  />
                </label>
              </div>
            )}

            {operationMessage && (
              <div className="pipeline-callout">
                <LoaderCircle className="spin" size={15} />
                {operationMessage}
              </div>
            )}
            {mode === "generate" &&
              generateMode === "capture_to_image" &&
              captureJobs.length > 0 && (
              <div className="capture-job-list" aria-live="polite">
                {captureJobs.map((job) => (
                  <div key={job.id} data-status={job.status}>
                    {job.status === "running" ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : job.status === "completed" ? (
                      <span aria-hidden="true">✓</span>
                    ) : (
                      <span aria-hidden="true">!</span>
                    )}
                    <strong>{job.timestamp.toFixed(3)} 秒</strong>
                    <small>
                      {job.status === "running"
                        ? "正在截取参考画面"
                        : job.status === "completed"
                          ? "截图完成，已继续生成角色图片"
                          : job.error}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {mode === "generate" && generateJobs.length > 0 && (
              <div className="capture-job-list" aria-live="polite">
                {generateJobs.map((job) => (
                  <div key={job.id} data-status={job.status}>
                    {job.status === "running" ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : job.status === "completed" ? (
                      <span aria-hidden="true">✓</span>
                    ) : (
                      <span aria-hidden="true">!</span>
                    )}
                    <strong>{job.characterName}</strong>
                    <small>
                      {job.status === "running"
                        ? "后台生成中，可继续操作"
                        : job.status === "completed"
                          ? "已保存"
                          : job.error}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {error && <div className="pipeline-callout error">{error}</div>}
            <div className="modal-actions">
              <button className="button ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                className="button primary"
                disabled={
                  mode === "generate" &&
                  generateMode === "capture_to_image"
                    ? captureSubmitting
                    : mode === "generate" ? false : busy
                }
                onClick={() =>
                  void (
                    mode === "image"
                      ? uploadImages()
                      : mode === "generate"
                        ? generateMode === "capture_to_image"
                          ? captureFrame()
                          : generateLook()
                          : uploadHighlight()
                  )}
              >
                {mode === "generate" &&
                generateMode === "capture_to_image" &&
                captureSubmitting
                  ? <LoaderCircle className="spin" size={15} />
                  : busy && mode !== "generate"
                    ? <LoaderCircle className="spin" size={15} />
                    : mode === "generate"
                      ? generateMode === "capture_to_image"
                        ? <Camera size={15} />
                        : <Sparkles size={15} />
                      : <Upload size={15} />}
                {mode === "generate" &&
                generateMode === "capture_to_image" &&
                captureSubmitting
                  ? "正在提交"
                  : busy && mode !== "generate"
                    ? "处理中"
                    : mode === "generate"
                      ? generateMode === "capture_to_image"
                        ? "截图并生成"
                        : "生成并保存"
                      : "上传并保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
