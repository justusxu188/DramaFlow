"use client";

import {
  LoaderCircle,
  Play,
  Trash2,
  X,
} from "lucide-react";

export function PipelineNewBatchConfirmationModal({
  open,
  starting,
  hasActiveJobs,
  hasChanges,
  onClose,
  onConfirm,
}: {
  open: boolean;
  starting: boolean;
  hasActiveJobs: boolean;
  hasChanges: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.currentTarget === event.target &&
          !starting
        ) {
          onClose();
        }
      }}
    >
      <div
        className="modal script-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-batch-title"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">NEW PRODUCTION</p>
            <h2 id="new-batch-title">
              新建生产批次
            </h2>
          </div>
          <button
            className="icon-button"
            disabled={starting}
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="script-delete-copy">
          <strong>
            {hasActiveJobs
              ? "现有生产批次仍在运行。"
              : hasChanges
                ? "当前素材或生产设置与现有批次不同。"
                : "当前素材和生产设置与现有批次相同。"}
          </strong>
          <p>
            点击“创建并开始”将冻结当前素材和生产设置，
            立即提交独立批次运行。
          </p>
          <small>
            {hasActiveJobs
              ? "现有任务不会停止；两个批次将按各自的 runId 并行执行。"
              : "旧批次的剧情理解、脚本与成片会继续保留，不会被覆盖或删除。"}
          </small>
        </div>
        <div className="modal-actions">
          <button
            className="button ghost"
            disabled={starting}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={starting}
            onClick={onConfirm}
          >
            {starting ? (
              <LoaderCircle
                className="spin"
                size={15}
              />
            ) : (
              <Play size={15} />
            )}
            {starting ? "启动中" : "创建并开始"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PipelineScriptDeleteConfirmationModal({
  request,
  deleting,
  onClose,
  onConfirm,
}: {
  request: {
    scriptIds: string[];
    summary: string;
  } | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!request) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.currentTarget === event.target &&
          !deleting
        ) {
          onClose();
        }
      }}
    >
      <div
        className="modal script-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-delete-title"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">DELETE SCRIPTS</p>
            <h2 id="script-delete-title">
              确认删除脚本
            </h2>
          </div>
          <button
            className="icon-button"
            disabled={deleting}
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="script-delete-copy">
          <strong>{request.summary}</strong>
          <p>
            将删除 {request.scriptIds.length}{" "}
            个未确认脚本。
          </p>
          <small>
            已确认脚本不会被删除。删除后无法恢复。
          </small>
        </div>
        <div className="modal-actions">
          <button
            className="button ghost"
            disabled={deleting}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button danger"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? (
              <LoaderCircle
                className="spin"
                size={15}
              />
            ) : (
              <Trash2 size={15} />
            )}
            {deleting ? "删除中" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
