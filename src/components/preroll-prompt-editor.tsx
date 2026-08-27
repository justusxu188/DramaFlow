"use client";

import {
  Film,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArtifactVideo } from "@/components/artifact-video";
import type {
  CharacterImageAsset,
  PipelineData,
  PipelineJob,
  PipelineRender,
  PipelineScript,
} from "@/components/pipeline-workspace-types";
import { isUsableCharacterImageAsset } from "@/lib/character-image-assets";
import {
  normalizeVideoResolution,
  videoGenerationSegmentLimit,
  videoModelLabels,
  videoModelOptions,
  videoRatios,
  videoResolutions,
  type ProductionConfig,
} from "@/lib/production-config";
import { stripVideoRatioInstructions } from "@/lib/seedance-prompt";

export type PromptGenerationSettings = {
  targetDuration: number;
  videoModel: ProductionConfig["videoModel"];
  videoResolution: ProductionConfig["videoResolution"];
  videoRatio: ProductionConfig["videoRatio"];
  generateSubtitles: boolean;
};

export type PromptCharacterSelection = {
  scriptId: string;
  characterName: string;
  assetIds: string[];
  useTextToVideo?: boolean;
};

type LatestRenderActions = (input: {
  script: PipelineScript;
  render: PipelineRender;
  duration: number;
}) => ReactNode;

const textToVideoSelection = "__text_to_video__";

function characterNames(script: PipelineScript) {
  return [...new Set(
    script.shots.flatMap((shot) => shot.characters ?? []),
  )].filter(Boolean);
}

function formatRenderTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function scriptActivityTime(
  script: PipelineScript,
  renders: PipelineRender[],
) {
  if (script.prerollOpenedAt) {
    return {
      explicitlyOpened: true,
      value: script.prerollOpenedAt,
    };
  }
  const latestVideoTime = renders
    .filter(
      (render) =>
        render.scriptId === script.id &&
        Boolean(render.videoUrl),
    )
    .reduce(
      (latest, render) =>
        (render.updatedAt ?? render.createdAt) > latest
          ? render.updatedAt ?? render.createdAt
          : latest,
      "",
    );
  return {
    explicitlyOpened: false,
    value:
      latestVideoTime ||
      script.updatedAt ||
      script.createdAt ||
      "",
  };
}

