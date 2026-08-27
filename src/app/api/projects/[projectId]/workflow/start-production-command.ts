import { getCreativeSettings } from "@/lib/creative-settings-store";
import { normalizeProductionConfig } from "@/lib/production-config";

import { startSourceProduction } from "./start-source-production";
import type {
  StartProductionAction,
  WorkflowProject,
} from "./start-production-types";
import { startUploadedHighlights } from "./start-uploaded-highlights";

export async function handleStartProduction(
  input: StartProductionAction,
  project: WorkflowProject,
  requestId: string,
) {
  const requestedConfig = normalizeProductionConfig({
    ...(await getCreativeSettings()),
    ...input.productionConfig,
    productionEntry:
      input.workflowEntry ?? input.productionConfig?.productionEntry,
  });

  return requestedConfig.productionEntry === "uploaded_highlights"
    ? startUploadedHighlights(
        input,
        project,
        requestedConfig,
        requestId,
      )
    : startSourceProduction(input, project, requestedConfig, requestId);
}
