export const artifactAvailabilityStatuses = [
  "checking",
  "available",
  "expired",
  "missing",
] as const;

export type ArtifactAvailabilityStatus =
  (typeof artifactAvailabilityStatuses)[number];

export type ArtifactAvailabilityMap = Record<
  string,
  ArtifactAvailabilityStatus
>;

export function artifactAvailabilityKey(
  kind: "highlight" | "preroll" | "final",
  artifactId: string,
  variantIndex?: number,
) {
  return variantIndex === undefined
    ? `${kind}:${artifactId}`
    : `${kind}:${artifactId}:${variantIndex}`;
}

export function artifactAvailabilitySummary(
  artifactIds: string[],
  statuses: ArtifactAvailabilityMap,
) {
  return artifactIds.reduce(
    (summary, artifactId) => {
      const status =
        statuses[artifactId] ?? "checking";
      summary[status] += 1;
      return summary;
    },
    {
      checking: 0,
      available: 0,
      expired: 0,
      missing: 0,
    },
  );
}

export function isArtifactUnavailable(
  status: ArtifactAvailabilityStatus | undefined,
) {
  return status === "expired" || status === "missing";
}
