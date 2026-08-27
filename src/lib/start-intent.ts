// Resolve what the single "开始生产 / 正式开始生产" button actually does
// for a given production flow + pipeline state. Previously this decision
// lived inline as a 6-way nested ternary for the label plus a separate
// continue/run_full branch when the request was sent — the two could
// drift, and the button silently switched between "继续本批次" and
// "新建批次" without telling the user. This pure function centralizes the
// decision so the label, the API action, and the "needs confirmation"
// gate always agree, and so it can be unit-tested in isolation.

export type StartIntentMode =
  | "reading" // still measuring source durations, cannot start yet
  | "analysis_running" // an analysis / batch-prep job is running
  | "producing" // a production job is running
  | "continue" // reuse the existing analysis, no new batch
  | "new_batch" // analysis exists but the selection changed → new batch
  | "batch_clip" // batch highlight clipping flow
  | "start"; // first production for this flow

export type StartIntent = {
  mode: StartIntentMode;
  label: string;
  // The workflow API action the button should POST. `null` while a job
  // is running or durations are still being read (button is disabled).
  action: "continue_production" | "run_full" | null;
  // When true, starting creates a NEW batch and freezes fresh material
  // params — confirm before discarding the implicit "continue" path.
  needsConfirm: boolean;
};

export type StartIntentInput = {
  usesUploadedHighlights: boolean;
  usesBatchHighlights: boolean;
  // A production / analysis job is currently running.
  activeJobs: boolean;
  // The running job (if any) is the analysis / batch-prep phase.
  activeAnalysis: boolean;
  // Source durations are still being probed, or not yet all known.
  durationsPending: boolean;
  // A saved analysis exists for this project's current batch.
  hasExistingAnalysis: boolean;
  // The current selection exactly matches the analyzed batch, so the
  // existing analysis can be reused without re-running it.
  canContinueExistingAnalysis: boolean;
  // The current selection differs from the production version that is
  // already produced/analyzed.
  selectionDiffersFromCurrentBatch: boolean;
  // The editable production settings differ from the active run
  // snapshot, so continuing would mix two configuration versions.
  configurationDiffersFromCurrentBatch: boolean;
};

export function resolveStartIntent(
  input: StartIntentInput,
): StartIntent {
  const {
    usesUploadedHighlights,
    usesBatchHighlights,
    activeJobs,
    activeAnalysis,
    durationsPending,
    hasExistingAnalysis,
    canContinueExistingAnalysis,
    selectionDiffersFromCurrentBatch,
    configurationDiffersFromCurrentBatch,
  } = input;

  if (activeJobs) {
    return {
      mode: activeAnalysis ? "analysis_running" : "producing",
      label: activeAnalysis
        ? usesBatchHighlights
          ? "批量高光准备中"
          : "剧情理解中"
        : "生产中",
      action: null,
      needsConfirm: false,
    };
  }

  // Uploaded-highlight and batch-clip flows do not read source
  // durations up front, so they can start immediately.
  if (durationsPending && !usesUploadedHighlights) {
    return {
      mode: "reading",
      label: "正在读取素材时长",
      action: null,
      needsConfirm: false,
    };
  }

  if (usesBatchHighlights) {
    return {
      mode: "batch_clip",
      label: "开始批量高光剪辑",
      action: "run_full",
      needsConfirm: false,
    };
  }

  // Full-chain / uploaded-highlight production. Continue only when the
  // existing analysis still matches the current selection; otherwise a
  // new batch is created and the user should confirm first.
  if (
    !usesUploadedHighlights &&
    canContinueExistingAnalysis &&
    !configurationDiffersFromCurrentBatch
  ) {
    return {
      mode: "continue",
      label: "继续当前生产",
      action: "continue_production",
      needsConfirm: false,
    };
  }

  return {
    mode: "new_batch",
    label: "开始新生产",
    action: "run_full",
    needsConfirm:
      hasExistingAnalysis &&
      (selectionDiffersFromCurrentBatch ||
        configurationDiffersFromCurrentBatch),
  };
}
