import { NextResponse } from "next/server";
import { z } from "zod";

import { handleContinueProduction } from "./continue-production-command";
import { getWorkflowWorkspace } from "./get-workspace";
import {
  handlePostProductionCommand,
  isPostProductionAction,
} from "./post-production-commands";
import { handleGeneratePrerolls } from "./preroll-command";
import { handleSaveProductionPlan } from "./production-plan-command";
import { workflowActionSchema } from "./schema";
import {
  handleScriptWorkflowCommand,
  isScriptWorkflowAction,
} from "./script-commands";
import {
  handleSimpleWorkflowCommand,
  isSimpleWorkflowAction,
} from "./simple-commands";
import { handleStartProduction } from "./start-production-command";
import { activatePipelineRunById } from "@/lib/pipeline-store";
import { productionEntries } from "@/lib/production-config";
import {
  authenticatedApiUser,
  authorizedProject,
} from "@/lib/authorization";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticatedApiUser();
  if (!auth.user || auth.response) return auth.response;
  const { projectId } = await context.params;
  if (!(await authorizedProject(projectId, auth.user))) {
    return NextResponse.json(
      { error: "项目不存在" },
      { status: 404 },
    );
  }
  const productionEntry = z.enum(productionEntries).safeParse(
    new URL(request.url).searchParams.get("productionEntry"),
  );
  const data = await getWorkflowWorkspace(
    projectId,
    productionEntry.success ? productionEntry.data : undefined,
  );
  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId } = await context.params;
    const auth = await authenticatedApiUser();
    if (!auth.user || auth.response) return auth.response;
    const project = await authorizedProject(projectId, auth.user);
    if (!project) {
      return NextResponse.json(
        { error: "项目不存在", requestId },
        { status: 404 },
      );
    }

    const input = workflowActionSchema.parse(await request.json());
    if (input.action === "activate_run") {
      const data = await activatePipelineRunById(
        projectId,
        input.runId,
        input.workflowEntry,
      );
      return NextResponse.json({ data, requestId });
    }
    if (isSimpleWorkflowAction(input)) {
      return handleSimpleWorkflowCommand(input, {
        projectId,
        requestId,
      });
    }
    if (isPostProductionAction(input)) {
      return handlePostProductionCommand(input, projectId, requestId);
    }
    if (input.action === "save_production_plan") {
      return handleSaveProductionPlan(input, project, requestId);
    }
    if (isScriptWorkflowAction(input)) {
      return handleScriptWorkflowCommand(input, projectId, requestId);
    }
    if (input.action === "generate_prerolls") {
      return handleGeneratePrerolls(input, projectId, requestId);
    }
    if (input.action === "continue_production") {
      return handleContinueProduction(input, projectId, requestId);
    }
    return handleStartProduction(input, project, requestId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "流水线启动失败";
    return NextResponse.json(
      { error: message, requestId },
      { status: 400 },
    );
  }
}
