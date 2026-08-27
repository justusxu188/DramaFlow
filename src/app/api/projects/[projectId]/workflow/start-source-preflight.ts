import { NextResponse } from "next/server";

import { validateHighlightSettings } from "./helpers";
import type {
  StartProductionAction,
  WorkflowProject,
} from "./start-production-types";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import {
  highlightDurationRange,
  normalizeProductionConfig,
  recommendHighlightSettings,
} from "@/lib/production-config";
import {
  listPipelineJobs,
  saveProductionPlan,
  startPipelineRun,
} from "@/lib/pipeline-store";

export async function prepareSourceProduction(
  input: StartProductionAction,
  project: WorkflowProject,
  requestedConfig: ReturnType<typeof normalizeProductionConfig>,
  requestId: string,
) {
  const projectId = project.id;
  if (!project.assets.length) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "请先上传原始剧集", requestId },
        { status: 400 },
      ),
    };
  }
  const requestedAssetIds =
    input.sourceAssetIds ??
    project.assets.slice(0, 30).map((asset) => asset.id);
  const requestedSet = new Set(requestedAssetIds);
  const selectedAssets = project.assets.filter((asset) =>
    requestedSet.has(asset.id),
  );
  if (selectedAssets.length !== requestedAssetIds.length) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "所选源视频不存在或不属于当前项目", requestId },
        { status: 400 },
      ),
    };
  }
  if (selectedAssets.some((asset) => !asset.durationMs)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "所选素材时长尚未读取完成，请稍后再开始生产",
          requestId,
        },
        { status: 409 },
      ),
    };
  }

  const creativeSettings = await getCreativeSettings();
  const sourceRequestedConfig = normalizeProductionConfig({
    ...creativeSettings,
    ...input.productionConfig,
  });
  const sourceDuration =
    selectedAssets.reduce(
      (total, asset) => total + (asset.durationMs ?? 0),
      0,
    ) / 1000;
  const validationError = validateHighlightSettings(
    sourceDuration,
    sourceRequestedConfig,
  );
  if (validationError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: validationError, requestId },
        { status: 400 },
      ),
    };
  }
  const linkedPlan = recommendHighlightSettings(
    sourceDuration,
    sourceRequestedConfig,
  );
  const durationRange = highlightDurationRange(sourceRequestedConfig);
  const productionConfig = normalizeProductionConfig({
    ...requestedConfig,
    highlightMinDuration: durationRange.minDuration,
    highlightMaxDuration: durationRange.maxDuration,
  });
  const active = (await listPipelineJobs(projectId)).find((job) =>
    ["queued", "running"].includes(job.status),
  );
  if (active) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "当前项目已有流水线任务正在执行",
          data: active,
          requestId,
        },
        { status: 409 },
      ),
    };
  }

  const runId = `run-${crypto.randomUUID()}`;
  await startPipelineRun(
    projectId,
    runId,
    selectedAssets.map((asset) => asset.id),
  );
  await saveProductionPlan(
    projectId,
    productionConfig,
    linkedPlan,
    input.prerollType,
  );
  return {
    ok: true as const,
    runId,
    selectedAssets,
    productionConfig,
    creativeSettings,
  };
}
