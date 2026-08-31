import { z } from "zod";

import { prerollTypes } from "@/lib/domain";
import {
  productionConfigSchema,
  productionEntries,
} from "@/lib/production-config";

export const productionStartSchema = {
  sourceAssetIds: z.array(z.string().min(1)).min(1).max(30).optional(),
  prerollType: z.enum(prerollTypes).default("story_extended"),
  workflowEntry: z.enum(productionEntries).optional(),
  productionConfig: productionConfigSchema.optional(),
};

export const characterSelectionSchema = z
  .object({
    scriptId: z.string().min(1),
    characterName: z.string().trim().min(1).max(120),
    assetIds: z.array(z.string().min(1)).max(4),
    useTextToVideo: z.boolean().optional(),
  })
  .refine(
    (selection) =>
      selection.useTextToVideo === true || selection.assetIds.length > 0,
    { message: "请选择人物图片或明确使用文生视频" },
  );
