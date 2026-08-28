"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileVideo2,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { probeVideoDuration } from "@/lib/video-duration";

type UploadStatus =
  | "waiting"
  | "uploading"
  | "completed"
  | "failed";

export type ProjectUploadTarget =
  | "source"
  | "character_image"
  | "highlight";

export type AssetUploadJob = {
  id: string;
  projectId: string;
  projectName: string;
  file: File;
  assetType: ProjectUploadTarget;
  episodeNumber?: number;
  progress: number;
  status: UploadStatus;
  error?: string;
};

type EnqueueInput = {
  projectId: string;
  projectName: string;
  files: File[];
  assetType: ProjectUploadTarget;
};

type SourceEnqueueInput = Omit<
  EnqueueInput,
  "assetType"
>;

type UploadManagerValue = {
  enqueueAssetUploads: (input: EnqueueInput) => void;
  enqueueSourceUploads: (
    input: SourceEnqueueInput,
  ) => void;
};

const UploadManagerContext =
  createContext<UploadManagerValue | null>(null);

export function episodeNumberFromFileName(
  name: string,
  fallback: number,
) {
  const baseName = name.replace(/\.[^.]+$/, "");
  const matches = baseName.match(/\d+/g);
  return matches?.length
    ? Number(matches[matches.length - 1])
    : fallback;
}

export function sourceVideoFiles(files: File[]) {
  return uploadFilesForTarget(files, "source");
}

function uniqueMatchingFiles(
  files: File[],
  validFile: (file: File) => boolean,
) {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!validFile(file) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function uploadFilesForTarget(
  files: File[],
  target: ProjectUploadTarget,
) {
  return uniqueMatchingFiles(files, (file) =>
    target === "character_image"
      ? ["image/jpeg", "image/png", "image/webp"].includes(
          file.type,
        ) || /\.(jpe?g|png|webp)$/i.test(file.name)
      : ["video/mp4", "video/quicktime"].includes(
          file.type,
        ) || /\.(mp4|mov)$/i.test(file.name),
  );
}

export function uploadAssetName(
  file: File,
  target: ProjectUploadTarget,
) {
  if (target !== "character_image") return file.name;
  return `${file.name.replace(/\.[^.]+$/, "")}-上传图片`;
}

export function uploadMimeType(file: File) {
  if (
    file.type === "image/jpeg" ||
    /\.jpe?g$/i.test(file.name)
  ) {
    return "image/jpeg";
  }
  if (
    file.type === "image/png" ||
    /\.png$/i.test(file.name)
  ) {
    return "image/png";
  }
  if (
    file.type === "image/webp" ||
    /\.webp$/i.test(file.name)
  ) {
    return "image/webp";
  }
  return file.type === "video/quicktime" ||
    /\.mov$/i.test(file.name)
    ? "video/quicktime"
    : "video/mp4";
}

function putFile(
  url: string,
  file: File,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader(
      "Content-Type",
      uploadMimeType(file),
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(
          Math.round(
            (event.loaded / event.total) * 100,
          ),
        );
      }
    };
    request.onload = () => {
      if (
        request.status >= 200 &&
        request.status < 300
      ) {
        resolve();
        return;
      }
      reject(
        new Error(
          `TOS 上传失败（HTTP ${request.status}）`,
        ),
      );
    };
    request.onerror = () =>
      reject(
        new Error(
          "无法连接 TOS，请检查网络或存储桶 CORS 配置",
        ),
      );
    request.send(file);
  });
}

export function useUploadManager() {
  const value = useContext(UploadManagerContext);
  if (!value) {
    throw new Error(
      "useUploadManager 必须在 UploadManagerProvider 内使用",
    );
  }
  return value;
}

