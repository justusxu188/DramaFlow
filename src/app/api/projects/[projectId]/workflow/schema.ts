import { z } from "zod";

import { composePrerollActionSchema } from "./post-production-action-schemas";
import {
  activateRunActionSchema,
  analyzeOnlyActionSchema,
  continueProductionActionSchema,
  runFullActionSchema,
  saveProductionPlanActionSchema,
} from "./production-action-schemas";
import {
  compileVideoPromptsActionSchema,
  confirmScriptsActionSchema,
  deleteScriptActionSchema,
  deleteScriptsActionSchema,
  generatePrerollsActionSchema,
  openPrerollScriptActionSchema,
  regenerateScriptsActionSchema,
  retryActionSchema,
  updateScriptActionSchema,
  updateVideoPromptActionSchema,
} from "./script-action-schemas";

export const workflowActionSchema = z.discriminatedUnion("action", [
  activateRunActionSchema,
  runFullActionSchema,
  analyzeOnlyActionSchema,
  continueProductionActionSchema,
  saveProductionPlanActionSchema,
  retryActionSchema,
  openPrerollScriptActionSchema,
  updateScriptActionSchema,
  deleteScriptActionSchema,
  deleteScriptsActionSchema,
  regenerateScriptsActionSchema,
  confirmScriptsActionSchema,
  compileVideoPromptsActionSchema,
  updateVideoPromptActionSchema,
  generatePrerollsActionSchema,
  composePrerollActionSchema,
]);

export type WorkflowAction = z.infer<typeof workflowActionSchema>;
