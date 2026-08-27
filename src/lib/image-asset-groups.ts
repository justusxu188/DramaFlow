import type { ImageAsset } from "@/lib/project-store";

function normalizedCharacterName(name: string) {
  return (
    name
      .replace(/^(?:重绘-)+/, "")
      .replace(/(?:-重绘)+$/, "")
      .trim() || "未命名角色"
  );
}

export function imageAssetIdentityKey(asset: ImageAsset) {
  if (asset.metadata.characterId) {
    return `character:${asset.metadata.characterId}`;
  }
  if (asset.metadata.sourceAssetId) {
    return `asset:${asset.metadata.sourceAssetId}`;
  }
  if (asset.metadata.isBaseline) {
    return `asset:${asset.id}`;
  }
  return `legacy:${normalizedCharacterName(
    asset.metadata.characterName,
  )}`;
}

function imageAssetIdentityAliases(asset: ImageAsset) {
  const aliases: string[] = [];
  if (asset.metadata.characterId) {
    aliases.push(`character:${asset.metadata.characterId}`);
  }
  if (
    !asset.metadata.isBaseline &&
    asset.metadata.sourceAssetId
  ) {
    aliases.push(`asset:${asset.metadata.sourceAssetId}`);
  }
  if (asset.metadata.isBaseline) {
    aliases.push(`asset:${asset.id}`);
  }
  if (!asset.metadata.characterId) {
    aliases.push(
      `legacy:${normalizedCharacterName(
        asset.metadata.characterName,
      )}`,
    );
  }
  if (aliases.length === 0) {
    aliases.push(
      `legacy:${normalizedCharacterName(
        asset.metadata.characterName,
      )}`,
    );
  }
  return aliases;
}

export function groupImageAssetsByIdentity(
  assets: ImageAsset[],
) {
  const parents = new Map<string, string>();
  const find = (key: string): string => {
    const parent = parents.get(key);
    if (!parent) {
      parents.set(key, key);
      return key;
    }
    if (parent === key) return key;
    const root = find(parent);
    parents.set(key, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parents.set(rightRoot, leftRoot);
    }
  };

  for (const asset of assets) {
    const aliases = imageAssetIdentityAliases(asset);
    const primary = aliases[0];
    for (const alias of aliases.slice(1)) {
      union(primary, alias);
    }
  }

  const groups = new Map<
    string,
    { characterName: string; assets: ImageAsset[] }
  >();

  for (const asset of assets) {
    const key = find(imageAssetIdentityAliases(asset)[0]);
    const existing = groups.get(key);
    if (existing) {
      existing.assets.push(asset);
      if (asset.metadata.isBaseline) {
        existing.characterName =
          asset.metadata.characterName;
      }
      continue;
    }
    groups.set(key, {
      characterName: normalizedCharacterName(
        asset.metadata.characterName,
      ),
      assets: [asset],
    });
  }

  return [...groups.entries()];
}
