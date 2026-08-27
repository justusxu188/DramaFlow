import { handleSaveCharacterBindings } from "./character-bindings-command";
import type { WorkflowAction } from "./schema";
import {
  handleScriptCrudCommand,
  type ScriptCrudAction,
} from "./script-crud-commands";

type SimpleCommandContext = {
  projectId: string;
  projectName: string;
  requestId: string;
};

export type SimpleWorkflowAction = Extract<
  WorkflowAction,
  {
    action:
      | ScriptCrudAction["action"]
      | "open_preroll_script"
      | "save_character_bindings";
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
    "save_character_bindings",
  ].includes(input.action);
}

export async function handleSimpleWorkflowCommand(
  input: SimpleWorkflowAction,
  context: SimpleCommandContext,
) {
  const { projectId, projectName, requestId } = context;
  return input.action === "save_character_bindings"
    ? handleSaveCharacterBindings(
        input,
        projectId,
        projectName,
        requestId,
      )
    : handleScriptCrudCommand(input, projectId, requestId);
}
