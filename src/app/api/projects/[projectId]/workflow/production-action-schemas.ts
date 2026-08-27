import { z } from "zod";

import { productionStartSchema } from "./schema-common";
import { prerollTypes } from "@/lib/domain";
import {
  productionConfigSchema,
  productionEntries,
} from "@/lib/production-config";

export const runFullActionSchema = z.object({
  action: z.literal("run_full"),
  ...productionStartSchema,
});

export const analyzeOnlyActionSchema = z.object({
  action: z.literal("analyze_only"),
  ...productionStartSchema,
});

export const continueProductionActionSchema = z.object({
  action: z.literal("continue_production"),
  sourceAssetIds: z.array(z.string().min(1)).min(1).max(30),
  prerollType: z.enum(prerollTypes).default("story_extended"),
  workflowEntry: z.enum(productionEntries).optional(),
  productionConfig: productionConfigSchema,
});

export const saveProductionPlanActionSchema = z.object({
  action: z.literal("save_production_plan"),
  sourceAssetIds: z.array(z.string().min(1)).max(30),
  prerollType: z.enum(prerollTypes),
  workflowEntry: z.enum(productionEntries).optional(),
  productionConfig: productionConfigSchema,
});

export const activateRunActionSchema = z.object({
  action: z.literal("activate_run"),
  runId: z.string().min(1),
  workflowEntry: z.enum(productionEntries),
});
