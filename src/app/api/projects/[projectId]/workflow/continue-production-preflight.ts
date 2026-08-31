import { NextResponse } from "next/server";

import {
  validateHighlightSettings,
  videoPromptSnapshot,
} from "./helpers";
import type { WorkflowAction } from "./schema";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import {
  highlightDurationRange,
  normalizeProductionConfig,
  recommendHighlightSettings,
} from "@/lib/production-config";
import {
  confirmProductionPlan,
  getPipelineProject,
  getPipelineWorkspaceSnapshot,
  listPipelineJobs,
  saveProductionPlan,
} from "@/lib/pipeline-store";

export type ContinueProductionAction = Extract<
  WorkflowAction,
  { action: "continue_production" }
>;

export async function prepareContinueProduction(
  input: ContinueProductionAction,
  projectId: string,
  requestId: string,
) {
  const pipeline =
    (
      await getPipelineWorkspaceSnapshot(projectId, input.workflowEntry)
    ).project ?? (await getPipelineProject(projectId));
  if (!pipeline?.analysis || !pipeline.highlightRecommendation) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "请先完成剧情理解并获取高光参数建议", requestId },
        { status: 400 },
      ),
    };
  }
  const analyzedIds = pipeline.analysisSourceAssetIds ?? [];
  if (
    analyzedIds.length !== input.sourceAssetIds.length ||
    analyzedIds.some((id, index) => id !== input.sourceAssetIds[index])
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "本次素材选择已变化，请重新分析后再继续", requestId },
        { status: 409 },
      ),
    };
  }
  if (!pipeline.currentRunId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "当前工作流尚未创建生产版本", requestId },
        { status: 409 },
      ),
    };
  }
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

  const creativeSettings = await getCreativeSettings();
  const requestedConfig = normalizeProductionConfig(input.productionConfig);
  const validationError = validateHighlightSettings(
    pipeline.analysis.duration,
    requestedConfig,
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
    pipeline.analysis.duration,
    requestedConfig,
  );
  const durationRange = highlightDurationRange(requestedConfig);
  const productionConfig = normalizeProductionConfig({
    ...requestedConfig,
    highlightMinDuration: durationRange.minDuration,
    highlightMaxDuration: durationRange.maxDuration,
  });
  await saveProductionPlan(
    projectId,
    productionConfig,
    linkedPlan,
    input.prerollType,
    input.sourceAssetIds,
    pipeline.currentRunId,
  );
  await confirmProductionPlan(projectId, pipeline.currentRunId);

  return {
    ok: true as const,
    pipeline,
    productionConfig,
    sharedInput: {
      runId: pipeline.currentRunId,
      autoRun: true,
      videoUrls: pipeline.analysis.sourceVideoInfo.map(
        (video) => video.url,
      ),
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
  };
}
