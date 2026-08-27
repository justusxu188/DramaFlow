import type { WorkflowAction } from "./schema";
import type { getProject } from "@/lib/project-store";

export type StartProductionAction = Extract<
  WorkflowAction,
  { action: "run_full" | "analyze_only" }
>;

export type WorkflowProject = NonNullable<
  Awaited<ReturnType<typeof getProject>>
>;
