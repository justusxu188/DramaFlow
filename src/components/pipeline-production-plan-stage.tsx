"use client";

import { useState } from "react";
import {
  AlertCircle,
  Film,
  Images,
} from "lucide-react";
import { ExpressionTypeCombobox } from "@/components/expression-type-combobox";
import { MultiSelectField } from "@/components/multi-select-field";
import {
  prerollLabels,
  type PrerollType,
} from "@/lib/domain";
import {
  characterModeLabels,
  highlightContentTypeLabels,
  subtitleFontTypeLabels,
  subtitleFontTypes,
  subtitlePositionLabels,
  subtitlePositions,
  videoModelLabels,
  videoModelOptions,
  videoRatios,
  videoResolutions,
  type ProductionConfig,
} from "@/lib/production-config";

export type ProductionPlanHighlightAsset = {
  id: string;
  name: string;
  sourceUrl: string;
  durationMs: number | null;
  metadata: { sourceType: "user" | "mediakit" };
};

type PipelineProductionPlanStageProps = {
  productionConfig: ProductionConfig;
  highlightAssets: ProductionPlanHighlightAsset[];
  hasSources: boolean;
  selectedAssetIds: string[];
  usesUploadedHighlights: boolean;
  usesBatchHighlights: boolean;
  durationReady: boolean;
  totalDurationSeconds: number;
  targetDurationInput: string;
  targetCountInput: string;
  hasBasicTargetDuration: boolean;
  hasBasicTargetCount: boolean;
  recommendedTargetDuration: number | null;
  recommendedTargetCount: number | null;
  targetDurationUpperLimit: number;
  targetCountUpperLimit: number;
  onConfigChange: <K extends keyof ProductionConfig>(
    key: K,
    value: ProductionConfig[K],
  ) => void;
  onConfigPatch: (patch: Partial<ProductionConfig>) => void;
  onTargetDurationInputChange: (value: string) => void;
  onTargetCountInputChange: (value: string) => void;
};

