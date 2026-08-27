import { handleComposePreroll } from "./compose-preroll-command";
import type { WorkflowAction } from "./schema";

export type PostProductionAction = Extract<
  WorkflowAction,
  { action: "compose_preroll" }
>;

export function isPostProductionAction(
  input: WorkflowAction,
): input is PostProductionAction {
  return input.action === "compose_preroll";
}

export async function handlePostProductionCommand(
  input: PostProductionAction,
  projectId: string,
  requestId: string,
) {
  return handleComposePreroll(input, projectId, requestId);
}
