import type { WorkflowAction } from "./schema";
import {
  handleScriptCrudCommand,
  type ScriptCrudAction,
} from "./script-crud-commands";

type SimpleCommandContext = {
  projectId: string;
  requestId: string;
};

export type SimpleWorkflowAction = Extract<
  WorkflowAction,
  {
    action:
      | ScriptCrudAction["action"]
      | "open_preroll_script";
  }
>;

export function isSimpleWorkflowAction(
  input: WorkflowAction,
): input is SimpleWorkflowAction {
  return [
    "retry",
    "open_preroll_script",
    "update_script",
    "delete_script",
    "delete_scripts",
  ].includes(input.action);
}

export async function handleSimpleWorkflowCommand(
  input: SimpleWorkflowAction,
  context: SimpleCommandContext,
) {
  const { projectId, requestId } = context;
  return handleScriptCrudCommand(input, projectId, requestId);
}