export function PipelineProductionPlanStage({
  productionConfig,
  highlightAssets,
  hasSources,
  selectedAssetIds,
  usesUploadedHighlights,
  usesBatchHighlights,
  durationReady,
  totalDurationSeconds,
  targetDurationInput,
  targetCountInput,
  hasBasicTargetDuration,
  hasBasicTargetCount,
  recommendedTargetDuration,
  recommendedTargetCount,
  targetDurationUpperLimit,
  targetCountUpperLimit,
  onConfigChange,
  onConfigPatch,
  onTargetDurationInputChange,
  onTargetCountInputChange,
}: PipelineProductionPlanStageProps) {
  const [showHighlightLibrary, setShowHighlightLibrary] =
    useState(false);

  return (
    <>
      {!usesUploadedHighlights && !hasSources && (
        <div className="pipeline-callout">
          <AlertCircle size={16} /> 请先上传原始剧集。
        </div>
      )}
      {!usesUploadedHighlights &&
        hasSources &&
        !selectedAssetIds.length && (
          <div className="pipeline-callout">
            <AlertCircle size={16} /> 请至少选择一个源视频。
          </div>
        )}
      {usesUploadedHighlights && !highlightAssets.length && (
        <div className="pipeline-callout">
          <AlertCircle size={16} />{" "}
          素材库中还没有高光视频，请先上传高光剪辑。
        </div>
      )}
      <div className="pipeline-start-settings">
        {usesUploadedHighlights ? (
          <div className="highlight-asset-selection">
            <div className="highlight-asset-selection-heading">
              <div>
                <strong>下次生产使用的高光视频</strong>
                <small>
                  已选择{" "}
                  {
                    productionConfig
                      .selectedHighlightAssetIds.length
                  }{" "}
                  个
                </small>
              </div>
              <button
                type="button"
                className="button ghost"
                disabled={!highlightAssets.length}
                onClick={() =>
                  setShowHighlightLibrary((current) => !current)
                }
              >
                <Images size={16} />
                {showHighlightLibrary
                  ? "收起素材库"
                  : "从素材库选择"}
              </button>
            </div>
            <div className="pipeline-callout">
              <Film size={16} />
              {hasSources
                ? "该项目已有原剧集：前贴脚本使用同项目原剧的剧情理解、爽点故事线，并结合每条高光前 10 秒生成。"
                : "该项目没有原剧集：系统会完整理解本次选中的高光视频，提炼剧情与爽点，再结合每条高光前 10 秒生成。"}
            </div>
            {!showHighlightLibrary &&
              productionConfig.selectedHighlightAssetIds.length >
                0 && (
                <div className="selected-highlight-summary">
                  {highlightAssets
                    .filter((asset) =>
                      productionConfig.selectedHighlightAssetIds.includes(
                        asset.id,
                      ),
                    )
                    .map((asset) => (
                      <span key={asset.id}>{asset.name}</span>
                    ))}
                </div>
              )}
            {showHighlightLibrary && (
              <div className="highlight-asset-options">
                {highlightAssets.map((asset) => {
                  const checked =
                    productionConfig.selectedHighlightAssetIds.includes(
                      asset.id,
                    );
                  return (
                    <label
                      className={checked ? "selected" : ""}
                      key={asset.id}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onConfigChange(
                            "selectedHighlightAssetIds",
                            checked
                              ? productionConfig.selectedHighlightAssetIds.filter(
                                  (id) => id !== asset.id,
                                )
                              : [
                                  ...productionConfig.selectedHighlightAssetIds,
                                  asset.id,
                                ],
                          )
                        }
                      />
                      <video
                        src={asset.sourceUrl}
                        preload="metadata"
                        muted
                        playsInline
                      />
                      <span>
                        <strong>{asset.name}</strong>
                        <small>
                          {asset.metadata.sourceType === "user"
                            ? "用户高光"
                            : "MediaKit 高光"}
                          {asset.durationMs
                            ? ` · ${Math.round(
                                asset.durationMs / 1000,
                              )} 秒`
                            : ""}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="pipeline-config-groups">
          {!usesBatchHighlights && (
            <fieldset className="pipeline-config-group">
              <legend>剧情策略与脚本表达</legend>
              <div className="pipeline-config-grid strategy-config-grid">
                <label>
                  <span>爽点故事线数量</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={productionConfig.sellingPointCount}
                    onChange={(event) =>
                      onConfigChange(
                        "sellingPointCount",
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  <span>每个高光脚本数</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={productionConfig.scriptCount}
                    onChange={(event) =>
                      onConfigChange(
                        "scriptCount",
                        Number(event.target.value),
                      )
                    }
                  />
                  <small>
                    预计脚本总数 = 高光成片总数 ×
                    每个高光脚本数。
                  </small>
                </label>
                <label>
                  <span>前贴脚本预估时长范围（秒）</span>
                  <div className="duration-range-input">
                    <input
                      type="number"
                      min={3}
                      value={productionConfig.scriptDurationMin}
                      aria-label="视频脚本最小时长"
                      onChange={(event) =>
                        onConfigChange(
                          "scriptDurationMin",
                          Number(event.target.value),
                        )
                      }
                    />
                    <span>–</span>
                    <input
                      type="number"
                      min={productionConfig.scriptDurationMin}
                      value={productionConfig.scriptDurationMax}
                      aria-label="视频脚本最大时长"
                      onChange={(event) =>
                        onConfigChange(
                          "scriptDurationMax",
                          Number(event.target.value),
                        )
                      }
                    />
                  </div>
                </label>
                <ExpressionTypeCombobox
                  values={productionConfig.expressionTypes}
                  customValue={
                    productionConfig.customExpressionType
                  }
                  onChange={(
                    expressionTypes,
                    customExpressionType,
                  ) =>
                    onConfigPatch({
                      expressionType: expressionTypes[0],
                      expressionTypes,
                      customExpressionType,
                    })
                  }
                />
                <MultiSelectField
                  label="前贴与正片关系"
                  values={productionConfig.prerollTypes}
                  options={Object.entries(prerollLabels).map(
                    ([value, label]) => ({
                      value: value as PrerollType,
                      label,
                    }),
                  )}
                  description="单次生成多个脚本时，每条脚本会从已选关系中独立选择一种。"
                  onChange={(prerollTypes) =>
                    onConfigPatch({ prerollTypes })
                  }
                />
              </div>
            </fieldset>
          )}

          {!usesUploadedHighlights && (
            <fieldset className="pipeline-config-group highlight-config-group">
              <legend>高光剪辑</legend>
              <div className="pipeline-config-grid highlight-plan-grid">
                <label>
                  <span>素材类型</span>
                  <select
                    value={
                      productionConfig.highlightContentType
                    }
                    onChange={(event) =>
                      onConfigChange(
                        "highlightContentType",
                        event.target
                          .value as ProductionConfig["highlightContentType"],
                      )
                    }
                  >
                    {Object.entries(
                      highlightContentTypeLabels,
                    ).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <small>
                    建议时长范围：
                    {productionConfig.highlightContentType ===
                    "animation"
                      ? "30-300 秒"
                      : "60-720 秒"}
                  </small>
                </label>
                <label>
                  <span>剪辑模式</span>
                  <select
                    value={productionConfig.highlightCutMode}
                    onChange={(event) => {
                      const highlightCutMode =
                        event.target
                          .value as ProductionConfig["highlightCutMode"];
                      onConfigPatch({
                        highlightCutMode,
                        enableOpeningHook:
                          highlightCutMode === "Sequential"
                            ? false
                            : productionConfig.enableOpeningHook,
                      });
                    }}
                  >
                    <option value="Mixed">
                      混剪 / 跳剪（推荐）
                    </option>
                    <option value="Sequential">顺剪</option>
                  </select>
                  <small>
                    混剪适合投流；顺剪更适合剧情回顾。
                  </small>
                </label>
                <label>
                  <span>目标时长（秒）</span>
                  <input
                    type="number"
                    min={1}
                    max={totalDurationSeconds}
                    disabled={!durationReady}
                    value={targetDurationInput}
                    placeholder="请输入"
                    onChange={(event) =>
                      onTargetDurationInputChange(
                        event.target.value,
                      )
                    }
                  />
                  <small>
                    {!durationReady
                      ? "读取所选视频时长后即可设置。"
                      : hasBasicTargetCount
                        ? `推荐目标时长 ${recommendedTargetDuration} 秒；建议上限 ${targetDurationUpperLimit} 秒（仅供参考）。`
                        : `目标时长不超过素材总时长 ${totalDurationSeconds} 秒。`}
                  </small>
                </label>
                <label>
                  <span>输出视频数</span>
                  <input
                    type="number"
                    min={1}
                    disabled={!durationReady}
                    value={targetCountInput}
                    placeholder="请输入"
                    onChange={(event) =>
                      onTargetCountInputChange(
                        event.target.value,
                      )
                    }
                  />
                  <small>
                    {!durationReady
                      ? "读取所选视频时长后即可设置。"
                      : hasBasicTargetDuration
                        ? `推荐生产 ${recommendedTargetCount} 个；建议上限 ${targetCountUpperLimit} 个（仅供参考）。`
                        : "输入目标时长后显示推荐数量和建议上限。"}
                  </small>
                </label>
                <label>
                  <span>精彩前置</span>
                  <select
                    value={
                      productionConfig.enableOpeningHook
                        ? "enabled"
                        : "disabled"
                    }
                    onChange={(event) => {
                      const enableOpeningHook =
                        event.target.value === "enabled";
                      onConfigPatch({
                        enableOpeningHook,
                        highlightCutMode:
                          enableOpeningHook &&
                          productionConfig.highlightCutMode ===
                            "Sequential"
                            ? "Mixed"
                            : productionConfig.highlightCutMode,
                      });
                    }}
                  >
                    <option value="enabled">
                      开启（混剪推荐）
                    </option>
                    <option value="disabled">关闭</option>
                  </select>
                  <small>
                    顺剪建议关闭；开启时会自动切换为混剪。
                  </small>
                </label>
              </div>
            </fieldset>
          )}

          {!usesBatchHighlights && (
            <fieldset className="pipeline-config-group">
              <legend>AI 前贴视频</legend>
              <div className="pipeline-config-grid preroll-video-grid">
                <label>
                  <span>人物生成方式</span>
                  <select
                    value={productionConfig.characterMode}
                    onChange={(event) =>
                      onConfigChange(
                        "characterMode",
                        event.target
                          .value as ProductionConfig["characterMode"],
                      )
                    }
                  >
                    {Object.entries(characterModeLabels).map(
                      ([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                  <small>
                    选择参考角色、预制新角色资产或直接文生视频。
                  </small>
                </label>
                <label>
                  <span>视频模型</span>
                  <select
                    aria-label="视频模型"
                    value={productionConfig.videoModel}
                    onChange={(event) =>
                      onConfigChange(
                        "videoModel",
                        event.target
                          .value as ProductionConfig["videoModel"],
                      )
                    }
                  >
                    {videoModelOptions(
                      productionConfig.videoModel,
                    ).map(
                      (model) => (
                        <option value={model} key={model}>
                          {videoModelLabels[model]}
                        </option>
                      ),
                    )}
                  </select>
                  <small>
                    非默认模型需配置对应 Ark Endpoint。
                  </small>
                </label>
                <label>
                  <span>生成字幕</span>
                  <select
                    aria-label="生成字幕"
                    value={
                      productionConfig.generateSubtitles
                        ? "yes"
                        : "no"
                    }
                    onChange={(event) =>
                      onConfigChange(
                        "generateSubtitles",
                        event.target.value === "yes",
                      )
                    }
                  >
                    <option value="no">否</option>
                    <option value="yes">是</option>
                  </select>
                  <small>
                    选择后将在生成视频提示词时调用对应版本。
                  </small>
                </label>
                {productionConfig.generateSubtitles && (
                  <>
                    <label>
                      <span>字幕字体</span>
                      <select
                        aria-label="字幕字体"
                        value={
                          productionConfig.subtitleFontType
                        }
                        onChange={(event) =>
                          onConfigChange(
                            "subtitleFontType",
                            event.target
                              .value as (typeof subtitleFontTypes)[number],
                          )
                        }
                      >
                        {subtitleFontTypes.map((value) => (
                          <option value={value} key={value}>
                            {subtitleFontTypeLabels[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>字幕字号</span>
                      <input
                        type="number"
                        min={12}
                        max={160}
                        value={
                          productionConfig.subtitleFontSize
                        }
                        onChange={(event) =>
                          onConfigChange(
                            "subtitleFontSize",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>字幕颜色</span>
                      <div className="color-picker-row">
                        <input
                          type="color"
                          aria-label="字幕颜色"
                          value={productionConfig.subtitleFontColor.slice(
                            0,
                            7,
                          )}
                          onChange={(event) =>
                            onConfigChange(
                              "subtitleFontColor",
                              `${event.target.value}FF`,
                            )
                          }
                        />
                        <input
                          type="text"
                          aria-label="字幕颜色代码"
                          value={
                            productionConfig.subtitleFontColor
                          }
                          maxLength={9}
                          placeholder="#FFFFFFFF"
                          onChange={(event) =>
                            onConfigChange(
                              "subtitleFontColor",
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    </label>
                    <label>
                      <span>字幕位置</span>
                      <select
                        aria-label="字幕位置"
                        value={
                          productionConfig.subtitlePosition
                        }
                        onChange={(event) =>
                          onConfigChange(
                            "subtitlePosition",
                            event.target
                              .value as (typeof subtitlePositions)[number],
                          )
                        }
                      >
                        {subtitlePositions.map((value) => (
                          <option value={value} key={value}>
                            {subtitlePositionLabels[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  <span>分辨率</span>
                  <select
                    aria-label="分辨率"
                    value={productionConfig.videoResolution}
                    onChange={(event) =>
                      onConfigChange(
                        "videoResolution",
                        event.target
                          .value as ProductionConfig["videoResolution"],
                      )
                    }
                  >
                    {videoResolutions.map((resolution) => (
                      <option
                        value={resolution}
                        key={resolution}
                      >
                        {resolution.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <small>
                    分辨率将直接传入视频生成任务。
                  </small>
                </label>
                <label>
                  <span>宽高比</span>
                  <select
                    aria-label="宽高比"
                    value={productionConfig.videoRatio}
                    onChange={(event) =>
                      onConfigChange(
                        "videoRatio",
                        event.target
                          .value as ProductionConfig["videoRatio"],
                      )
                    }
                  >
                    {videoRatios.map((ratio) => (
                      <option value={ratio} key={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                  <small>
                    宽高比将直接传入视频生成任务。
                  </small>
                </label>
              </div>
            </fieldset>
          )}
        </div>
      </div>
    </>
  );
}
