import { NextResponse } from "next/server";

import { videoPromptSnapshot } from "./helpers";
import { prepareSourceProduction } from "./start-source-preflight";
import type {
  StartProductionAction,
  WorkflowProject,
} from "./start-production-types";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
import { normalizeProductionConfig } from "@/lib/production-config";
import {
  enqueuePipelineJob,
  upsertHighlight,
} from "@/lib/pipeline-store";

export async function startSourceProduction(
  input: StartProductionAction,
  project: WorkflowProject,
  requestedConfig: ReturnType<typeof normalizeProductionConfig>,
  requestId: string,
) {
  const prepared = await prepareSourceProduction(
    input,
    project,
    requestedConfig,
    requestId,
  );
  if (!prepared.ok) {
    return prepared.response;
  }
  const {
    runId,
    selectedAssets,
    productionConfig,
    creativeSettings,
  } = prepared;
  const projectId = project.id;

  if (productionConfig.productionEntry === "batch_highlights") {
    const highlightId = `highlight-${crypto.randomUUID()}`;
    await upsertHighlight(projectId, {
      id: highlightId,
      arcId: `batch-${runId}`,
      mode: "montage",
      status: "queued",
    }, runId);
    const data = await enqueuePipelineJob({
      projectId,
      kind: "highlight",
      input: {
        runId,
        arcId: `batch-${runId}`,
        highlightId,
        autoRun: false,
        sourceAssetIds: selectedAssets.map((asset) => asset.id),
        videoUrls: selectedAssets.map((asset) => asset.sourceUrl),
        highlightOutputCount: productionConfig.highlightTargetCount,
        ...productionConfig,
      },
    });
    void runPipelineJobNow(data.id);
    return NextResponse.json({ data, requestId }, { status: 202 });
  }

  const data = await enqueuePipelineJob({
    projectId,
    kind: "analysis",
    input: {
      runId,
      autoRun: input.action === "run_full",
      sourceAssetIds: selectedAssets.map((asset) => asset.id),
      videoUrls: selectedAssets.map((asset) => asset.sourceUrl),
      prerollType: input.prerollType,
      prerollCreativeSystemPrompt:
        creativeSettings.prerollCreativeSystemPrompt,
      prerollScriptSystemPrompt:
        creativeSettings.prerollScriptSystemPrompt,
      videoPromptSystemPrompt: videoPromptSnapshot(
        creativeSettings,
        productionConfig.generateSubtitles,
      ),
      ...productionConfig,
    },
  });
  void runPipelineJobNow(data.id);
  return NextResponse.json({ data, requestId }, { status: 202 });
}
