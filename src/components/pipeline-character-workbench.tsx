"use client";

import { useEffect, useState } from "react";
import {
  Check,
  LoaderCircle,
  Save,
  Users,
} from "lucide-react";
import type { PipelineData } from "@/components/pipeline-workspace-types";

type Character = PipelineData["characters"][number];
type SourceVideoInfo = NonNullable<
  PipelineData["analysis"]
>["sourceVideoInfo"];

export function PipelineCharacterWorkbench({
  characters,
  sourceVideoInfo,
  onSave,
}: {
  characters: PipelineData["characters"];
  sourceVideoInfo: SourceVideoInfo;
  onSave: (
    characters: PipelineData["characters"],
  ) => Promise<PipelineData["characters"] | null>;
}) {
  const [drafts, setDrafts] = useState(characters);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<
    string[]
  >([]);
  const [brokenAppearanceIds, setBrokenAppearanceIds] =
    useState<string[]>([]);

  useEffect(() => {
    if (!dirty) {
      setDrafts(characters);
    }
  }, [characters, dirty]);

  function updateCharacter(
    characterId: string,
    patch: Partial<Character>,
  ) {
    setDrafts((current) =>
      current.map((character) =>
        character.id === characterId
          ? { ...character, ...patch }
          : character,
      ),
    );
    setDirty(true);
  }

  function mergeSelectedCharacters() {
    if (selectedIds.length < 2) return;
    setDrafts((current) => {
      const selected = current.filter((character) =>
        selectedIds.includes(character.id),
      );
      const target = selected[0];
      if (!target) return current;
      const appearanceIds = new Set<string>();
      const appearances = selected
        .flatMap((character) => character.appearances)
        .filter((appearance) => {
          if (appearanceIds.has(appearance.id)) {
            return false;
          }
          appearanceIds.add(appearance.id);
          return true;
        });
      return current
        .filter(
          (character) =>
            !selectedIds.includes(character.id) ||
            character.id === target.id,
        )
        .map((character) =>
          character.id === target.id
            ? {
                ...target,
                appearances,
                status: "candidate" as const,
                referenceAssetIds: [],
                confirmedAt: undefined,
              }
            : character,
        );
    });
    setSelectedIds([]);
    setDirty(true);
  }

  function splitAppearance(
    characterId: string,
    appearanceId: string,
  ) {
    setDrafts((current) => {
      const source = current.find(
        (character) => character.id === characterId,
      );
      const appearance = source?.appearances.find(
        (item) => item.id === appearanceId,
      );
      if (
        !source ||
        !appearance ||
        source.appearances.length < 2
      ) {
        return current;
      }
      const now = new Date().toISOString();
      return [
        ...current.map((character) =>
          character.id === characterId
            ? {
                ...character,
                appearances:
                  character.appearances.filter(
                    (item) =>
                      item.id !== appearanceId,
                  ),
                primaryAppearanceId:
                  character.primaryAppearanceId ===
                  appearanceId
                    ? undefined
                    : character.primaryAppearanceId,
                status: "candidate" as const,
                referenceAssetIds: [],
                confirmedAt: undefined,
              }
            : character,
        ),
        {
          id: `character-${crypto.randomUUID()}`,
          name: `待确认人物 ${current.length + 1}`,
          role: "",
          aliases: [],
          status: "candidate" as const,
          appearances: [appearance],
          primaryAppearanceId: appearance.id,
          referenceAssetIds: [],
          updatedAt: now,
        },
      ];
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await onSave(drafts);
      if (saved) {
        setDrafts(saved);
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="character-workbench">
      <summary>
        <span className="character-workbench-icon">
          <Users size={18} />
        </span>
        <div>
          <strong>人物资产</strong>
          <small>
            {drafts.length} 个人物 ·{" "}
            {
              drafts.filter(
                (character) =>
                  character.status === "confirmed",
              ).length
            }{" "}
            已确认 ·{" "}
            {
              drafts.filter(
                (character) =>
                  character.status === "candidate",
              ).length
            }{" "}
            待处理
          </small>
        </div>
        <span className="character-workbench-note">
          不阻塞后续生产，生视频时再关联图片
        </span>
      </summary>
      <div className="character-workbench-body">
        <div className="character-workbench-toolbar">
          <p>
            修改人物信息、合并重复人物并选择标准参考图。确认后的图片会保存到当前项目的“图像资产”。
          </p>
          <div>
            <button
              className="button ghost"
              disabled={selectedIds.length < 2}
              onClick={mergeSelectedCharacters}
              type="button"
            >
              合并所选（{selectedIds.length}）
            </button>
            <button
              className="button primary"
              disabled={!dirty || saving}
              onClick={() => void save()}
              type="button"
            >
              {saving ? (
                <LoaderCircle
                  className="spin"
                  size={15}
                />
              ) : (
                <Save size={15} />
              )}
              保存人物绑定
            </button>
          </div>
        </div>
        {!drafts.length && (
          <div className="character-empty">
            当前剧情理解没有可用关键帧，后续仍可正常生产。
          </div>
        )}
        <div className="character-grid">
          {drafts.map((character) => (
            <article
              className={`character-card ${character.status}`}
              key={character.id}
            >
              <header>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(
                      character.id,
                    )}
                    onChange={(event) =>
                      setSelectedIds((current) =>
                        event.target.checked
                          ? [...current, character.id]
                          : current.filter(
                              (id) =>
                                id !== character.id,
                            ),
                      )
                    }
                    aria-label={`选择人物 ${character.name}`}
                  />
                  <span>
                    {character.status === "confirmed"
                      ? "已确认"
                      : character.status === "unknown"
                        ? "未知人物"
                        : "待处理"}
                  </span>
                </label>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() =>
                    updateCharacter(character.id, {
                      status:
                        character.status === "unknown"
                          ? "candidate"
                          : "unknown",
                      referenceAssetIds: [],
                      confirmedAt: undefined,
                    })
                  }
                >
                  {character.status === "unknown"
                    ? "恢复待确认"
                    : "标记未知"}
                </button>
              </header>
              <div className="character-fields">
                <label>
                  <span>人物名称</span>
                  <input
                    value={character.name}
                    onChange={(event) =>
                      updateCharacter(character.id, {
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span>角色身份</span>
                  <input
                    value={character.role}
                    placeholder="例如：女主角、反派"
                    onChange={(event) =>
                      updateCharacter(character.id, {
                        role: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="character-appearances">
                {character.appearances.map(
                  (appearance) => {
                    const sourceVideo =
                      sourceVideoInfo.find(
                        (source) =>
                          source.index ===
                          appearance.sourceVideoIndex,
                      )?.url;
                    const imageExpired =
                      brokenAppearanceIds.includes(
                        appearance.id,
                      );
                    return (
                      <label
                        className="character-appearance"
                        key={appearance.id}
                      >
                        <span className="character-appearance-preview">
                          {sourceVideo && (
                            <video
                              muted
                              playsInline
                              preload="metadata"
                              src={`${sourceVideo}#t=${Math.max(
                                0,
                                appearance.timestamp +
                                  0.1,
                              )}`}
                              aria-label={`${character.name} 源视频画面`}
                            />
                          )}
                          <img
                            src={appearance.imageUrl}
                            alt={`${character.name} 候选画面`}
                            onError={(event) => {
                              event.currentTarget.hidden =
                                true;
                              setBrokenAppearanceIds(
                                (current) =>
                                  current.includes(
                                    appearance.id,
                                  )
                                    ? current
                                    : [
                                        ...current,
                                        appearance.id,
                                      ],
                              );
                            }}
                          />
                        </span>
                        {imageExpired && (
                          <small className="character-image-expired">
                            旧关键帧已失效，请重新进行剧情理解
                          </small>
                        )}
                        <span>
                          <input
                            type="radio"
                            name={`primary-${character.id}`}
                            aria-label={`设为 ${character.name} 标准参考图`}
                            disabled={imageExpired}
                            checked={
                              character.primaryAppearanceId ===
                              appearance.id
                            }
                            onChange={() =>
                              updateCharacter(
                                character.id,
                                {
                                  primaryAppearanceId:
                                    appearance.id,
                                },
                              )
                            }
                          />
                          标准参考图
                        </span>
                        {character.appearances.length >
                          1 && (
                          <button
                            className="button ghost"
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              splitAppearance(
                                character.id,
                                appearance.id,
                              );
                            }}
                          >
                            拆分为新人物
                          </button>
                        )}
                      </label>
                    );
                  },
                )}
              </div>
              <footer>
                <small>
                  来自 {character.appearances.length}{" "}
                  个剧情画面
                </small>
                <button
                  className="button primary"
                  type="button"
                  disabled={
                    !character.primaryAppearanceId ||
                    brokenAppearanceIds.includes(
                      character.primaryAppearanceId,
                    ) ||
                    character.status === "unknown"
                  }
                  onClick={() =>
                    updateCharacter(character.id, {
                      status: "confirmed",
                    })
                  }
                >
                  <Check size={14} />
                  确认人物
                </button>
              </footer>
            </article>
          ))}
        </div>
      </div>
    </details>
  );
}
