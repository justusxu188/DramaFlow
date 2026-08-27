import {
  selectVideoPromptSystemPrompt,
  type CreativeSettings,
} from "@/lib/creative-settings-store";
import {
  normalizeProductionConfig,
  type ProductionConfig,
} from "@/lib/production-config";

export function videoPromptSnapshot(
  settings: CreativeSettings,
  generateSubtitles: boolean,
) {
  return selectVideoPromptSystemPrompt(settings, generateSubtitles);
}

export function validateHighlightSettings(
  sourceDuration: number,
  config: ProductionConfig,
) {
  const normalizedConfig = normalizeProductionConfig(config);
  const totalDuration = Math.max(1, Math.floor(sourceDuration));
  if (normalizedConfig.highlightTargetDuration > totalDuration) {
    return `目标时长不能超过当前素材总时长 ${totalDuration} 秒`;
  }

  return null;
}
