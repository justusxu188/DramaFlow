import { NextResponse } from "next/server";

import { handleCompilePrompts } from "./compile-prompts-command";
import { handleRegenerateScripts } from "./regenerate-scripts-command";
import type { WorkflowAction } from "./schema";
import { handleUpdateVideoPrompt } from "./update-video-prompt-command";
import {
  activatePipelineRun,
  confirmScripts,
} from "@/lib/pipeline-store";

export type ScriptWorkflowAction = Extract<
  WorkflowAction,
  {
    action:
      | "regenerate_scripts"
      | "confirm_scripts"
      | "compile_video_prompts"
      | "update_video_prompt";
  }
>;

export function isScriptWorkflowAction(
  input: WorkflowAction,
): input is ScriptWorkflowAction {
  return [
    "regenerate_scripts",
    "confirm_scripts",
    "compile_video_prompts",
    "update_video_prompt",
  ].includes(input.action);
}

export async function handleScriptWorkflowCommand(
  input: ScriptWorkflowAction,
  projectId: string,
  requestId: string,
) {
  if (input.action === "regenerate_scripts") {
    return handleRegenerateScripts(input, projectId, requestId);
  }
  if (input.action === "update_video_prompt") {
    return handleUpdateVideoPrompt(input, projectId, requestId);
  }
  if (input.action === "confirm_scripts") {
    await activatePipelineRun(projectId, input.workflowEntry);
    const scripts = await confirmScripts(
      projectId,
      input.scriptIds,
    );
    return NextResponse.json({ data: scripts, requestId });
  }
  return handleCompilePrompts(input, projectId, requestId);
}