export function UploadManagerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<AssetUploadJob[]>(
    [],
  );
  const [expanded, setExpanded] = useState(true);
  const jobsRef = useRef<AssetUploadJob[]>([]);

  const updateJob = useCallback(
    (
      id: string,
      patch: Partial<AssetUploadJob>,
    ) => {
      jobsRef.current = jobsRef.current.map((job) =>
        job.id === id ? { ...job, ...patch } : job,
      );
      setJobs(jobsRef.current);
    },
    [],
  );

  const uploadJob = useCallback(
    async (job: AssetUploadJob) => {
      updateJob(job.id, {
        status: "uploading",
        progress: 0,
        error: undefined,
      });
      try {
        const durationMs =
          job.assetType === "character_image"
            ? null
            : await probeVideoDuration(job.file);
        const signResponse = await fetch(
          "/api/uploads/sign",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              projectId: job.projectId,
              fileName: job.file.name,
              mimeType: uploadMimeType(job.file),
              size: job.file.size,
              assetType: job.assetType,
            }),
          },
        );
        const signPayload =
          (await signResponse.json()) as {
            data?: {
              uploadUrl: string;
              sourceUrl: string;
              objectKey: string;
            };
            error?: string;
          };
        if (!signResponse.ok || !signPayload.data) {
          throw new Error(
            signPayload.error ?? "无法创建上传地址",
          );
        }
        await putFile(
          signPayload.data.uploadUrl,
          job.file,
          (progress) =>
            updateJob(job.id, { progress }),
        );
        const assetResponse = await fetch(
          `/api/projects/${job.projectId}/assets`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              job.assetType === "character_image"
                ? {
                    assetType: "character_image",
                    name: uploadAssetName(
                      job.file,
                      job.assetType,
                    ),
                    objectKey:
                      signPayload.data.objectKey,
                    sourceUrl:
                      signPayload.data.sourceUrl,
                    mimeType: uploadMimeType(job.file),
                    sizeBytes: job.file.size,
                    characterName: job.file.name.replace(
                      /\.[^.]+$/,
                      "",
                    ),
                    lookName: "上传图片",
                    viewType: "other",
                    isBaseline: false,
                  }
                : job.assetType === "highlight"
                  ? {
                      assetType: "highlight",
                      name: uploadAssetName(
                        job.file,
                        job.assetType,
                      ),
                      objectKey:
                        signPayload.data.objectKey,
                      sourceUrl:
                        signPayload.data.sourceUrl,
                      mimeType:
                        uploadMimeType(job.file),
                      sizeBytes: job.file.size,
                      durationMs,
                    }
                  : {
                      uploadMode: "episodes",
                      name: uploadAssetName(
                        job.file,
                        job.assetType,
                      ),
                      objectKey:
                        signPayload.data.objectKey,
                      sourceUrl:
                        signPayload.data.sourceUrl,
                      mimeType:
                        uploadMimeType(job.file),
                      sizeBytes: job.file.size,
                      durationMs,
                      episodeNumber: job.episodeNumber,
                    },
            ),
          },
        );
        const assetPayload =
          (await assetResponse.json()) as {
            error?: string;
          };
        if (!assetResponse.ok) {
          throw new Error(
            assetPayload.error ?? "素材登记失败",
          );
        }
        updateJob(job.id, {
          status: "completed",
          progress: 100,
        });
        router.refresh();
      } catch (error) {
        updateJob(job.id, {
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "上传失败",
        });
      }
    },
    [router, updateJob],
  );

  const processJobs = useCallback(
    async (nextJobs: AssetUploadJob[]) => {
      for (const job of nextJobs) {
        await uploadJob(job);
      }
    },
    [uploadJob],
  );

  const enqueueAssetUploads = useCallback(
    (input: EnqueueInput) => {
      const files = uploadFilesForTarget(
        input.files,
        input.assetType,
      );
      if (!files.length) return;
      const now = Date.now();
      const nextJobs = files
        .map((file, index) => ({
          id: `${input.projectId}:${now}:${index}`,
          projectId: input.projectId,
          projectName: input.projectName,
          file,
          assetType: input.assetType,
          episodeNumber:
            input.assetType === "source"
              ? episodeNumberFromFileName(
                  file.name,
                  index + 1,
                )
              : undefined,
          progress: 0,
          status: "waiting" as const,
        }))
        .sort((a, b) =>
          input.assetType === "source"
            ? (a.episodeNumber ?? 0) -
              (b.episodeNumber ?? 0)
            : 0,
        );
      jobsRef.current = [
        ...jobsRef.current,
        ...nextJobs,
      ];
      setJobs(jobsRef.current);
      setExpanded(true);
      void processJobs(nextJobs);
    },
    [processJobs],
  );
  const enqueueSourceUploads = useCallback(
    (input: SourceEnqueueInput) =>
      enqueueAssetUploads({
        ...input,
        assetType: "source",
      }),
    [enqueueAssetUploads],
  );

  const activeCount = jobs.filter((job) =>
    ["waiting", "uploading"].includes(job.status),
  ).length;
  const completedCount = jobs.filter(
    (job) => job.status === "completed",
  ).length;
  const failedCount = jobs.filter(
    (job) => job.status === "failed",
  ).length;
  const totalProgress = jobs.length
    ? Math.round(
        jobs.reduce(
          (sum, job) => sum + job.progress,
          0,
        ) / jobs.length,
      )
    : 0;

  return (
    <UploadManagerContext.Provider
      value={{
        enqueueAssetUploads,
        enqueueSourceUploads,
      }}
    >
      {children}
      {jobs.length > 0 && (
        <aside
          className="background-upload-panel"
          aria-label="后台素材上传"
        >
          <header>
            <span>
              {activeCount ? (
                <LoaderCircle
                  className="spin"
                  size={16}
                />
              ) : (
                <Upload size={16} />
              )}
            </span>
            <div>
              <strong>素材后台上传</strong>
              <small>
                {activeCount
                  ? `${totalProgress}% · ${activeCount} 个处理中`
                  : `${completedCount} 个完成${
                      failedCount
                        ? ` · ${failedCount} 个失败`
                        : ""
                    }`}
              </small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={
                expanded
                  ? "收起上传详情"
                  : "展开上传详情"
              }
              onClick={() =>
                setExpanded((current) => !current)
              }
            >
              {expanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronUp size={16} />
              )}
            </button>
            {!activeCount && (
              <button
                type="button"
                className="icon-button"
                aria-label="关闭上传记录"
                onClick={() => {
                  jobsRef.current = [];
                  setJobs([]);
                }}
              >
                <X size={16} />
              </button>
            )}
          </header>
          <i className="background-upload-progress">
            <em
              style={{ width: `${totalProgress}%` }}
            />
          </i>
          {expanded && (
            <div className="background-upload-list">
              {jobs.map((job) => (
                <article key={job.id}>
                  {job.assetType ===
                  "character_image" ? (
                    <ImageIcon size={15} />
                  ) : (
                    <FileVideo2 size={15} />
                  )}
                  <div>
                    <strong>{job.file.name}</strong>
                    <small>
                      {job.projectName} ·{" "}
                      {job.assetType === "source"
                        ? `源视频 · 第 ${job.episodeNumber} 集`
                        : job.assetType ===
                            "character_image"
                          ? "图像资产"
                          : "高光剪辑"}
                    </small>
                    {job.error && <p>{job.error}</p>}
                  </div>
                  <span
                    className={`upload-state ${job.status}`}
                  >
                    {job.status === "uploading" &&
                      `${job.progress}%`}
                    {job.status === "waiting" &&
                      "等待"}
                    {job.status === "completed" && (
                      <>
                        <Check size={14} /> 完成
                      </>
                    )}
                    {job.status === "failed" && (
                      <button
                        type="button"
                        aria-label={`重试 ${job.file.name}`}
                        onClick={() =>
                          void uploadJob(job)
                        }
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                  </span>
                </article>
              ))}
            </div>
          )}
        </aside>
      )}
    </UploadManagerContext.Provider>
  );
}
