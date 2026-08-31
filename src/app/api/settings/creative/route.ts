import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCreativeSettings,
  saveCreativeSettings,
} from "@/lib/creative-settings-store";
import {
  normalizeProductionConfig,
  productionConfigObjectSchema,
  productionConfigSchema,
} from "@/lib/production-config";
import { adminApiUser } from "@/lib/authorization";

const settingsSchema = productionConfigObjectSchema.partial().extend({
  prerollCreativeSystemPrompt:
    z.string().trim().max(8000).optional(),
  prerollScriptSystemPrompt: z.string().trim().max(8000).optional(),
  videoPromptSystemPrompt: z.string().trim().max(12000).optional(),
  videoPromptWithoutSubtitlesSystemPrompt:
    z.string().trim().max(16000).optional(),
});

export async function GET() {
  const auth = await adminApiUser();
  if (auth.response) return auth.response;
  return NextResponse.json({ data: await getCreativeSettings() });
}

export async function PUT(request: Request) {
  const auth = await adminApiUser();
  if (auth.response) return auth.response;
  const requestId = crypto.randomUUID();
  try {
    const input = settingsSchema.parse(await request.json());
    const current = await getCreativeSettings();
    const mergedConfig = {
      ...normalizeProductionConfig(current),
      ...input,
      ...(input.expressionType && !input.expressionTypes
        ? { expressionTypes: [input.expressionType] }
        : {}),
    };
    const productionConfig = normalizeProductionConfig(
      productionConfigSchema.parse(mergedConfig),
    );
    return NextResponse.json({
      data: await saveCreativeSettings({
        ...productionConfig,
        prerollCreativeSystemPrompt:
          input.prerollCreativeSystemPrompt ??
          current.prerollCreativeSystemPrompt,
        prerollScriptSystemPrompt:
          input.prerollScriptSystemPrompt ??
          current.prerollScriptSystemPrompt,
        videoPromptSystemPrompt:
          input.videoPromptSystemPrompt ??
          current.videoPromptSystemPrompt,
        videoPromptWithoutSubtitlesSystemPrompt:
          input.videoPromptWithoutSubtitlesSystemPrompt ??
          current.videoPromptWithoutSubtitlesSystemPrompt,
      }),
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创作配置保存失败";
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }
}
