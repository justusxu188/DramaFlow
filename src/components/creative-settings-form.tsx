"use client";

import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { ExpressionTypeCombobox } from "@/components/expression-type-combobox";
import { MultiSelectField } from "@/components/multi-select-field";
import type { CreativeSettings } from "@/lib/creative-settings-store";
import {
  prerollLabels,
  type PrerollType,
} from "@/lib/domain";
import {
  characterModeLabels,
  defaultProductionConfig,
  highlightTemplateLabels,
  highlightTemplates,
  imageModelLabels,
  videoModelLabels,
  videoModelOptions,
  subtitleFontTypeLabels,
  subtitleFontTypes,
  subtitlePositionLabels,
  subtitlePositions,
  type ProductionConfig,
} from "@/lib/production-config";
import {
  defaultPrerollCreativeSystemPrompt,
  defaultPrerollScriptSystemPrompt,
  defaultVideoPromptSystemPrompt,
  defaultVideoPromptWithoutSubtitlesSystemPrompt,
} from "@/lib/preroll-prompts";

export function CreativeSettingsForm({
  initialSettings,
}: {
  initialSettings: CreativeSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [promptStage, setPromptStage] = useState<
    "creative" | "script" | "video"
  >("creative");

  function update<K extends keyof ProductionConfig>(
    key: K,
    value: ProductionConfig[K],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/creative", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存失败");
      setMessage("创作默认值已保存，新启动的流水线会固化这套配置。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="creative-settings">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI CREATIVE RULES</p>
          <h2>生产默认值</h2>
        </div>
        <span className="work-count">任务启动后固化</span>
      </div>
      <p>项目启动时仍可调整。系统会在任务开始时快照参数，后续全链路不受全局配置变化影响。</p>
      <div className="creative-default-grid">
        <label>
          <span>爽点故事线数量</span>
          <input
            type="number"
            min={1}
            max={6}
            value={settings.sellingPointCount}
            onChange={(event) => update("sellingPointCount", Number(event.target.value))}
          />
        </label>
        <label>
          <span>每条故事线脚本数</span>
          <input
            type="number"
            min={1}
            max={6}
            value={settings.scriptCount}
            onChange={(event) => update("scriptCount", Number(event.target.value))}
          />
        </label>
        <ExpressionTypeCombobox
          values={settings.expressionTypes}
          customValue={settings.customExpressionType}
          onChange={(expressionTypes, customExpressionType) =>
            setSettings((current) => ({
              ...current,
              expressionType: expressionTypes[0],
              expressionTypes,
              customExpressionType,
            }))
          }
        />
        <MultiSelectField
          label="前贴与正片关系"
          values={settings.prerollTypes}
          options={Object.entries(prerollLabels).map(
            ([value, label]) => ({
              value: value as PrerollType,
              label,
            }),
          )}
          description="单次生成多个脚本时，每条脚本会从已选关系中独立选择一种。"
          onChange={(prerollTypes) =>
            update("prerollTypes", prerollTypes)}
        />
        <label>
          <span>AI 前贴人物方式</span>
          <select
            value={settings.characterMode}
            onChange={(event) => update(
              "characterMode",
              event.target.value as ProductionConfig["characterMode"],
            )}
          >
            {Object.entries(characterModeLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>默认图片模型</span>
          <select
            value={settings.imageModel}
            onChange={(event) => update(
              "imageModel",
              event.target.value as ProductionConfig["imageModel"],
            )}
          >
            {Object.entries(imageModelLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>默认视频模型</span>
          <select
            value={settings.videoModel}
            onChange={(event) => update(
              "videoModel",
              event.target.value as ProductionConfig["videoModel"],
            )}
          >
            {videoModelOptions(settings.videoModel).map((model) => (
              <option value={model} key={model}>
                {videoModelLabels[model]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>生成字幕</span>
          <select
            value={settings.generateSubtitles ? "yes" : "no"}
            onChange={(event) => update(
              "generateSubtitles",
              event.target.value === "yes",
            )}
          >
            <option value="no">否</option>
            <option value="yes">是</option>
          </select>
        </label>
        {settings.generateSubtitles && (
          <>
            <label>
              <span>字幕字体</span>
              <select
                value={settings.subtitleFontType}
                onChange={(event) => update(
                  "subtitleFontType",
                  event.target.value as typeof subtitleFontTypes[number],
                )}
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
                value={settings.subtitleFontSize}
                onChange={(event) => update(
                  "subtitleFontSize",
                  Number(event.target.value),
                )}
              />
            </label>
            <label>
              <span>字幕颜色</span>
              <div className="color-picker-row">
                <input
                  type="color"
                  value={settings.subtitleFontColor.slice(0, 7)}
                  onChange={(event) => {
                    const hex = event.target.value;
                    update(
                      "subtitleFontColor",
                      `${hex}FF`,
                    );
                  }}
                />
                <input
                  type="text"
                  value={settings.subtitleFontColor}
                  maxLength={9}
                  placeholder="#FFFFFFFF"
                  onChange={(event) => update(
                    "subtitleFontColor",
                    event.target.value,
                  )}
                />
              </div>
            </label>
            <label>
              <span>字幕位置</span>
              <select
                value={settings.subtitlePosition}
                onChange={(event) => update(
                  "subtitlePosition",
                  event.target.value as typeof subtitlePositions[number],
                )}
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
          <span>高光目标方式</span>
          <select
            value={settings.highlightTargetMode}
            onChange={(event) => update(
              "highlightTargetMode",
              event.target.value as ProductionConfig["highlightTargetMode"],
            )}
          >
            <option value="count">按输出数量</option>
            <option value="duration">按单条时长</option>
          </select>
        </label>
        <label>
          <span>
            {settings.highlightTargetMode === "count"
              ? "目标输出数量"
              : "目标单条时长（秒）"}
          </span>
          <input
            type="number"
            min={settings.highlightTargetMode === "count" ? 1 : 30}
            max={settings.highlightTargetMode === "count" ? 60 : 720}
            value={
              settings.highlightTargetMode === "count"
                ? settings.highlightTargetCount
                : settings.highlightTargetDuration
            }
            onChange={(event) => {
              const value = Number(event.target.value);
              if (settings.highlightTargetMode === "count") {
                update("highlightTargetCount", value);
              } else {
                update("highlightTargetDuration", value);
              }
            }}
          />
        </label>
        <label>
          <span>剪辑模式</span>
          <select
            value={settings.highlightCutMode}
            onChange={(event) => update(
              "highlightCutMode",
              event.target.value as ProductionConfig["highlightCutMode"],
            )}
          >
            <option value="Mixed">混剪</option>
            <option value="Sequential">顺剪</option>
          </select>
        </label>
        <label>
          <span>视觉模板</span>
          <select
            value={settings.highlightTemplate}
            onChange={(event) => update(
              "highlightTemplate",
              event.target.value as ProductionConfig["highlightTemplate"],
            )}
          >
            {highlightTemplates.map((value) => (
              <option value={value} key={value}>
                {highlightTemplateLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="creative-setting-wide">
        <span>高光片段筛选要求</span>
        <textarea
          value={settings.highlightSegmentPrompt}
          onChange={(event) => update("highlightSegmentPrompt", event.target.value)}
          maxLength={2000}
        />
      </label>
      <label className="creative-setting-wide">
        <span>高光开头筛选要求</span>
        <textarea
          value={settings.highlightStartPrompt}
          onChange={(event) => update("highlightStartPrompt", event.target.value)}
          maxLength={2000}
        />
      </label>
      <label className="creative-setting-wide">
        <span>高光结尾筛选要求</span>
        <textarea
          value={settings.highlightEndingPrompt}
          onChange={(event) => update("highlightEndingPrompt", event.target.value)}
          maxLength={2000}
        />
      </label>
      <div className="creative-default-grid">
        <label>
          <span>提示语</span>
          <input
            value={settings.highlightHint}
            maxLength={20}
            placeholder="留空或输入“无”表示不需要提示语"
            onChange={(event) => update("highlightHint", event.target.value)}
          />
        </label>
        <label>
          <span>智能精彩前置</span>
          <select
            value={settings.enableOpeningHook ? "enabled" : "disabled"}
            onChange={(event) => update(
              "enableOpeningHook",
              event.target.value === "enabled",
            )}
          >
            <option value="enabled">启用</option>
            <option value="disabled">关闭</option>
          </select>
        </label>
        <label>
          <span>钩子最小时长（秒）</span>
          <input
            type="number"
            min={1}
            max={15}
            value={settings.openingHookMinDuration}
            onChange={(event) => update(
              "openingHookMinDuration",
              Number(event.target.value),
            )}
          />
        </label>
        <label>
          <span>钩子最大时长（秒）</span>
          <input
            type="number"
            min={1}
            max={15}
            value={settings.openingHookMaxDuration}
            onChange={(event) => update(
              "openingHookMaxDuration",
              Number(event.target.value),
            )}
          />
        </label>
        <label>
          <span>钩子最低高光分</span>
          <input
            type="number"
            min={1}
            max={5}
            step={0.1}
            value={settings.openingHookMinScore}
            onChange={(event) => update(
              "openingHookMinScore",
              Number(event.target.value),
            )}
          />
        </label>
      </div>
      <div className="prompt-stage-editor">
        <div
          className="prompt-stage-tabs"
          role="tablist"
          aria-label="AI 前贴三阶段 System Prompt"
        >
          {[
            ["creative", "01 创意提案", "剧情输入 → 差异化创意"],
            ["script", "02 视频脚本", "创意提案 → 可审核脚本"],
            ["video", "03 生视频提示词", "确认脚本 → Seedance 指令"],
          ].map(([id, label, description]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={promptStage === id}
              className={promptStage === id ? "active" : ""}
              onClick={() =>
                setPromptStage(
                  id as "creative" | "script" | "video",
                )}
            >
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
        {promptStage === "creative" && (
          <label className="creative-setting-wide prompt-stage-content">
            <span>AI 前贴创意提案 System Prompt</span>
            <small>
              输入剧情证据、爽点故事线、风格、关系、衔接锚点和当前批次创意指纹；输出结构化创意提案。
            </small>
            <textarea
              value={settings.prerollCreativeSystemPrompt}
              onChange={(event) => setSettings((current) => ({
                ...current,
                prerollCreativeSystemPrompt:
                  event.target.value.slice(0, 8000),
              }))}
              placeholder="控制创意母题、叙事视角、首帧奇观和差异化"
              aria-label="AI 前贴创意提案 System Prompt"
            />
            <small>
              {settings.prerollCreativeSystemPrompt.length} / 8000
            </small>
          </label>
        )}
        {promptStage === "script" && (
          <label className="creative-setting-wide prompt-stage-content">
            <span>AI 前贴视频脚本 System Prompt</span>
            <small>
              输入通过筛选的创意提案、必要剧情证据和高光衔接锚点；输出用户可编辑、可确认的完整视频脚本。
            </small>
            <textarea
              value={settings.prerollScriptSystemPrompt}
              onChange={(event) => setSettings((current) => ({
                ...current,
                prerollScriptSystemPrompt:
                  event.target.value.slice(0, 8000),
              }))}
              placeholder="控制完整脚本的节奏、画面、口播和正片衔接"
              aria-label="AI 前贴视频脚本 System Prompt"
            />
            <small>
              {settings.prerollScriptSystemPrompt.length} / 8000
            </small>
          </label>
        )}
        {promptStage === "video" && (
          <div className="prompt-stage-versions">
            <label className="creative-setting-wide prompt-stage-content">
              <span>有字幕生视频提示词 System Prompt</span>
              <small>
                生成字幕选择“是”时使用。
              </small>
              <textarea
                value={settings.videoPromptSystemPrompt}
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  videoPromptSystemPrompt:
                    event.target.value.slice(0, 12000),
                }))}
                placeholder="控制字幕、角色、场景、运镜、声音和连续性"
                aria-label="有字幕生视频提示词 System Prompt"
              />
              <small>
                {settings.videoPromptSystemPrompt.length} / 12000
              </small>
            </label>
            <label className="creative-setting-wide prompt-stage-content">
              <span>无字幕生视频提示词 System Prompt</span>
              <small>
                生成字幕选择“否”时使用，禁止画面出现字幕和其他可见文字。
              </small>
              <textarea
                value={
                  settings.videoPromptWithoutSubtitlesSystemPrompt
                }
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  videoPromptWithoutSubtitlesSystemPrompt:
                    event.target.value.slice(0, 16000),
                }))}
                placeholder="控制无字幕视频的角色、场景、运镜、声音和文字限制"
                aria-label="无字幕生视频提示词 System Prompt"
              />
              <small>
                {
                  settings.videoPromptWithoutSubtitlesSystemPrompt
                    .length
                }{" "}
                / 16000
              </small>
            </label>
          </div>
        )}
      </div>
      <div className="creative-settings-actions">
        <button
          className="button ghost"
          onClick={() => setSettings((current) => ({
            ...current,
            ...defaultProductionConfig,
            prerollCreativeSystemPrompt:
              defaultPrerollCreativeSystemPrompt,
            prerollScriptSystemPrompt:
              defaultPrerollScriptSystemPrompt,
            videoPromptSystemPrompt:
              defaultVideoPromptSystemPrompt,
            videoPromptWithoutSubtitlesSystemPrompt:
              defaultVideoPromptWithoutSubtitlesSystemPrompt,
          }))}
        >
          <RotateCcw size={15} /> 恢复默认
        </button>
        <button className="button primary" onClick={() => void save()} disabled={saving}><Save size={15} /> {saving ? "保存中" : "保存配置"}</button>
      </div>
      {message && <small className="settings-message">{message}</small>}
    </section>
  );
}
