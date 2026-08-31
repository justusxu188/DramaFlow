import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

import type { PipelineArc } from "@/components/pipeline-workspace-types";

export function PipelineStoryArcStage({
  arcs,
  failedCount = 0,
  retrying = false,
  onRetryFailed,
}: {
  arcs: PipelineArc[];
  failedCount?: number;
  retrying?: boolean;
  onRetryFailed?: () => void;
}) {
  if (!arcs.length && !failedCount) {
    return null;
  }

  return (
    <div className="pipeline-section">
      <div className="pipeline-section-title">
        <Sparkles size={16} />
        <strong>爽点故事线</strong>
        <span>{arcs.length} 条</span>
        {failedCount > 0 && onRetryFailed && (
          <button
            type="button"
            className="button ghost compact"
            disabled={retrying}
            onClick={onRetryFailed}
          >
            {retrying ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
            {retrying
              ? "正在重试"
              : `重试失败任务（${failedCount}）`}
          </button>
        )}
      </div>
      {arcs.length > 0 ? (
        <div className="variant-grid">
          {arcs.map((arc) => (
            <article key={arc.id}>
              <div>
                <span>{arc.payoffType}</span>
                <b>相关度 {arc.scores.relevance}</b>
              </div>
              <h3>{arc.title}</h3>
              <p>{arc.pitch}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          爽点故事线生成失败，请重试失败任务。
        </div>
      )}
    </div>
  );
}
