import { AlertCircle, RefreshCw, X } from "lucide-react";

export function StageTaskFeedback({
  stageLabel,
  error,
  retrying,
  onRetry,
  onDismiss,
}: {
  stageLabel: string;
  error?: string;
  retrying?: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (!error) return null;

  return (
    <div className="stage-task-feedback" role="alert">
      <AlertCircle size={16} />
      <span>
        <strong>{stageLabel}失败</strong>
        <small>{error}</small>
      </span>
      <button
        type="button"
        className="button ghost"
        disabled={retrying}
        onClick={onRetry}
      >
        <RefreshCw className={retrying ? "spin" : ""} size={14} />
        重试当前阶段
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={`关闭${stageLabel}错误`}
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}
