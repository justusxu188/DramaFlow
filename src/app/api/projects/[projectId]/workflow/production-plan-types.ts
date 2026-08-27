import type { WorkflowAction } from "./schema";
import type { getProject } from "@/lib/project-store";

export type SaveProductionPlanAction = Extract<
  WorkflowAction,
  { action: "save_production_plan" }
>;

export type WorkflowPlanProject = NonNullable<
  Awaited<ReturnType<typeof getProject>>
>;
