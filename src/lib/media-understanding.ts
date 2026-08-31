import { createHash } from "node:crypto";
import type { StorylineResult } from "@/lib/providers/types";

export const mediaUnderstandingSchemaVersion = "v1";

export type MediaUnderstanding = {
  assetId: string;
  assetRevisionKey: string;
  sourceKind: "source" | "highlight";
  sourceName: string;
  sourceVideoUrl: string;
  analysisProfileHash: string;
  analysis: StorylineResult;
  reusedFromRunId?: string;
  createdAt: string;
  updatedAt: string;
};

export function mediaAssetRevisionKey(input: {
  objectKey?: string;
  sourceUrl: string;
  sizeBytes?: number;
  durationMs?: number | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        objectKey: input.objectKey ?? "",
        sourceUrl: input.sourceUrl,
        sizeBytes: input.sizeBytes ?? 0,
        durationMs: input.durationMs ?? null,
      }),
    )
    .digest("hex");
}

export function mediaAnalysisProfileHash(input?: {
  enableSnapshot?: boolean;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: mediaUnderstandingSchemaVersion,
        providerTask: "analyze-video-storyline",
        enableSnapshot: input?.enableSnapshot ?? false,
      }),
    )
    .digest("hex");
}
