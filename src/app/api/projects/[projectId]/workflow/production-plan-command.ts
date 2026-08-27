import type {
  SaveProductionPlanAction,
  WorkflowPlanProject,
} from "./production-plan-types";
import { saveSourceProductionPlan } from "./save-source-production-plan";
import { saveUploadedHighlightPlan } from "./save-uploaded-highlight-plan";
import { normalizeProductionConfig } from "@/lib/production-config";

export type { SaveProductionPlanAction } from "./production-plan-types";

export async function handleSaveProductionPlan(
  input: SaveProductionPlanAction,
  project: WorkflowPlanProject,
  requestId: string,
) {
  const productionConfig = normalizeProductionConfig({
    ...input.productionConfig,
    productionEntry:
      input.workflowEntry ?? input.productionConfig.productionEntry,
  });

  return productionConfig.productionEntry === "uploaded_highlights"
    ? saveUploadedHighlightPlan(
        input,
        project.id,
        productionConfig,
        requestId,
      )
    : saveSourceProductionPlan(
        input,
        project,
        productionConfig,
        requestId,
      );
}
