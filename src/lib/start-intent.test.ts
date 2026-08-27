import { describe, expect, it } from "vitest";
import { resolveStartIntent, type StartIntentInput } from "./start-intent";

const base: StartIntentInput = {
  usesUploadedHighlights: false,
  usesBatchHighlights: false,
  activeJobs: false,
  activeAnalysis: false,
  durationsPending: false,
  hasExistingAnalysis: false,
  canContinueExistingAnalysis: false,
  selectionDiffersFromCurrentBatch: false,
  configurationDiffersFromCurrentBatch: false,
};

describe("resolveStartIntent", () => {
  it("reports the analysis phase while an analysis job runs", () => {
    expect(
      resolveStartIntent({ ...base, activeJobs: true, activeAnalysis: true }),
    ).toMatchObject({
      mode: "analysis_running",
      label: "剧情理解中",
      action: null,
      needsConfirm: false,
    });
  });

  it("labels the batch-highlight prep phase distinctly", () => {
    expect(
      resolveStartIntent({
        ...base,
        usesBatchHighlights: true,
        activeJobs: true,
        activeAnalysis: true,
      }),
    ).toMatchObject({ mode: "analysis_running", label: "批量高光准备中" });
  });

  it("reports a running production job", () => {
    expect(
      resolveStartIntent({ ...base, activeJobs: true, activeAnalysis: false }),
    ).toMatchObject({ mode: "producing", label: "生产中", action: null });
  });

  it("blocks the full-chain flow while source durations are still read", () => {
    expect(
      resolveStartIntent({ ...base, durationsPending: true }),
    ).toMatchObject({
      mode: "reading",
      label: "正在读取素材时长",
      action: null,
    });
  });

  it("lets uploaded-highlight flows start without waiting for durations", () => {
    expect(
      resolveStartIntent({
        ...base,
        usesUploadedHighlights: true,
        durationsPending: true,
      }),
    ).toMatchObject({
      mode: "new_batch",
      label: "开始新生产",
      action: "run_full",
    });
  });

  it("starts the batch-highlight clipping flow", () => {
    expect(
      resolveStartIntent({ ...base, usesBatchHighlights: true }),
    ).toMatchObject({
      mode: "batch_clip",
      label: "开始批量高光剪辑",
      action: "run_full",
      needsConfirm: false,
    });
  });

  it("continues the existing batch when the selection is unchanged", () => {
    expect(
      resolveStartIntent({
        ...base,
        hasExistingAnalysis: true,
        canContinueExistingAnalysis: true,
      }),
    ).toMatchObject({
      mode: "continue",
      label: "继续当前生产",
      action: "continue_production",
      needsConfirm: false,
    });
  });

  it("requires confirmation to freeze a new batch after the selection changes", () => {
    expect(
      resolveStartIntent({
        ...base,
        hasExistingAnalysis: true,
        canContinueExistingAnalysis: false,
        selectionDiffersFromCurrentBatch: true,
      }),
    ).toMatchObject({
      mode: "new_batch",
      label: "开始新生产",
      action: "run_full",
      needsConfirm: true,
    });
  });

  it("starts a new production version after production settings change", () => {
    expect(
      resolveStartIntent({
        ...base,
        hasExistingAnalysis: true,
        canContinueExistingAnalysis: true,
        configurationDiffersFromCurrentBatch: true,
      }),
    ).toMatchObject({
      mode: "new_batch",
      label: "开始新生产",
      action: "run_full",
      needsConfirm: true,
    });
  });

  it("starts the first batch without confirmation", () => {
    expect(resolveStartIntent(base)).toMatchObject({
      mode: "new_batch",
      action: "run_full",
      needsConfirm: false,
    });
  });
});
