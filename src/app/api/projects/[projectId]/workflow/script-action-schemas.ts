import { z } from "zod";

import {
  characterAppearanceSchema,
  characterSelectionSchema,
} from "./schema-common";
import { prerollTypes } from "@/lib/domain";
import {
  productionConfigSchema,
  productionEntries,
  videoModels,
  videoRatios,
  videoResolutionSchema,
} from "@/lib/production-config";

const videoGenerationSettingsSchema = z.object({
  scriptId: z.string().min(1),
  targetDuration: z.number().int().min(4).max(300),
  videoModel: z.enum(videoModels),
  videoResolution: videoResolutionSchema,
  videoRatio: z.enum(videoRatios),
  generateSubtitles: z.boolean(),
});

export const retryActionSchema = z.object({
  action: z.literal("retry"),
  jobId: z.string().min(1),
});

export const updateScriptActionSchema = z.object({
  action: z.literal("update_script"),
  scriptId: z.string().min(1),
  workflowEntry: z.enum(productionEntries).optional(),
  script: z.object({
    title: z.string().trim().min(1).max(120),
    duration: z.number().min(0),
    hookTitleCard: z.string().trim().max(500).optional(),
    voiceover: z.string().trim().max(20000),
    transition: z.string().trim().min(1).max(1000),
    shots: z
      .array(
        z.object({
          beatId: z.string().trim().max(40).optional(),
          time: z.string().trim().min(1).max(40),
          segmentType: z
            .enum(["ai_generated", "original_footage"])
            .optional(),
          beatRole: z.string().trim().max(120).optional(),
          hookRef: z.string().trim().max(120).optional(),
          framing: z.string().trim().min(1).max(120),
          visual: z.string().trim().min(1).max(1000),
          dynamicChange: z.string().trim().max(1000).optional(),
          visualContrast: z.string().trim().max(500).optional(),
          characterAction: z.string().trim().max(500).optional(),
          shotSize: z.string().trim().max(100).optional(),
          cameraMove: z.string().trim().max(100).optional(),
          voiceover: z.string().trim().max(500).optional(),
          dialogueSpeaker: z.string().trim().max(120).optional(),
          dialogue: z.string().trim().max(500),
          subtitle: z.string().trim().max(500).optional(),
          sceneCaption: z.string().trim().max(500).optional(),
          sound: z.string().trim().max(1000).optional(),
          startState: z.string().trim().max(1000).optional(),
          endState: z.string().trim().max(1000).optional(),
          cutToNext: z.string().trim().max(500).optional(),
          characters: z.array(z.string()).optional(),
          scene: z.string().trim().max(500).optional(),
          keyProps: z.array(z.string()).optional(),
          editingRhythm: z.string().trim().max(500).optional(),
          purpose: z.string().trim().max(500).optional(),
        }),
      )
      .min(1)
      .max(300),
  }),
});

export const openPrerollScriptActionSchema = z.object({
  action: z.literal("open_preroll_script"),
  scriptId: z.string().min(1),
  workflowEntry: z.enum(productionEntries).optional(),
});

export const deleteScriptActionSchema = z.object({
  action: z.literal("delete_script"),
  scriptId: z.string().min(1),
  workflowEntry: z.enum(productionEntries).optional(),
});

export const deleteScriptsActionSchema = z.object({
  action: z.literal("delete_scripts"),
  scriptIds: z.array(z.string().min(1)).min(1).max(300),
  workflowEntry: z.enum(productionEntries).optional(),
});

export const regenerateScriptsActionSchema = z.object({
  action: z.literal("regenerate_scripts"),
  highlightId: z.string().min(1),
  prerollType: z.enum(prerollTypes),
  workflowEntry: z.enum(productionEntries).optional(),
  productionConfig: productionConfigSchema,
});

export const confirmScriptsActionSchema = z.object({
  action: z.literal("confirm_scripts"),
  scriptIds: z.array(z.string().min(1)).min(1).max(36),
  workflowEntry: z.enum(productionEntries).optional(),
});

export const compileVideoPromptsActionSchema = z.object({
  action: z.literal("compile_video_prompts"),
  scriptIds: z.array(z.string().min(1)).min(1).max(36),
  workflowEntry: z.enum(productionEntries).optional(),
  characterSelections: z.array(characterSelectionSchema).max(144).optional(),
  generationSettings: z
    .array(videoGenerationSettingsSchema)
    .min(1)
    .max(36)
    .optional(),
});

export const updateVideoPromptActionSchema = z.object({
  action: z.literal("update_video_prompt"),
  scriptId: z.string().min(1),
  workflowEntry: z.enum(productionEntries).optional(),
  generationSettings: videoGenerationSettingsSchema
    .omit({ scriptId: true })
    .optional(),
  segments: z
    .array(
      z.object({
        index: z.number().int().min(0),
        submittedPrompt: z.string().trim().min(1).max(30000),
      }),
    )
    .min(1)
    .max(36),
  characterSelections: z.array(characterSelectionSchema).max(144).optional(),
});

export const generatePrerollsActionSchema = z.object({
  action: z.literal("generate_prerolls"),
  scriptIds: z.array(z.string().min(1)).min(1).max(36),
  workflowEntry: z.enum(productionEntries).optional(),
  characterSelections: z.array(characterSelectionSchema).max(144).optional(),
});

export const saveCharacterBindingsActionSchema = z.object({
  action: z.literal("save_character_bindings"),
  characters: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(120),
        role: z.string().trim().max(200),
        aliases: z.array(z.string().trim().min(1).max(120)).max(20),
        status: z.enum(["candidate", "confirmed", "unknown"]),
        appearances: z.array(characterAppearanceSchema).min(1).max(24),
        primaryAppearanceId: z.string().min(1).optional(),
        referenceAssetIds: z.array(z.string().min(1)).max(8),
        confirmedAt: z.string().datetime().optional(),
        updatedAt: z.string().datetime(),
      }),
    )
    .max(48),
});