function PrerollPromptCard({
  script,
  jobs,
  renders,
  characters,
  imageAssets,
  productionConfig,
  characterSelections,
  submitting,
  submitError,
  onCharacterSelectionChange,
  onCompile,
  onSave,
  onGenerate,
  renderLatestActions,
  onLatestRenderStatusChange,
  onLatestRenderRecover,
}: {
  script: PipelineScript;
  jobs: PipelineJob[];
  renders: PipelineRender[];
  characters: PipelineData["characters"];
  imageAssets: CharacterImageAsset[];
  productionConfig: ProductionConfig;
  characterSelections: Record<string, string>;
  submitting: boolean;
  submitError?: string;
  onCharacterSelectionChange: (key: string, assetId: string) => void;
  onCompile: (
    scriptId: string,
    settings: PromptGenerationSettings,
    selections: PromptCharacterSelection[],
  ) => Promise<boolean>;
  onSave: (
    scriptId: string,
    segments: Array<{ index: number; submittedPrompt: string }>,
    selections: PromptCharacterSelection[],
    settings: PromptGenerationSettings,
  ) => Promise<boolean>;
  onGenerate: (scriptId: string) => void;
  renderLatestActions?: LatestRenderActions;
  onLatestRenderStatusChange?: (
    render: PipelineRender,
    status: "checking" | "available" | "expired" | "missing",
  ) => void;
  onLatestRenderRecover?: (render: PipelineRender) => void;
}) {
  const plan = script.videoPromptPlan;
  const [settings, setSettings] = useState<PromptGenerationSettings>(() => ({
    targetDuration: Math.max(
      4,
      Math.round(
        plan?.targetDuration ??
          script.aiSegmentSec ??
          script.duration,
      ),
    ),
    videoModel: plan?.targetModel ?? productionConfig.videoModel,
    videoResolution:
      normalizeVideoResolution(
        plan?.resolution,
        productionConfig.videoResolution,
      ),
    videoRatio: plan?.aspectRatio ?? productionConfig.videoRatio,
    generateSubtitles:
      plan?.generateSubtitles ?? productionConfig.generateSubtitles,
  }));
  const [prompts, setPrompts] = useState<Record<number, string>>(
    () => Object.fromEntries(
      plan?.segments.map((segment) => [
        segment.index,
        stripVideoRatioInstructions(
          segment.submittedPrompt ?? segment.prompt,
        ),
      ]) ?? [],
    ),
  );
  const [saving, setSaving] = useState(false);
  const [promptDirty, setPromptDirty] = useState(false);
  const [latestVideoDuration, setLatestVideoDuration] =
    useState(0);
  const hydratedRevision = useRef("");
  const promptJob = jobs
    .filter(
      (job) =>
        job.kind === "preroll" &&
        job.input?.scriptId === script.id &&
        job.input?.prerollPhase === "compile_prompt",
    )
    .sort((left, right) =>
      String(right.updatedAt ?? right.createdAt ?? "").localeCompare(
        String(left.updatedAt ?? left.createdAt ?? ""),
      ),
    )[0];
  const videoJob = jobs
    .filter(
      (job) =>
        job.kind === "preroll" &&
        job.input?.scriptId === script.id &&
        job.input?.prerollPhase !== "compile_prompt",
    )
    .sort((left, right) =>
      String(right.updatedAt ?? right.createdAt ?? "").localeCompare(
        String(left.updatedAt ?? left.createdAt ?? ""),
      ),
    )[0];
  const scriptRenders = renders
    .filter(
      (render) =>
        render.scriptId === script.id &&
        Boolean(render.videoUrl),
    )
    .sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  const latestRender = scriptRenders[0];
  const compiling = Boolean(
    promptJob && ["queued", "running"].includes(promptJob.status),
  );
  const videoRunning = Boolean(
    videoJob && ["queued", "running"].includes(videoJob.status),
  );
  const videoFailed = videoJob?.status === "failed";
  const showLatestRender = Boolean(
    latestRender?.videoUrl && !videoRunning && !videoFailed,
  );
  const hasCurrentVideo = Boolean(latestRender?.videoUrl);
  const names = useMemo(() => characterNames(script), [script]);
  const selections = names.map((characterName) => {
    const assetId =
      characterSelections[`${script.id}\u0000${characterName}`] ??
      textToVideoSelection;
    return {
      scriptId: script.id,
      characterName,
      assetIds: assetId === textToVideoSelection ? [] : [assetId],
      useTextToVideo: assetId === textToVideoSelection,
    };
  });
  const savedTargetDuration =
    plan?.targetDuration ??
    plan?.segments.reduce(
      (total, segment) => total + segment.duration,
      0,
    );
  const durationDirty = Boolean(
    plan &&
      settings.targetDuration !== savedTargetDuration,
  );
  const subtitleModeDirty = Boolean(
    plan &&
      settings.generateSubtitles !==
        (plan.generateSubtitles ??
          productionConfig.generateSubtitles),
  );
  const videoModelDirty = Boolean(
    plan &&
      settings.videoModel !==
        (plan.targetModel ?? productionConfig.videoModel),
  );
  const videoResolutionDirty = Boolean(
    plan &&
      settings.videoResolution !==
        normalizeVideoResolution(
          plan.resolution,
          productionConfig.videoResolution,
        ),
  );
  const videoRatioDirty = Boolean(
    plan &&
      settings.videoRatio !==
        (plan.aspectRatio ?? productionConfig.videoRatio),
  );
  const segmentLimitExceeded = Boolean(
    plan?.segments.some(
      (segment) =>
        segment.duration >
        videoGenerationSegmentLimit(settings.videoModel),
    ),
  );
  const unnecessarySegmentation = Boolean(
    plan &&
      savedTargetDuration &&
      savedTargetDuration <=
        (
          plan.maxClipDurationSec ??
          videoGenerationSegmentLimit(settings.videoModel)
        ) &&
      plan.segments.length > 1,
  );
  const assetBindingsDirty = Boolean(
    plan &&
      names.some((characterName) => {
        const selectedId =
          characterSelections[
            `${script.id}\u0000${characterName}`
          ] ?? textToVideoSelection;
        const binding = plan.referenceBindings?.find(
          (item) => item.characterName === characterName,
        );
        const savedId =
          !binding ||
          binding.useTextToVideo ||
          !binding.assetIds[0]
            ? textToVideoSelection
            : binding.assetIds[0];
        return selectedId !== savedId;
      }),
  );
  const promptInputsDirty =
    durationDirty ||
    subtitleModeDirty ||
    assetBindingsDirty ||
    unnecessarySegmentation ||
    segmentLimitExceeded;
  const submissionSettingsDirty =
    videoModelDirty ||
    videoResolutionDirty ||
    videoRatioDirty;
  const promptsComplete = Boolean(
    plan?.segments.length &&
      plan.segments.every((segment) =>
        prompts[segment.index]?.trim(),
      ),
  );
  const settingsValid =
    Number.isInteger(settings.targetDuration) &&
    settings.targetDuration >= 4 &&
    settings.targetDuration <= 300;
  const confirmed =
    Boolean(plan) &&
    plan?.reviewStatus === "confirmed" &&
    plan.segments.every((segment) =>
      Boolean(segment.submittedPrompt?.trim()),
    ) &&
    !promptInputsDirty &&
    !submissionSettingsDirty &&
    !promptDirty;
  const planRevision = [
    script.videoPromptCompiledAt,
    plan?.editedAt,
    plan?.confirmedAt,
    plan?.segments.length,
  ].join(":");

  useEffect(() => {
    if (!plan || hydratedRevision.current === planRevision) return;
    hydratedRevision.current = planRevision;
    setSettings({
      targetDuration: Math.max(
        4,
        Math.round(
          plan.targetDuration ??
            script.aiSegmentSec ??
            script.duration,
        ),
      ),
      videoModel: plan.targetModel ?? productionConfig.videoModel,
      videoResolution:
        normalizeVideoResolution(
          plan.resolution,
          productionConfig.videoResolution,
        ),
      videoRatio: plan.aspectRatio ?? productionConfig.videoRatio,
      generateSubtitles:
        plan.generateSubtitles ?? productionConfig.generateSubtitles,
    });
    setPrompts(Object.fromEntries(
      plan.segments.map((segment) => [
        segment.index,
        stripVideoRatioInstructions(
          segment.submittedPrompt ?? segment.prompt,
        ),
      ]),
    ));
    setPromptDirty(false);
  }, [planRevision]);

  useEffect(() => {
    setLatestVideoDuration(0);
  }, [latestRender?.id]);

  function selectCharacter(characterName: string, assetId: string) {
    onCharacterSelectionChange(
      `${script.id}\u0000${characterName}`,
      assetId,
    );
  }

  function selectVideoRatio(
    videoRatio: ProductionConfig["videoRatio"],
  ) {
    setSettings((current) => ({
      ...current,
      videoRatio,
    }));
  }

  async function savePrompt() {
    if (!plan) return false;
    setSaving(true);
    try {
      const saved = await onSave(
        script.id,
        plan.segments.map((segment) => ({
          index: segment.index,
          submittedPrompt: prompts[segment.index] ?? "",
        })),
        selections,
        settings,
      );
      if (saved) setPromptDirty(false);
      return saved;
    } finally {
      setSaving(false);
    }
  }

  async function generateVideo() {
    if (!plan || promptInputsDirty || !promptsComplete) {
      return;
    }
    if (!confirmed) {
      const saved = await savePrompt();
      if (!saved) return;
    }
    onGenerate(script.id);
  }

  return (
    <article
      className="preroll-prompt-card"
      id={`video-prompt-${script.id}`}
    >
      <header className="preroll-prompt-heading">
        <div>
          <strong>{script.title}</strong>
          <span>
            {plan
              ? promptDirty || submissionSettingsDirty
                ? "编辑内容将在生成视频时保存"
                : confirmed
                  ? "提示词已保存"
                  : "可编辑后生成视频"
              : "尚未生成提示词"}
          </span>
        </div>
      </header>

      <div className="preroll-studio-layout">
        <section className="preroll-studio-pane asset-pane">
          <header>
            <strong>资产图选择</strong>
            <span>{names.length} 个人物</span>
          </header>
          {productionConfig.characterMode ===
            "drama_character" && names.length > 0 ? (
            <div className="preroll-character-assets">
            {names.map((name) => {
              const selectedId =
                characterSelections[
                  `${script.id}\u0000${name}`
                ] ?? textToVideoSelection;
              const character = characters.find(
                (item) =>
                  item.name === name ||
                  item.aliases.includes(name),
              );
              const aliases = new Set([
                name,
                character?.name,
                ...(character?.aliases ?? []),
              ].filter(Boolean));
              const matchesCharacter = (asset: CharacterImageAsset) =>
                Boolean(
                    asset.metadata.characterId === character?.id ||
                    aliases.has(asset.metadata.characterName),
                );
              const assets = imageAssets
                .filter(isUsableCharacterImageAsset)
                .sort((left, right) => {
                const relevance =
                  Number(matchesCharacter(right)) -
                  Number(matchesCharacter(left));
                return relevance || left.name.localeCompare(right.name, "zh-CN");
                });
              const selectedAsset = assets.find(
                (asset) => asset.id === selectedId,
              );
              return (
                <div className="preroll-character-group" key={name}>
                  <div className="preroll-character-heading">
                    <b>@{name}</b>
                    <small>{assets.length} 张项目图片</small>
                  </div>
                  <div className="preroll-asset-select-row">
                    {selectedAsset ? (
                      <img
                        src={selectedAsset.sourceUrl}
                        alt={`${name}当前关联：${selectedAsset.name}`}
                      />
                    ) : (
                      <span aria-hidden="true">
                        <ImageIcon size={17} />
                      </span>
                    )}
                    <select
                      aria-label={`${name}关联图像资产`}
                      value={selectedId}
                      onChange={(event) =>
                        selectCharacter(name, event.target.value)
                      }
                    >
                      <option value={textToVideoSelection}>
                        不关联图片
                      </option>
                    {assets.map((asset) => {
                      const unavailable =
                        asset.metadata.avatarStatus === "processing" ||
                        asset.metadata.avatarStatus === "failed";
                      const status =
                        asset.metadata.avatarStatus === "processing"
                          ? " · 处理中"
                          : asset.metadata.avatarStatus === "failed"
                            ? " · 不可用"
                            : "";
                      return (
                        <option
                          value={asset.id}
                          disabled={unavailable}
                          key={asset.id}
                        >
                          {asset.name}{status}
                        </option>
                      );
                    })}
                    </select>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <div className="preroll-pane-empty">
              当前脚本不需要人物参考图。
            </div>
          )}
        </section>

        <section className="preroll-studio-pane prompt-pane">
          <header>
            <strong>提示词编辑</strong>
          </header>
          {plan && !promptInputsDirty ? (
            <div className="preroll-prompt-segments">
              {plan.segments.map((segment) => (
                <label key={segment.index}>
                  <textarea
                    aria-label={`分段 ${segment.index + 1} 生视频提示词`}
                    value={prompts[segment.index] ?? ""}
                    onChange={(event) => {
                      setPrompts((current) => ({
                        ...current,
                        [segment.index]: event.target.value,
                      }));
                      setPromptDirty(true);
                    }}
                    rows={10}
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="preroll-pane-empty">
              {promptInputsDirty
                ? "人物资产或参数已变化，请重新 AI 生成提示词。"
                : "配置参数和人物资产后，点击 AI 生成提示词。"}
            </div>
          )}
        </section>

        <section className="preroll-studio-pane preview-pane">
          <header>
            <strong>生成视频</strong>
            <span>
              {videoRunning
                ? `生成中 ${videoJob?.progress ?? 0}%`
                : videoFailed
                  ? "本轮生成失败"
                  : showLatestRender
                    ? formatRenderTime(
                        latestRender?.updatedAt ??
                          latestRender?.createdAt,
                      )
                    : "等待生成"}
            </span>
          </header>
          {hasCurrentVideo && latestRender ? (
            <>
              {(videoRunning || videoFailed) && (
                <div
                  className={`preroll-video-generation-state ${
                    videoFailed ? "failed" : ""
                  }`}
                  role={videoFailed ? "alert" : "status"}
                >
                  {videoRunning && (
                    <LoaderCircle className="spin" size={15} />
                  )}
                  {videoRunning
                    ? "AI 前贴视频生成中"
                    : videoJob?.error ||
                      "本轮视频生成失败，请检查后重试。"}
                </div>
              )}
              <div className="preroll-video-version-list">
                <div
                  className="preroll-video-version"
                  data-current="true"
                >
                  <ArtifactVideo
                    src={latestRender.videoUrl!}
                    artifactLabel={script.title}
                    contextLabel={formatRenderTime(
                      latestRender.updatedAt ??
                        latestRender.createdAt,
                    )}
                    controls
                    playsInline
                    preload="metadata"
                    recoverLabel="重新生成前贴视频"
                    onRecover={() =>
                      onLatestRenderRecover?.(latestRender)
                    }
                    onStatusChange={(status) =>
                      onLatestRenderStatusChange?.(
                        latestRender,
                        status,
                      )
                    }
                    onLoadedMetadata={(event) =>
                      setLatestVideoDuration(
                        event.currentTarget.duration,
                      )
                    }
                  />
                  {renderLatestActions?.({
                    script,
                    render: latestRender,
                    duration: latestVideoDuration,
                  })}
                </div>
              </div>
            </>
          ) : (
            <div
              className={`preroll-video-placeholder ${
                videoFailed ? "failed" : ""
              }`}
              role={videoFailed ? "alert" : undefined}
            >
              {videoRunning ? (
                <LoaderCircle className="spin" size={22} />
              ) : (
                <Film size={24} />
              )}
              <span>
                {videoRunning
                  ? "AI 前贴视频生成中"
                  : videoFailed
                    ? videoJob?.error || "本轮视频生成失败，请检查后重试。"
                    : "生成后在此预览"}
              </span>
            </div>
          )}
        </section>
      </div>

      <footer className="preroll-studio-footer">
        <div className="preroll-generation-settings">
          <label>
            <span>视频模型</span>
            <select
              value={settings.videoModel}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  videoModel:
                    event.target.value as ProductionConfig["videoModel"],
                }))
              }
            >
              {videoModelOptions(settings.videoModel).map((model) => (
                <option value={model} key={model}>
                  {videoModelLabels[model]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>总时长</span>
            <input
              type="number"
              min={4}
              max={300}
              value={settings.targetDuration}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  targetDuration: Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            <span>分辨率</span>
            <select
              value={settings.videoResolution}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  videoResolution:
                    event.target.value as ProductionConfig["videoResolution"],
                }))
              }
            >
              {videoResolutions.map((resolution) => (
                <option value={resolution} key={resolution}>
                  {resolution}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>宽高比</span>
            <select
              value={settings.videoRatio}
              onChange={(event) =>
                selectVideoRatio(
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
          </label>
          <label className="preroll-subtitle-toggle">
            <input
              type="checkbox"
              checked={settings.generateSubtitles}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  generateSubtitles: event.target.checked,
                }))
              }
            />
            <span>生成字幕</span>
          </label>
        </div>
        <div className="preroll-prompt-actions">
          <button
            className="button ghost"
            disabled={compiling || !settingsValid}
            onClick={() =>
              void onCompile(script.id, settings, selections)
            }
          >
            {compiling ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            AI 生成提示词
          </button>
          <button
            className="button primary"
            disabled={
              !plan ||
              promptInputsDirty ||
              !promptsComplete ||
              saving ||
              submitting
            }
            onClick={() => void generateVideo()}
          >
            {saving || submitting ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Play size={15} />
            )}
            生成视频
          </button>
        </div>
        <div className="preroll-footer-row">
          <small className="preroll-segment-rule">
            当前模型单段 4-
            {videoGenerationSegmentLimit(settings.videoModel)}
            秒；仅按完整镜头组合分段。
          </small>
        </div>
      </footer>
      {promptInputsDirty && (
        <div className="inline-note warning">
          {segmentLimitExceeded
            ? `当前模型单段最长 ${videoGenerationSegmentLimit(
                settings.videoModel,
              )} 秒，请重新 AI 生成提示词以按完整镜头分段。`
            : unnecessarySegmentation
              ? "当前提示词使用了旧分段规则，请重新 AI 生成提示词。"
            : "人物资产、总时长或字幕模式已变化，请重新 AI 生成提示词。"}
        </div>
      )}
      {promptJob?.status === "failed" && (
        <div className="inline-note error">
          {promptJob.error ?? "提示词生成失败"}
        </div>
      )}
      {submitError && (
        <div className="inline-note error">{submitError}</div>
      )}
    </article>
  );
}

export function PrerollPromptEditor({
  scripts,
  jobs,
  renders,
  characters,
  imageAssets,
  productionConfig,
  characterSelections,
  submittingVideoIds,
  videoSubmitErrors,
  onCharacterSelectionChange,
  onCompile,
  onSave,
  onGenerate,
  renderLatestActions,
  onLatestRenderStatusChange,
  onLatestRenderRecover,
}: {
  scripts: PipelineScript[];
  jobs: PipelineJob[];
  renders: PipelineRender[];
  characters: PipelineData["characters"];
  imageAssets: CharacterImageAsset[];
  productionConfig: ProductionConfig;
  characterSelections: Record<string, string>;
  submittingVideoIds: string[];
  videoSubmitErrors: Record<string, string>;
  onCharacterSelectionChange: (key: string, assetId: string) => void;
  onCompile: (
    scriptId: string,
    settings: PromptGenerationSettings,
    selections: PromptCharacterSelection[],
  ) => Promise<boolean>;
  onSave: (
    scriptId: string,
    segments: Array<{ index: number; submittedPrompt: string }>,
    selections: PromptCharacterSelection[],
    settings: PromptGenerationSettings,
  ) => Promise<boolean>;
  onGenerate: (scriptId: string) => void;
  renderLatestActions?: LatestRenderActions;
  onLatestRenderStatusChange?: (
    render: PipelineRender,
    status: "checking" | "available" | "expired" | "missing",
  ) => void;
  onLatestRenderRecover?: (render: PipelineRender) => void;
}) {
  const confirmedScripts = scripts
    .filter((script) => script.reviewStatus === "confirmed")
    .sort((left, right) => {
      const leftActivity = scriptActivityTime(left, renders);
      const rightActivity = scriptActivityTime(right, renders);
      if (
        leftActivity.explicitlyOpened !==
        rightActivity.explicitlyOpened
      ) {
        return rightActivity.explicitlyOpened ? 1 : -1;
      }
      return rightActivity.value.localeCompare(
        leftActivity.value,
      );
    });
  return (
    <section className="preroll-prompt-workspace">
      <div className="pipeline-section-title">
        <Sparkles size={16} />
        <strong>生视频提示词</strong>
        <span>{confirmedScripts.length} 个已确认脚本</span>
      </div>
      {confirmedScripts.length ? (
        <div className="preroll-prompt-list">
          {confirmedScripts.map((script) => (
            <PrerollPromptCard
              key={script.id}
              script={script}
              jobs={jobs}
              renders={renders}
              characters={characters}
              imageAssets={imageAssets}
              productionConfig={productionConfig}
              characterSelections={characterSelections}
              submitting={submittingVideoIds.includes(script.id)}
              submitError={videoSubmitErrors[script.id]}
              onCharacterSelectionChange={onCharacterSelectionChange}
              onCompile={onCompile}
              onSave={onSave}
              onGenerate={onGenerate}
              renderLatestActions={renderLatestActions}
              onLatestRenderStatusChange={
                onLatestRenderStatusChange
              }
              onLatestRenderRecover={onLatestRenderRecover}
            />
          ))}
        </div>
      ) : (
        <div className="stage-empty">
          请先在 AI 前贴脚本阶段确认脚本。
        </div>
      )}
    </section>
  );
}
