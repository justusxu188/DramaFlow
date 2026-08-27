import { NextResponse } from "next/server";

import { videoPromptSnapshot } from "./helpers";
import type { WorkflowAction } from "./schema";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
import {
  normalizeProductionConfig,
  recommendHighlightSettings,
} from "@/lib/production-config";
import {
  activatePipelineRun,
  enqueuePipelineJob,
  getPipelineProject,
  saveProductionPlan,
} from "@/lib/pipeline-store";

export type RegenerateScriptsAction = Extract<
  WorkflowAction,
  { action: "regenerate_scripts" }
>;

export async function handleRegenerateScripts(
  input: RegenerateScriptsAction,
  projectId: string,
  requestId: string,
) {
  await activatePipelineRun(projectId, input.workflowEntry);
  const pipeline = await getPipelineProject(projectId);
  const highlight = pipeline?.highlights.find(
    (item) => item.id === input.highlightId,
  );
  if (!pipeline || !highlight?.anchor) {
    return NextResponse.json(
      {
        error: "该高光尚未完成开头理解，不能重新生成脚本",
        requestId,
      },
      { status: 409 },
    );
  }
  const creativeSettings = await getCreativeSettings();
  const productionConfig = normalizeProductionConfig(
    input.productionConfig,
  );
  const recommendation =
    pipeline.highlightRecommendation ??
    recommendHighlightSettings(
      pipeline.analysis?.duration ?? 1,
      productionConfig,
    );
  await saveProductionPlan(
    projectId,
    productionConfig,
    recommendation,
    input.prerollType,
  );
  const data = await enqueuePipelineJob({
    projectId,
    kind: "scripts",
    input: {
      runId: pipeline.currentRunId,
      arcId: highlight.arcId,
      highlightId: highlight.id,
      autoRun: true,
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
