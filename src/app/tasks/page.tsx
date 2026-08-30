import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock3,
  Gauge,
  LoaderCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  listPipelineJobs,
  listPipelineRuns,
} from "@/lib/pipeline-store";
import {
  pipelineTaskDisplayStatus,
  pipelineTaskEvidence,
} from "@/lib/pipeline-task-verification";
import { listProjects } from "@/lib/project-store";

export const dynamic = "force-dynamic";

const stageNames: Record<string, string> = {
  analysis: "剧情理解（故事线分析）",
  highlight_analysis: "高光剧情理解",
  highlight_context: "共享剧情上下文",
  mine_arcs: "爽点提炼",
  highlight: "高光剪辑",
  transition: "高光开头理解",
  scripts: "前贴脚本",
  preroll: "AI 前贴视频",
  post_production: "AI 前贴后期处理",
  compose: "合成成片",
};

const postProductionNames: Record<string, string> = {
  asr: "字幕识别",
  erase_subtitles: "字幕擦除",
  add_subtitles: "添加字幕",
  enhance: "画质增强",
};

const workflowNames: Record<string, string> = {
  full_drama: "全链路素材创作",
  uploaded_highlights: "高光前贴创作",
  batch_highlights: "批量高光剪辑",
};

const workflowIds: Record<string, string> = {
  full_drama: "full-chain",
  uploaded_highlights: "highlight-preroll",
  batch_highlights: "batch-highlights",
};

const statusNames: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  completed: "成功",
  failed: "失败",
  unverified: "结果异常",
};

function TaskStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <Check size={13} />;
  if (status === "failed") return <X size={13} />;
  if (status === "unverified") {
    return <TriangleAlert size={13} />;
  }
  if (status === "running") {
    return <LoaderCircle className="spin" size={13} />;
  }
  return <Clock3 size={13} />;
}

function formatTaskTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default async function TasksPage() {
  const [projects, jobs, runs] = await Promise.all([
    listProjects(),
    listPipelineJobs(),
    listPipelineRuns(),
  ]);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const runEntries = new Map(
    runs.map((run) => [run.id, run.productionConfig?.productionEntry]),
  );
  const rendersBySourceJob = new Map(
    runs.flatMap((run) =>
      run.renders.flatMap((render) =>
        render.sourceJobId
          ? [[render.sourceJobId, render] as const]
          : [],
      ),
    ),
  );
  return (
    <div className="page work-index-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">TASK OPERATIONS</p>
          <h1>任务中心</h1>
          <p className="page-subtitle">查看所有真实生产任务的执行状态、进度和错误。</p>
        </div>
      </header>
      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">WORK QUEUE</p><h2>全部任务</h2></div>
          <span className="work-count">{jobs.length} 个任务</span>
        </div>
        <div className="global-task-list">
          {!jobs.length && <div className="empty-state"><Gauge size={24} /><strong>暂无生产任务</strong></div>}
          {jobs.map((job) => {
            const verifiedRender =
              rendersBySourceJob.get(job.id);
            const displayStatus =
              pipelineTaskDisplayStatus(
                job,
                verifiedRender,
              );
            const evidence =
              pipelineTaskEvidence(
                job,
                verifiedRender,
              );
            const productionEntry =
              typeof job.input.productionEntry === "string"
                ? job.input.productionEntry
                : job.runId
                  ? runEntries.get(job.runId)
                  : undefined;
            const workflowName =
              workflowNames[productionEntry ?? ""] ?? "未标记工作流";
            const taskName =
              job.kind === "post_production"
                ? postProductionNames[
                    String(job.input.operation ?? "")
                  ] ?? stageNames[job.kind]
                : stageNames[job.kind] ?? job.kind;
            const workflowId =
              workflowIds[productionEntry ?? ""];
            const href = workflowId
              ? `/projects/${job.projectId}?workType=${workflowId}`
              : `/projects/${job.projectId}`;
            return (
            <Link href={href} className="global-task-row" key={job.id}>
              <span className={`job-state ${displayStatus}`}>
                <TaskStatusIcon status={displayStatus} />
                {statusNames[displayStatus] ?? displayStatus}
              </span>
              <div className="global-task-project">
                <strong>{projectNames.get(job.projectId) ?? job.projectId}</strong>
                <small>项目</small>
              </div>
              <div className="global-task-context">
                <strong>{taskName}</strong>
                <small>{workflowName}</small>
              </div>
              <span>{job.progress}%</span>
              <div className="global-task-times">
                <small>提交时间</small>
                <time dateTime={job.createdAt}>
                  {formatTaskTime(job.createdAt)}
                </time>
                <small>完成时间</small>
                <time dateTime={job.completedAt}>
                  {formatTaskTime(
                    job.completedAt ??
                      (
                        job.status === "completed" ||
                        job.status === "failed"
                          ? job.updatedAt
                          : undefined
                      ),
                  )}
                </time>
              </div>
              <small className="global-task-error">
                {displayStatus === "unverified"
                  ? "任务已结束，但本次生成产物与任务记录无法对应，请重试。"
                  : job.error ??
                    (
                      evidence.upstreamTaskIds.length
                        ? `上游任务 ${evidence.upstreamTaskIds.join("、")}${
                            evidence.outputUrl
                              ? " · 本次产物已核验"
                              : ""
                          }`
                        : "—"
                    )}
              </small>
              <ArrowRight size={15} />
            </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
