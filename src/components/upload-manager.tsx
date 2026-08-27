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

export type SourceUploadJob = {
  id: string;
  projectId: string;
  projectName: string;
  file: File;
  episodeNumber: number;
  progress: number;
  status: UploadStatus;
  error?: string;
};

type EnqueueInput = {
  projectId: string;
  projectName: string;
  files: File[];
};

type UploadManagerValue = {
  enqueueSourceUploads: (input: EnqueueInput) => void;
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
  const seen = new Set<string>();
  return files.filter((file) => {
    const valid =
      ["video/mp4", "video/quicktime"].includes(
        file.type,
      ) || /\.(mp4|mov)$/i.test(file.name);
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!valid || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceMimeType(file: File) {
  return file.type === "video/quicktime"
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
      sourceMimeType(file),
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
  const [jobs, setJobs] = useState<SourceUploadJob[]>(
    [],
  );
  const [expanded, setExpanded] = useState(true);
  const jobsRef = useRef<SourceUploadJob[]>([]);

  const updateJob = useCallback(
    (
      id: string,
      patch: Partial<SourceUploadJob>,
    ) => {
      jobsRef.current = jobsRef.current.map((job) =>
        job.id === id ? { ...job, ...patch } : job,
      );
      setJobs(jobsRef.current);
    },
    [],
  );

  const uploadJob = useCallback(
    async (job: SourceUploadJob) => {
      updateJob(job.id, {
        status: "uploading",
        progress: 0,
        error: undefined,
      });
      try {
        const durationMs =
          await probeVideoDuration(job.file);
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
              mimeType: sourceMimeType(job.file),
              size: job.file.size,
              assetType: "source",
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
            body: JSON.stringify({
              uploadMode: "episodes",
              name: job.file.name,
              objectKey: signPayload.data.objectKey,
              sourceUrl: signPayload.data.sourceUrl,
              mimeType: sourceMimeType(job.file),
              sizeBytes: job.file.size,
              durationMs,
              episodeNumber: job.episodeNumber,
            }),
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
    async (nextJobs: SourceUploadJob[]) => {
      for (const job of nextJobs) {
        await uploadJob(job);
      }
    },
    [uploadJob],
  );

  const enqueueSourceUploads = useCallback(
    (input: EnqueueInput) => {
      const files = sourceVideoFiles(input.files);
      if (!files.length) return;
      const now = Date.now();
      const nextJobs = files
        .map((file, index) => ({
          id: `${input.projectId}:${now}:${index}`,
          projectId: input.projectId,
          projectName: input.projectName,
          file,
          episodeNumber:
            episodeNumberFromFileName(
              file.name,
              index + 1,
            ),
          progress: 0,
          status: "waiting" as const,
        }))
        .sort(
          (a, b) =>
            a.episodeNumber - b.episodeNumber,
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
      value={{ enqueueSourceUploads }}
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
                  <FileVideo2 size={15} />
                  <div>
                    <strong>{job.file.name}</strong>
                    <small>
                      {job.projectName} · 第{" "}
                      {job.episodeNumber} 集
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
