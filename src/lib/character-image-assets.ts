export type CharacterImageSourceType =
  | "confirmed_frame"
  | "upload"
  | "video_capture"
  | "seedream"
  | "seedream_text"
  | "seedream_from_capture";

export function isUsableCharacterImageAsset(asset: {
  metadata: {
    sourceType?: CharacterImageSourceType;
    intermediate?: boolean;
    usableAsCharacterReference?: boolean;
  };
}) {
  if (
    asset.metadata.intermediate ||
    asset.metadata.usableAsCharacterReference === false
  ) {
    return false;
  }
  return [
    "upload",
    "seedream",
    "seedream_text",
    "seedream_from_capture",
  ].includes(asset.metadata.sourceType ?? "");
}
