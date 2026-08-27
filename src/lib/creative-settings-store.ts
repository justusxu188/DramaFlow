import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  defaultProductionConfig,
  normalizeProductionConfig,
  type ProductionConfig,
} from "@/lib/production-config";
import {
  defaultPrerollCreativeSystemPrompt,
  defaultPrerollScriptSystemPrompt,
  defaultVideoPromptSystemPrompt,
  defaultVideoPromptWithoutSubtitlesSystemPrompt,
} from "@/lib/preroll-prompts";

export type CreativeSettings = ProductionConfig & {
  prerollCreativeSystemPrompt: string;
  prerollScriptSystemPrompt: string;
  videoPromptSystemPrompt: string;
  videoPromptWithoutSubtitlesSystemPrompt: string;
  promptVersion: string;
  updatedAt: string;
};

const promptVersion = "lark-v2-revision-12";
const storePath = path.join(process.cwd(), "data", "creative-settings.json");
let writeQueue = Promise.resolve();

const defaults: CreativeSettings = {
  ...defaultProductionConfig,
  prerollCreativeSystemPrompt:
    defaultPrerollCreativeSystemPrompt,
  prerollScriptSystemPrompt:
    defaultPrerollScriptSystemPrompt,
  videoPromptSystemPrompt:
    defaultVideoPromptSystemPrompt,
  videoPromptWithoutSubtitlesSystemPrompt:
    defaultVideoPromptWithoutSubtitlesSystemPrompt,
  promptVersion,
  updatedAt: "",
};

function normalizeSettings(data: Partial<CreativeSettings>): CreativeSettings {
  const useV2Prompts = data.promptVersion === promptVersion;
  return {
    ...normalizeProductionConfig(data),
    prerollCreativeSystemPrompt:
      (useV2Prompts &&
        data.prerollCreativeSystemPrompt?.trim()) ||
      defaultPrerollCreativeSystemPrompt,
    prerollScriptSystemPrompt:
      (useV2Prompts &&
        data.prerollScriptSystemPrompt?.trim()) ||
      defaultPrerollScriptSystemPrompt,
    videoPromptSystemPrompt:
      (useV2Prompts &&
        data.videoPromptSystemPrompt?.trim()) ||
      defaultVideoPromptSystemPrompt,
    videoPromptWithoutSubtitlesSystemPrompt:
      data.videoPromptWithoutSubtitlesSystemPrompt?.trim() ||
      defaultVideoPromptWithoutSubtitlesSystemPrompt,
    promptVersion,
    updatedAt: data.updatedAt ?? "",
  };
}

export async function getCreativeSettings(): Promise<CreativeSettings> {
  if (env.PERSISTENCE_MODE === "mysql") {
    try {
      const databaseSettings = await db.creativeSetting.findUnique({
        where: { id: "default" },
      });
      if (databaseSettings) {
        const source =
          databaseSettings.value as Partial<CreativeSettings>;
        const settings = normalizeSettings(source);
        if (
          source.promptVersion !== promptVersion
        ) {
          return saveCreativeSettings(settings);
        }
        return settings;
      }
    } catch {
      // Local settings remain the recovery source while MySQL is unavailable.
    }
  }
  try {
    const data = JSON.parse(await readFile(storePath, "utf8")) as Partial<CreativeSettings>;
    const settings = normalizeSettings(data);
    if (
      data.promptVersion !== promptVersion
    ) {
      return saveCreativeSettings(settings);
    }
    return settings;
  } catch {
    return defaults;
  }
}

export async function saveCreativeSettings(
  input: ProductionConfig & {
    prerollCreativeSystemPrompt: string;
    prerollScriptSystemPrompt: string;
    videoPromptSystemPrompt: string;
    videoPromptWithoutSubtitlesSystemPrompt: string;
  },
) {
  const settings: CreativeSettings = {
    ...normalizeProductionConfig(input),
    prerollCreativeSystemPrompt:
      input.prerollCreativeSystemPrompt.trim() ||
      defaultPrerollCreativeSystemPrompt,
    prerollScriptSystemPrompt:
      input.prerollScriptSystemPrompt.trim() ||
      defaultPrerollScriptSystemPrompt,
    videoPromptSystemPrompt:
      input.videoPromptSystemPrompt.trim() ||
      defaultVideoPromptSystemPrompt,
    videoPromptWithoutSubtitlesSystemPrompt:
      input.videoPromptWithoutSubtitlesSystemPrompt.trim() ||
      defaultVideoPromptWithoutSubtitlesSystemPrompt,
    promptVersion,
    updatedAt: new Date().toISOString(),
  };
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(temporaryPath, storePath);
  });
  await writeQueue;
  if (env.PERSISTENCE_MODE === "mysql") {
    try {
      await db.creativeSetting.upsert({
        where: { id: "default" },
        update: { value: settings as unknown as Prisma.InputJsonValue },
        create: {
          id: "default",
          value: settings as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      // The local atomic write above keeps the settings durable during outages.
    }
  }
  return settings;
}

export function selectVideoPromptSystemPrompt(
  settings: Pick<
    CreativeSettings,
    | "videoPromptSystemPrompt"
    | "videoPromptWithoutSubtitlesSystemPrompt"
  >,
  generateSubtitles: boolean,
) {
  return generateSubtitles
    ? settings.videoPromptSystemPrompt
    : settings.videoPromptWithoutSubtitlesSystemPrompt;
}
