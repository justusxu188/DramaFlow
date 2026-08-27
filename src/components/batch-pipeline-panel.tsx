"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  LoaderCircle,
  Play,
  Save,
  Sparkles,
} from "lucide-react";
import { PipelineAnalysisStage } from "@/components/pipeline-analysis-stage";
import { PipelineCharacterWorkbench } from "@/components/pipeline-character-workbench";
import {
  PipelineNewBatchConfirmationModal,
  PipelineScriptDeleteConfirmationModal,
} from "@/components/pipeline-confirmation-modals";
import { PipelineFinalOutputsStage } from "@/components/pipeline-final-outputs-stage";
import { PipelineHighlightStage } from "@/components/pipeline-highlight-stage";
import { PipelinePrerollStage } from "@/components/pipeline-preroll-stage";
import type {
  PromptCharacterSelection,
  PromptGenerationSettings,
} from "@/components/preroll-prompt-editor";
import { PipelineProductionPlanStage } from "@/components/pipeline-production-plan-stage";
import { PipelineScriptWorkspace } from "@/components/pipeline-script-workspace";
import { PipelineStoryArcStage } from "@/components/pipeline-story-arc-stage";
import type {
  CharacterImageAsset,
  FeaturedAsset,
  PipelineData,
  PipelineJob,
} from "@/components/pipeline-workspace-types";
import { StageTaskFeedback } from "@/components/stage-task-feedback";
import { useWorkspacePolling } from "@/components/use-workspace-polling";
import {
  WorkflowStageNavigation,
  type WorkflowStageView,
} from "@/components/workflow-stage-navigation";
import {
  defaultProductionConfig,
  normalizeProductionConfig,
  type ProductionConfig,
} from "@/lib/production-config";
import { resolveStartIntent } from "@/lib/start-intent";
import {
  creativeWorkTypes,
  type CreativeWorkType,
  type ProductionWorkspaceStage,
} from "@/lib/creative-work-types";
import {
  latestPipelineJobs,
  pipelineStageJobs,
} from "@/lib/pipeline-job-status";
import { postProjectWorkflow } from "@/lib/pipeline-workflow-client";
import {
  artifactAvailabilityKey,
  isArtifactUnavailable,
  type ArtifactAvailabilityMap,
  type ArtifactAvailabilityStatus,
} from "@/lib/artifact-availability";
import {
  jobsForWorkspace,
  jobsForWorkspaceStage,
  type WorkspaceContext,
} from "@/lib/workspace-context";

const textToVideoSelection = "__text_to_video__";

function buildCharacterSelections(
  scriptId: string,
  pipeline: { scripts: Array<{ id: string; shots: Array<{ characters?: string[] }> }> } | undefined | null,
  characterSelections: Record<string, string>,
  textToVideoSelection: string,
) {
  const script = pipeline?.scripts.find((s) => s.id === scriptId);
  const names = [
    ...new Set(
      script?.shots.flatMap(
        (shot: { characters?: string[] }) => shot.characters ?? [],
      ) ?? [],
    ),
  ].filter(Boolean);
  return names.flatMap((characterName) => {
    const assetId =
      characterSelections[`${scriptId}\u0000${characterName}`] ??
      textToVideoSelection;
    return assetId
      ? [{
          scriptId,
          characterName,
          assetIds: assetId === textToVideoSelection ? [] : [assetId],
          useTextToVideo: assetId === textToVideoSelection,
        }]
      : [];
  });
}

function formatProductionVersion(createdAt?: string) {
  if (!createdAt) return "尚未创建";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "时间未记录";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}`;
}

type WorkspaceStage = ProductionWorkspaceStage;

const workspaceStages: Array<{
  id: WorkspaceStage;
  label: string;
}> = [
  { id: "plan", label: "生产设置" },
  { id: "analysis", label: "剧情理解" },
  { id: "arcs", label: "爽点故事线" },
  { id: "highlights", label: "高光剪辑" },
  { id: "scripts", label: "AI 前贴脚本" },
  { id: "prerolls", label: "AI 前贴视频" },
  { id: "outputs", label: "最终成片" },
];

const stageNames: Record<string, string> = {
  analysis: "剧情理解",
  mine_arcs: "爽点提炼",
  highlight: "高光智剪",
  transition: "开头理解",
  scripts: "AI 前贴脚本",
  preroll: "AI 前贴视频",
  compose: "合成成片",
};

function scriptDurationFromShots(
  shots: PipelineData["scripts"][number]["shots"],
) {
  const duration = shots.reduce((total, shot) => {
    const values = shot.time.match(/\d+(?:\.\d+)?/g);
    if (!values?.length) return total;
    if (values.length === 1) {
      return total + Number(values[0]);
    }
    const start = Number(values[0]);
    const end = Number(values[1]);
    return total + Math.max(0, end - start);
  }, 0);
  return Math.round(duration * 100) / 100;
}

export function BatchPipelinePanel({
  projectId,
  workType = creativeWorkTypes[0],
  executionMode,
  onExecutionModeChange,
  hasSources,
  highlightAssets = [],
  selectedAssetIds,
  selectedAssets,
  probingDurations,
}: {
  projectId: string;
  workType?: CreativeWorkType;
  executionMode?: ProductionConfig["executionMode"];
  onExecutionModeChange?: (
    mode: ProductionConfig["executionMode"],
  ) => void;
  hasSources: boolean;
  highlightAssets?: Array<{
    id: string;
    name: string;
    sourceUrl: string;
    durationMs: number | null;
    metadata: { sourceType: "user" | "mediakit" };
  }>;
  selectedAssetIds: string[];
  selectedAssets: Array<{ id: string; durationMs: number | null }>;
  probingDurations: boolean;
  sourceCount: number;
}) {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [featuredAssets, setFeaturedAssets] = useState<FeaturedAsset[]>([]);
  const [curatingArtifactId, setCuratingArtifactId] = useState("");
  const [artifactAvailability, setArtifactAvailability] =
    useState<ArtifactAvailabilityMap>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [switchingRunId, setSwitchingRunId] = useState("");
  const [error, setError] = useState("");
  const [productionConfig, setProductionConfig] = useState<ProductionConfig>(
    defaultProductionConfig,
  );
  const prerollType =
    productionConfig.prerollTypes[0] ?? "story_extended";
  const [targetDurationInput, setTargetDurationInput] = useState("");
  const [targetCountInput, setTargetCountInput] = useState("");
  const settingsLoaded = useRef(false);
  const [selectedScriptIds, setSelectedScriptIds] = useState<string[]>([]);
  const [savingScript, setSavingScript] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<{
    scriptIds: string[];
    summary: string;
  } | null>(null);
  const [deletingScripts, setDeletingScripts] = useState(false);
  // When starting would freeze a NEW batch (selection changed since the
  // last analysis/production), we ask for explicit confirmation first so
  // the user knows old artifacts stay under their own batch.
  const [confirmNewBatch, setConfirmNewBatch] = useState(false);
  const [confirmingScripts, setConfirmingScripts] = useState(false);
  const [pendingPromptScriptId, setPendingPromptScriptId] =
    useState("");
  const [submittingVideoIds, setSubmittingVideoIds] =
    useState<string[]>([]);
  const [videoSubmitErrors, setVideoSubmitErrors] =
    useState<Record<string, string>>({});
  const [imageAssets, setImageAssets] = useState<CharacterImageAsset[]>([]);
  const [characterSelections, setCharacterSelections] = useState<
    Record<string, string>
  >({});
  const [dismissedFailedJobIds, setDismissedFailedJobIds] = useState<string[]>(
    [],
  );
  const [regeneratingHighlightId, setRegeneratingHighlightId] = useState("");
  const [activeHighlightId, setActiveHighlightId] = useState("");
  const [activeStage, setActiveStage] =
    useState<WorkspaceStage>("plan");
  const [savingPlan, setSavingPlan] = useState(false);
  const [planDirty, setPlanDirty] = useState(false);
  const [planMessage, setPlanMessage] = useState("");
  const visibleWorkspaceStages = useMemo(
    () =>
      workspaceStages.filter((stage) =>
        workType.stages.includes(stage.id),
      ),
    [workType.stages],
  );
  const selectedAssetsSignature = selectedAssetIds.join("|");
  const previousAssetsSignature = useRef("");
  const assetSelectionHydrated = useRef(false);
  const dismissedFailuresStorageKey =
    `pipeline-dismissed-failures:${projectId}`;

  useEffect(() => {
    setArtifactAvailability({});
  }, [projectId, workType.productionEntry]);

  const updateArtifactAvailability = useCallback(
    (
      artifactKey: string,
      status: ArtifactAvailabilityStatus,
    ) => {
      setArtifactAvailability((current) =>
        current[artifactKey] === status
          ? current
          : { ...current, [artifactKey]: status },
      );
    },
    [],
  );

  useEffect(() => {
    settingsLoaded.current = false;
    setActiveStage("plan");
    setProductionConfig((current) =>
      normalizeProductionConfig({
        ...current,
        productionEntry:
          workType.productionEntry ??
          defaultProductionConfig.productionEntry,
      }),
    );
  }, [workType.id, workType.productionEntry]);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(dismissedFailuresStorageKey) ?? "[]",
      ) as unknown;
      if (Array.isArray(stored)) {
        setDismissedFailedJobIds(
          stored.filter((id): id is string => typeof id === "string"),
        );
      }
    } catch {
      setDismissedFailedJobIds([]);
    }
  }, [dismissedFailuresStorageKey]);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        productionEntry:
          workType.productionEntry ??
          defaultProductionConfig.productionEntry,
      });
      const response = await fetch(`/api/projects/${projectId}/workflow?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json() as {
        data: PipelineData | null;
        jobs: PipelineJob[];
        imageAssets?: CharacterImageAsset[];
        featuredAssets?: FeaturedAsset[];
        settings?: Partial<ProductionConfig>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "流水线加载失败");
      setPipeline(payload.data ? {
        status: payload.data.status ?? "ready",
        currentRunId: payload.data.currentRunId,
        currentRunCreatedAt:
          payload.data.currentRunCreatedAt,
        runs: payload.data.runs ?? [],
        prerollType: payload.data.prerollType,
        planReviewRequired: payload.data.planReviewRequired,
        analysisSourceAssetIds: payload.data.analysisSourceAssetIds,
          analysis: payload.data.analysis
            ? {
                ...payload.data.analysis,
                sourceVideoInfo: payload.data.analysis.sourceVideoInfo ?? [],
                clips: payload.data.analysis.clips ?? [],
                highlights: payload.data.analysis.highlights ?? [],
              }
            : undefined,
        characters: payload.data.characters ?? [],
        arcs: payload.data.arcs ?? [],
        highlights: payload.data.highlights ?? [],
        scripts: payload.data.scripts ?? [],
        renders: payload.data.renders ?? [],
        compositions: payload.data.compositions ?? [],
        productionConfig: payload.data.productionConfig,
        nextProductionPlan:
          payload.data.nextProductionPlan,
        highlightRecommendation: payload.data.highlightRecommendation,
      } : null);
      setImageAssets(payload.imageAssets ?? []);
      setFeaturedAssets(payload.featuredAssets ?? []);
      setJobs(payload.jobs ?? []);
      if (!settingsLoaded.current && payload.settings) {
        const nextPlan =
          payload.data?.nextProductionPlan;
        const persistedConfig =
          nextPlan?.productionConfig ??
          payload.data?.productionConfig;
        const workflowConfig =
          persistedConfig?.productionEntry ===
          workType.productionEntry
            ? persistedConfig
            : undefined;
        const loadedConfig = normalizeProductionConfig(
            {
              ...(workflowConfig ?? payload.settings),
              productionEntry:
                workType.productionEntry ??
                defaultProductionConfig.productionEntry,
              executionMode:
                executionMode ??
                workflowConfig?.executionMode ??
                payload.settings?.executionMode,
              prerollTypes:
                workflowConfig?.prerollTypes ??
                (workflowConfig && (
                  nextPlan?.prerollType ??
                  payload.data?.prerollType
                )
                  ? [
                      nextPlan?.prerollType ??
                      payload.data!.prerollType!,
                    ]
                  : payload.settings?.prerollTypes),
            },
          );
        setProductionConfig(loadedConfig);
        onExecutionModeChange?.(
          loadedConfig.executionMode,
        );
        setTargetDurationInput(
          String(loadedConfig.highlightTargetDuration),
        );
        setTargetCountInput(
          String(loadedConfig.highlightTargetCount),
        );
        settingsLoaded.current = true;
      }
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "流水线加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId, workType]);

  const sourceDuration = useMemo(
    () =>
      selectedAssets.reduce(
        (total, asset) => total + (asset.durationMs ?? 0),
        0,
      ) / 1000,
    [selectedAssets],
  );
  const canContinueExistingAnalysis = useMemo(() => {
    const analyzed = pipeline?.analysisSourceAssetIds ?? [];
    return (
      Boolean(pipeline?.analysis) &&
      analyzed.length === selectedAssetIds.length &&
      analyzed.every((id, index) => id === selectedAssetIds[index])
    );
  }, [
    pipeline?.analysis,
    pipeline?.analysisSourceAssetIds,
    pipeline?.planReviewRequired,
    selectedAssetIds,
  ]);
  const durationReady =
    selectedAssets.length === selectedAssetIds.length &&
    selectedAssets.length > 0 &&
    selectedAssets.every((asset) => Boolean(asset.durationMs));
  const totalDurationSeconds = Math.max(1, Math.floor(sourceDuration));
  const parsedTargetDuration = Number(targetDurationInput);
  const parsedTargetCount = Number(targetCountInput);
  const hasBasicTargetDuration =
    targetDurationInput.trim() !== "" &&
    Number.isInteger(parsedTargetDuration) &&
    parsedTargetDuration >= 1 &&
    parsedTargetDuration <= totalDurationSeconds;
  const hasBasicTargetCount =
    targetCountInput.trim() !== "" &&
    Number.isInteger(parsedTargetCount) &&
    parsedTargetCount >= 1;
  const targetDurationUpperLimit = hasBasicTargetCount
    ? Math.max(1, Math.floor(totalDurationSeconds / parsedTargetCount))
    : totalDurationSeconds;
  const targetCountUpperLimit = hasBasicTargetDuration
    ? Math.max(1, Math.floor(totalDurationSeconds / parsedTargetDuration))
    : totalDurationSeconds;
  const recommendedTargetDuration = hasBasicTargetCount
    ? Math.max(1, Math.floor((totalDurationSeconds * 0.75) / parsedTargetCount))
    : null;
  const recommendedTargetCount = hasBasicTargetDuration
    ? Math.max(1, Math.ceil((totalDurationSeconds * 0.75) / parsedTargetDuration))
    : null;
  const hasValidHighlightSettings =
    durationReady &&
    hasBasicTargetDuration &&
    hasBasicTargetCount;
  const usesUploadedHighlights =
    workType.productionEntry === "uploaded_highlights";
  const usesBatchHighlights =
    workType.productionEntry === "batch_highlights";
  const workflowEntry =
    workType.productionEntry ??
    defaultProductionConfig.productionEntry;
  const workflowProductionConfig = {
    ...productionConfig,
    productionEntry: workflowEntry,
  };
  const hasSelectedHighlights =
    productionConfig.selectedHighlightAssetIds.length > 0;
  const currentRunHighlightAssetIds =
    pipeline?.highlights.flatMap((highlight) =>
      highlight.id.startsWith("highlight-upload-")
        ? [highlight.id.slice("highlight-upload-".length)]
        : [],
    ) ?? [];
  const nextHighlightSelectionDiffers =
    usesUploadedHighlights &&
    currentRunHighlightAssetIds.length > 0 &&
    (
      currentRunHighlightAssetIds.length !==
        productionConfig.selectedHighlightAssetIds.length ||
      currentRunHighlightAssetIds.some(
        (id) =>
          !productionConfig.selectedHighlightAssetIds.includes(id),
      )
    );
  const hasValidProductionInput = usesUploadedHighlights
    ? hasSelectedHighlights
    : hasSources &&
      selectedAssetIds.length > 0 &&
      hasValidHighlightSettings;
  // The current selection no longer matches the batch that was already
  // analyzed/produced, so starting will freeze a NEW batch. Uploaded-
  // highlight flows compare the picked highlights; full-chain flows fall
  // back to "analysis exists but the source selection changed".
  const selectionDiffersFromCurrentBatch = usesUploadedHighlights
    ? nextHighlightSelectionDiffers
    : Boolean(pipeline?.analysis) && !canContinueExistingAnalysis;
  const configurationDiffersFromCurrentBatch = useMemo(() => {
    if (!pipeline?.currentRunId || !pipeline.productionConfig) {
      return false;
    }
    return (
      JSON.stringify(
        normalizeProductionConfig(pipeline.productionConfig),
      ) !==
      JSON.stringify(
        normalizeProductionConfig(productionConfig),
      )
    );
  }, [
    pipeline?.currentRunId,
    pipeline?.productionConfig,
    productionConfig,
  ]);

  useEffect(() => {
    if (
      productionConfig.characterMode !==
        "drama_character" ||
      !pipeline
    ) {
      return;
    }
    setCharacterSelections((current) => {
      let next = current;
      let changed = false;
      for (const script of pipeline.scripts) {
        if (
          (script.reviewStatus ?? "draft") !==
            "confirmed"
        ) {
          continue;
        }
        const names = [
          ...new Set(
            script.shots.flatMap(
              (shot) => shot.characters ?? [],
            ),
          ),
        ].filter(Boolean);
        for (const characterName of names) {
          const key =
            `${script.id}\u0000${characterName}`;
          if (current[key]) continue;
          const savedBinding =
            script.videoPromptPlan?.referenceBindings?.find(
              (binding) =>
                binding.characterName === characterName,
            );
          if (!savedBinding) continue;
          const savedSelection =
            savedBinding.useTextToVideo ||
            !savedBinding.assetIds[0]
              ? textToVideoSelection
              : savedBinding.assetIds[0];
          if (!changed) {
            next = { ...current };
            changed = true;
          }
          next[key] = savedSelection;
        }
      }
      return next;
    });
  }, [
    pipeline,
    productionConfig.characterMode,
  ]);

  useEffect(() => {
    if (!assetSelectionHydrated.current) {
      if (!selectedAssetsSignature) return;
      assetSelectionHydrated.current = true;
      previousAssetsSignature.current =
        selectedAssetsSignature;
      return;
    }
    if (
      previousAssetsSignature.current !==
      selectedAssetsSignature
    ) {
      previousAssetsSignature.current =
        selectedAssetsSignature;
      setPlanDirty(true);
      setPlanMessage("");
    }
  }, [selectedAssetsSignature]);

  useEffect(() => {
    if (!pendingPromptScriptId || activeStage !== "prerolls") {
      return;
    }
    const script = pipeline?.scripts.find(
      (item) => item.id === pendingPromptScriptId,
    );
    if (!script) return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(
        `video-prompt-${pendingPromptScriptId}`,
      );
      if (typeof target?.scrollIntoView === "function") {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
      setPendingPromptScriptId("");
    });
  }, [activeStage, pendingPromptScriptId, pipeline?.scripts]);

  const highlightIdsSignature =
    pipeline?.highlights.map((highlight) => highlight.id).join("|") ?? "";
  const activeHighlight =
    pipeline?.highlights.find(
      (highlight) => highlight.id === activeHighlightId,
    ) ?? pipeline?.highlights[0];
  const resolvedActiveHighlightId = activeHighlight?.id ?? "";
  const activeHighlightScripts =
    pipeline?.scripts.filter(
      (script) => script.highlightId === resolvedActiveHighlightId,
    ) ?? [];
  const activeScriptIdsSignature = activeHighlightScripts
    .map((script) => script.id)
    .join("|");

  useEffect(() => {
    const highlightIds = highlightIdsSignature
      ? highlightIdsSignature.split("|")
      : [];
    setActiveHighlightId((current) =>
      current && highlightIds.includes(current)
        ? current
        : highlightIds[0] ?? "",
    );
  }, [highlightIdsSignature]);

  useEffect(() => {
    const activeScriptIds = new Set(
      activeScriptIdsSignature
        ? activeScriptIdsSignature.split("|")
        : [],
    );
    setSelectedScriptIds((current) => {
      const next = current.filter((id) => activeScriptIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [resolvedActiveHighlightId, activeScriptIdsSignature]);

  const workspaceContext: WorkspaceContext = {
    projectId,
    workflowId: workType.id,
    productionEntry: workType.productionEntry,
    runId: pipeline?.currentRunId,
    stageId: activeStage,
  };
  const currentJobs = jobsForWorkspace(jobs, workspaceContext);
  const effectiveCurrentJobs = latestPipelineJobs(currentJobs);
  const latestTransitionJobByHighlight = new Map<string, PipelineJob>();
  effectiveCurrentJobs
    .filter((job) => job.kind === "transition")
    .forEach((job) => {
      const highlightId =
        typeof job.input?.highlightId === "string"
          ? job.input.highlightId
          : "";
      if (!highlightId) return;
      const current = latestTransitionJobByHighlight.get(highlightId);
      const currentTime =
        current?.updatedAt ?? current?.createdAt ?? "";
      const candidateTime =
        job.updatedAt ?? job.createdAt ?? "";
      if (!current || candidateTime >= currentTime) {
        latestTransitionJobByHighlight.set(highlightId, job);
      }
    });
  const activeJobs = effectiveCurrentJobs.filter((job) =>
    ["queued", "running"].includes(job.status),
  );
  useWorkspacePolling({
    refresh,
    hasRunningJobs: activeJobs.length > 0,
  });
  const activeAnalysis = activeJobs.find((job) => job.kind === "analysis");
  const draftScripts = pipeline?.scripts.filter(
    (script) => (script.reviewStatus ?? "draft") === "draft",
  ) ?? [];
  const scriptCount = pipeline?.scripts.length ?? 0;
  const confirmedScriptCount = pipeline?.scripts.filter(
    (script) => script.reviewStatus === "confirmed",
  ).length ?? 0;
  const latestPrerollJobByScript = new Map<string, PipelineJob>();
  pipelineStageJobs(currentJobs, "prerolls")
    .forEach((job) => {
      const scriptId =
        typeof job.input?.scriptId === "string"
          ? job.input.scriptId
          : "";
      if (!scriptId) return;
      const current = latestPrerollJobByScript.get(scriptId);
      const currentTime =
        current?.updatedAt ?? current?.createdAt ?? "";
      const candidateTime =
        job.updatedAt ?? job.createdAt ?? "";
      if (!current || candidateTime >= currentTime) {
        latestPrerollJobByScript.set(scriptId, job);
      }
    });
  const failedPrerollScriptIds = new Set(
    [...latestPrerollJobByScript.entries()]
      .filter(([, job]) => job.status === "failed")
      .map(([scriptId]) => scriptId),
  );
  const completedPrerollRenders =
    pipeline?.renders.filter(
      (render) =>
        render.status === "completed" &&
        Boolean(render.videoUrl) &&
        !failedPrerollScriptIds.has(render.scriptId),
    ) ?? [];
  const unavailablePrerollCount =
    completedPrerollRenders.filter((render) =>
      isArtifactUnavailable(
        artifactAvailability[
          artifactAvailabilityKey("preroll", render.id)
        ],
      ),
    ).length;
  const generatedPrerollCount =
    completedPrerollRenders.length -
    unavailablePrerollCount;
  const failedPrerollCount = failedPrerollScriptIds.size;
  const highlightArtifactKeys =
    pipeline?.highlights.flatMap((highlight) =>
      (highlight.result?.videoUrls ?? []).map(
        (_, index) =>
          artifactAvailabilityKey(
            "highlight",
            highlight.id,
            index,
          ),
      ),
    ) ?? [];
  const unavailableHighlightCount =
    highlightArtifactKeys.filter((key) =>
      isArtifactUnavailable(
        artifactAvailability[key],
      ),
    ).length;
  const finalArtifactKeys =
    pipeline?.compositions
      .filter((item) => item.videoUrl)
      .map((item) =>
        artifactAvailabilityKey("final", item.id),
      ) ?? [];
  const unavailableFinalCount =
    finalArtifactKeys.filter((key) =>
      isArtifactUnavailable(
        artifactAvailability[key],
      ),
    ).length;
  const activeLatestTransitionJob = resolvedActiveHighlightId
    ? latestTransitionJobByHighlight.get(resolvedActiveHighlightId)
    : undefined;
  const stageStatus = (stage: WorkspaceStage) => {
    if (stage === "plan") {
      const hasSavedPlan =
        Boolean(pipeline?.productionConfig);
      return {
        state:
          planDirty
            ? "attention"
            : "completed",
        label: planDirty
          ? "未保存"
          : hasSavedPlan
            ? "已保存"
            : "默认方案",
      };
    }
    if (stage === "scripts") {
      const runningCount = pipelineStageJobs(
        currentJobs,
        "scripts",
      ).filter(
        (job) => ["queued", "running"].includes(job.status),
      ).length;
      const failedCount = pipelineStageJobs(
        currentJobs,
        "scripts",
      ).filter(
        (job) => job.status === "failed",
      );
      return {
        state: runningCount
          ? "running"
          : failedCount.length
            ? "failed"
          : draftScripts.length
            ? "attention"
            : scriptCount
              ? "completed"
              : "waiting",
        label:
          `总数${scriptCount} · 已确认${confirmedScriptCount}` +
          ` · 运行中${runningCount}` +
          (failedCount.length ? ` · 失败${failedCount.length}` : ""),
      };
    }
    if (stage === "prerolls") {
      const runningCount = pipelineStageJobs(
        currentJobs,
        "prerolls",
      ).filter(
        (job) => ["queued", "running"].includes(job.status),
      ).length;
      const allConfirmedPrerollsReady =
        confirmedScriptCount > 0 &&
        generatedPrerollCount >= confirmedScriptCount;
      return {
        state: runningCount
          ? "running"
          : failedPrerollCount
            ? "failed"
            : unavailablePrerollCount
              ? "attention"
            : allConfirmedPrerollsReady
              ? "completed"
              : generatedPrerollCount
                ? "attention"
                : "waiting",
        label:
          `已生成${generatedPrerollCount}` +
          ` · 运行中${runningCount}` +
          ` · 失败${failedPrerollCount}` +
          (unavailablePrerollCount
            ? ` · 失效${unavailablePrerollCount}`
            : ""),
      };
    }
    const kinds: Record<
      "analysis" | "arcs" | "highlights" | "outputs",
      string[]
    > = {
      analysis: ["analysis"],
      arcs: ["mine_arcs"],
      highlights: ["highlight"],
      outputs: ["compose"],
    };
    const related = effectiveCurrentJobs.filter((job) =>
      kinds[stage].includes(job.kind),
    );
    const runningCount = related.filter((job) =>
      ["queued", "running"].includes(job.status),
    ).length;
    if (
      runningCount
    ) {
      return {
        state: "running",
        label: `运行中 ${runningCount}`,
      };
    }
    if (related.some((job) => job.status === "failed")) {
      return { state: "failed", label: "失败" };
    }
    const unavailableArtifactCount =
      stage === "highlights"
        ? unavailableHighlightCount
        : stage === "outputs"
          ? unavailableFinalCount
          : 0;
    if (unavailableArtifactCount) {
      return {
        state: "attention",
        label: `失效 ${unavailableArtifactCount}`,
      };
    }
    const hasArtifact =
      stage === "analysis"
        ? Boolean(pipeline?.analysis)
        : stage === "arcs"
          ? Boolean(pipeline?.arcs.length)
          : stage === "highlights"
            ? Boolean(pipeline?.highlights.length)
            : Boolean(
                pipeline?.compositions.some(
                  (item) => item.videoUrl,
                ),
              );
    if (
      hasArtifact ||
      related.some((job) => job.status === "completed")
    ) {
      return {
        state: "completed",
        label: "已完成",
      };
    }
    return { state: "waiting", label: "等待" };
  };
  // Single source of truth for what the start button says and does, so the
  // label, the POSTed action, and the "new batch" confirmation never drift.
  const startIntent = resolveStartIntent({
    usesUploadedHighlights,
    usesBatchHighlights,
    activeJobs: activeJobs.length > 0,
    activeAnalysis: Boolean(activeAnalysis),
    durationsPending: probingDurations || !durationReady,
    hasExistingAnalysis: Boolean(pipeline?.analysis),
    canContinueExistingAnalysis,
    selectionDiffersFromCurrentBatch,
    configurationDiffersFromCurrentBatch,
  });

  async function start() {
    if (!hasValidProductionInput) {
      setError(
        usesUploadedHighlights
          ? "请至少选择一个已有高光视频"
          : "请选择源视频并填写有效的目标时长和输出视频数",
      );
      return;
    }
    setStarting(true);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: startIntent.action ?? "run_full",
          sourceAssetIds: usesUploadedHighlights
            ? undefined
            : selectedAssetIds,
          prerollType,
          workflowEntry,
          productionConfig: workflowProductionConfig,
        },
        "启动失败",
      );
      setPlanDirty(false);
      setPlanMessage(
        usesBatchHighlights
          ? "批量高光剪辑已启动，完成后将自动保存到素材库。"
          : "生产设置已保存并用于本次生产。",
      );
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "启动失败");
    } finally {
      setStarting(false);
    }
  }

  async function switchProductionRun(runId: string) {
    if (
      !runId ||
      runId === pipeline?.currentRunId ||
      switchingRunId
    ) {
      return;
    }
    setSwitchingRunId(runId);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "activate_run",
          runId,
          workflowEntry,
        },
        "切换生产批次失败",
      );
      settingsLoaded.current = false;
      setPlanDirty(false);
      setPlanMessage("");
      setSelectedScriptIds([]);
      setActiveHighlightId("");
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "切换生产批次失败",
      );
    } finally {
      setSwitchingRunId("");
    }
  }

  // Gate the raw start() behind an explicit confirmation when it would
  // freeze a new batch, then run it once the user confirms.
  function handleStartClick() {
    if (startIntent.needsConfirm) {
      setConfirmNewBatch(true);
      return;
    }
    void start();
  }

  async function confirmStartNewBatch() {
    setConfirmNewBatch(false);
    await start();
  }

  async function retry(jobId: string) {
    await fetch(`/api/projects/${projectId}/workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", jobId }),
    });
    await refresh();
  }

  async function toggleFeaturedArtifact(
    artifactType: "highlight" | "preroll" | "final",
    artifactId: string,
    artifactIndex?: number,
  ) {
    const sourceArtifactId =
      artifactType === "highlight"
        ? `${artifactId}:${artifactIndex ?? 0}`
        : artifactId;
    const current = featuredAssets.find(
      (asset) =>
        asset.sourceArtifactId === sourceArtifactId,
    );
    if (!pipeline?.currentRunId) {
      setError("当前生产版本不存在，无法设置精选");
      return;
    }
    setCuratingArtifactId(sourceArtifactId);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/assets`,
        current
          ? {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                assetId: current.id,
                assetType: current.kind,
              }),
            }
          : {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "curate_pipeline_video",
                runId: pipeline.currentRunId,
                artifactType,
                artifactId,
                artifactIndex,
              }),
            },
      );
      const payload =
        await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "精选状态更新失败",
        );
      }
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "精选状态更新失败",
      );
    } finally {
      setCuratingArtifactId("");
    }
  }

  async function reanalyzeProject() {
    if (!selectedAssetIds.length || starting) return;
    setStarting(true);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "analyze_only",
          sourceAssetIds: selectedAssetIds,
          prerollType,
          workflowEntry,
          productionConfig: workflowProductionConfig,
        },
        "重新理解任务提交失败",
      );
      setPlanMessage(
        "已提交重新理解，完成后将更新项目共享的剧情理解和爽点故事线。",
      );
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "重新理解任务提交失败",
      );
    } finally {
      setStarting(false);
    }
  }

  function failedJobForStage(
    stage: WorkspaceStage,
  ) {
    return jobsForWorkspaceStage(
      currentJobs,
      workspaceContext,
      stage,
    )
      .filter(
        (job) => job.status === "failed",
      )
      .sort((left, right) =>
        String(right.updatedAt ?? "").localeCompare(
          String(left.updatedAt ?? ""),
        ),
      )[0];
  }

  function updateConfig<K extends keyof ProductionConfig>(
    key: K,
    value: ProductionConfig[K],
  ) {
    setProductionConfig((current) => ({ ...current, [key]: value }));
    if (key === "executionMode") {
      onExecutionModeChange?.(
        value as ProductionConfig["executionMode"],
      );
    }
    setPlanDirty(true);
    setPlanMessage("");
  }

  function patchConfig(patch: Partial<ProductionConfig>) {
    setProductionConfig((current) => ({
      ...current,
      ...patch,
    }));
    setPlanDirty(true);
    setPlanMessage("");
  }

  function updateTargetDurationInput(rawValue: string) {
    setTargetDurationInput(rawValue);
    setPlanDirty(true);
    setPlanMessage("");
    const value = Number(rawValue);
    if (rawValue && Number.isInteger(value) && value >= 1) {
      setProductionConfig((current) => ({
        ...current,
        highlightTargetMode: "duration",
        highlightTargetDuration: value,
      }));
    }
  }

  function updateTargetCountInput(rawValue: string) {
    setTargetCountInput(rawValue);
    setPlanDirty(true);
    setPlanMessage("");
    const value = Number(rawValue);
    if (rawValue && Number.isInteger(value) && value >= 1) {
      setProductionConfig((current) => ({
        ...current,
        highlightTargetCount: value,
      }));
    }
  }

  useEffect(() => {
    if (
      executionMode &&
      executionMode !== productionConfig.executionMode
    ) {
      updateConfig("executionMode", executionMode);
    }
  }, [executionMode]);

  async function savePlan() {
    setSavingPlan(true);
    setError("");
    setPlanMessage("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "save_production_plan",
          sourceAssetIds: usesUploadedHighlights
            ? []
            : selectedAssetIds,
          prerollType,
          workflowEntry,
          productionConfig: workflowProductionConfig,
        },
        "生产设置保存失败",
      );
      setPlanDirty(false);
      setPlanMessage("生产设置已保存，后续生成将读取这组设置。");
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "生产设置保存失败",
      );
    } finally {
      setSavingPlan(false);
    }
  }

  async function saveScript(
    script: PipelineData["scripts"][number],
  ) {
    const duration = scriptDurationFromShots(
      script.shots,
    );
    const voiceover = script.shots
      .map((shot) => shot.voiceover?.trim())
      .filter(Boolean)
      .join(" ");
    setSavingScript(true);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "update_script",
          scriptId: script.id,
          workflowEntry,
          script: {
            title: script.title,
            duration,
            hookTitleCard: script.hookTitleCard,
            voiceover,
            transition: script.transition,
            shots: script.shots,
          },
        },
        "脚本保存失败",
      );
      await refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "脚本保存失败");
      return false;
    } finally {
      setSavingScript(false);
    }
  }

  function openPrerollScript(scriptId: string) {
    const openedAt = new Date().toISOString();
    setPipeline((current) =>
      current
        ? {
            ...current,
            scripts: current.scripts.map((script) =>
              script.id === scriptId
                ? { ...script, prerollOpenedAt: openedAt }
                : script,
            ),
          }
        : current,
    );
    setPendingPromptScriptId(scriptId);
    setActiveStage("prerolls");
    void (async () => {
      try {
        await postProjectWorkflow(
          projectId,
          {
            action: "open_preroll_script",
            scriptId,
            workflowEntry,
          },
          "记录 AI 前贴视频访问时间失败",
        );
        await refresh();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "记录 AI 前贴视频访问时间失败",
        );
      }
    })();
  }

  async function confirmScriptsByIds(scriptIds: string[]) {
    if (!scriptIds.length) return;
    if (scriptIds.length === 1) {
      setPendingPromptScriptId(scriptIds[0]);
    }
    setConfirmingScripts(true);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "confirm_scripts",
          scriptIds,
          workflowEntry,
        },
        "脚本确认失败",
      );
      setSelectedScriptIds([]);
      await refresh();
    } catch (reason) {
      setPendingPromptScriptId("");
      setError(reason instanceof Error ? reason.message : "脚本确认失败");
    } finally {
      setConfirmingScripts(false);
    }
  }

  async function compileVideoPrompt(
    scriptId: string,
    settings: PromptGenerationSettings,
    selections: PromptCharacterSelection[],
  ) {
    setPendingPromptScriptId(scriptId);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "compile_video_prompts",
          scriptIds: [scriptId],
          workflowEntry,
          characterSelections: selections,
          generationSettings: [{
            scriptId,
            ...settings,
          }],
        },
        "生视频提示词生成失败",
      );
      await refresh();
      return true;
    } catch (reason) {
      setPendingPromptScriptId("");
      setError(
        reason instanceof Error
          ? reason.message
          : "生视频提示词生成失败",
      );
      return false;
    }
  }

  async function confirmSelectedScripts() {
    const draftIds = activeHighlightScripts
      .filter(
        (script) =>
          selectedScriptIds.includes(script.id) &&
          (script.reviewStatus ?? "draft") === "draft",
      )
      .map((script) => script.id);
    if (!draftIds.length) return;
    setConfirmingScripts(true);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "confirm_scripts",
          scriptIds: draftIds,
          workflowEntry,
        },
        "脚本确认失败",
      );
      setSelectedScriptIds([]);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "脚本确认失败",
      );
    } finally {
      setConfirmingScripts(false);
    }
  }

  async function saveVideoPrompt(
    scriptId: string,
    segments: Array<{
      index: number;
      submittedPrompt: string;
    }>,
    selections: PromptCharacterSelection[],
    generationSettings: PromptGenerationSettings,
  ) {
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "update_video_prompt",
          scriptId,
          workflowEntry,
          segments,
          characterSelections: selections,
          generationSettings,
        },
        "生视频提示词保存失败",
      );
      await refresh();
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "生视频提示词保存失败",
      );
      return false;
    }
  }

  async function generatePrerolls(scriptIds: string[]) {
    const uniqueIds = [...new Set(scriptIds)];
    if (!uniqueIds.length) return;
    const requestCharacterSelections = uniqueIds.flatMap((scriptId) =>
      buildCharacterSelections(
        scriptId,
        pipeline,
        characterSelections,
        textToVideoSelection,
      ),
    );
    setSubmittingVideoIds((current) => [
      ...new Set([...current, ...uniqueIds]),
    ]);
    setError("");
    setVideoSubmitErrors((current) => {
      const next = { ...current };
      for (const id of uniqueIds) delete next[id];
      return next;
    });
    try {
      const payload = await postProjectWorkflow<{
        error?: string;
        jobs?: PipelineJob[];
      }>(
        projectId,
        {
          action: "generate_prerolls",
          scriptIds: uniqueIds,
          workflowEntry,
          ...(requestCharacterSelections.length
            ? {
                characterSelections:
                  requestCharacterSelections,
              }
            : {}),
        },
        "视频生成任务提交失败",
      );
      if (payload.jobs?.length) {
        const createdIds = new Set(
          payload.jobs.map((job) => job.id),
        );
        setJobs((current) => [
          ...payload.jobs!,
          ...current.filter(
            (job) => !createdIds.has(job.id),
          ),
        ]);
      }
      await refresh();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "视频生成任务提交失败";
      setError(message);
      setVideoSubmitErrors((current) => ({
        ...current,
        ...Object.fromEntries(
          uniqueIds.map((id) => [id, message]),
        ),
      }));
    } finally {
      setSubmittingVideoIds((current) =>
        current.filter(
          (scriptId) => !uniqueIds.includes(scriptId),
        ),
      );
    }
  }

  async function saveCharacters(
    characters: PipelineData["characters"],
  ): Promise<PipelineData["characters"] | null> {
    setError("");
    try {
      const payload = await postProjectWorkflow<{
        data?: PipelineData["characters"];
        imageAssets?: CharacterImageAsset[];
        error?: string;
      }>(
        projectId,
        {
          action: "save_character_bindings",
          characters,
        },
        "人物绑定保存失败",
      );
      if (!payload.data) {
        throw new Error("人物绑定保存失败");
      }
      setImageAssets(payload.imageAssets ?? imageAssets);
      setPipeline((current) =>
        current
          ? { ...current, characters: payload.data! }
          : current,
      );
      return payload.data;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "人物绑定保存失败",
      );
      return null;
    }
  }

  function dismissFailedJob(job: PipelineJob) {
    const token = `${job.id}:${job.updatedAt}`;
    setDismissedFailedJobIds((current) => {
      const next = [...new Set([...current, token])];
      try {
        window.localStorage.setItem(
          dismissedFailuresStorageKey,
          JSON.stringify(next),
        );
      } catch {
        // The in-memory state still hides the message for this page session.
      }
      return next;
    });
  }

  function requestScriptDeletion(
    scriptIds: string[],
    summary: string,
  ) {
    const uniqueIds = [...new Set(scriptIds)];
    if (!uniqueIds.length) return;
    setDeleteRequest({ scriptIds: uniqueIds, summary });
  }

  async function deleteRequestedScripts() {
    if (!deleteRequest?.scriptIds.length) return;
    setDeletingScripts(true);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "delete_scripts",
          scriptIds: deleteRequest.scriptIds,
          workflowEntry,
        },
        "脚本删除失败",
      );
      setSelectedScriptIds((current) =>
        current.filter(
          (id) => !deleteRequest.scriptIds.includes(id),
        ),
      );
      setDeleteRequest(null);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "脚本删除失败",
      );
    } finally {
      setDeletingScripts(false);
    }
  }

  async function regenerateScripts(highlightId: string) {
    setRegeneratingHighlightId(highlightId);
    setError("");
    try {
      await postProjectWorkflow(
        projectId,
        {
          action: "regenerate_scripts",
          highlightId,
          prerollType,
          workflowEntry,
          productionConfig: workflowProductionConfig,
        },
        "脚本重新生成失败",
      );
      setPlanDirty(false);
      setPlanMessage(
        "已按当前页面的生产设置重新生成脚本。",
      );
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "脚本重新生成失败");
    } finally {
      setRegeneratingHighlightId("");
    }
  }

  async function generateOrRetryScripts() {
    if (!activeHighlight) return;
    if (!activeHighlight.anchor) {
      if (activeLatestTransitionJob?.status === "failed") {
        setRegeneratingHighlightId(activeHighlight.id);
        setError("");
        try {
          await retry(activeLatestTransitionJob.id);
        } finally {
          setRegeneratingHighlightId("");
        }
      }
      return;
    }
    await regenerateScripts(activeHighlight.id);
  }

  const activeStageLabel =
    workspaceStages.find((stage) => stage.id === activeStage)?.label ??
    "生产阶段";
  const productionVersionLabel = formatProductionVersion(
    pipeline?.currentRunCreatedAt,
  );
  const currentStageFailedJob = failedJobForStage(activeStage);
  const currentFailureDismissed = currentStageFailedJob
    ? dismissedFailedJobIds.includes(
        `${currentStageFailedJob.id}:${currentStageFailedJob.updatedAt}`,
      )
    : false;
  const stageViews: WorkflowStageView[] = visibleWorkspaceStages.map(
    (stage) => {
      const status = stageStatus(stage.id);
      return {
        id: stage.id,
        label: stage.label,
        state: status.state as WorkflowStageView["state"],
        statusLabel: status.label,
      };
    },
  );

  if (loading) {
    return <section className="batch-pipeline loading"><LoaderCircle className="spin" /> 正在读取真实流水线</section>;
  }

  return (
    <section className="batch-pipeline" aria-label="批量素材生产流水线">
      <div
        className="pipeline-status-panel"
        role="region"
        aria-label="生产进度与阶段"
      >
        <div className="batch-heading">
          <div>
            <h2>{workType.label}</h2>
            <small>{workType.shortDescription}</small>
          </div>
          <div className="pipeline-heading-meta">
            <div className="pipeline-heading-actions">
              {activeStage === "plan" && (
                <>
                {planMessage && (
                  <span className="pipeline-plan-message" role="status" title={planMessage}>
                    {planMessage}
                  </span>
                )}
                <button
                  type="button"
                  className="button ghost"
                  disabled={savingPlan}
                  onClick={() => void savePlan()}
                >
                  {savingPlan ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Save size={16} />
                  )}
                  {savingPlan
                    ? "保存中"
                    : planDirty
                      ? "保存生产设置"
                      : pipeline?.productionConfig
                        ? "重新保存设置"
                        : "保存默认设置"}
                </button>
                </>
              )}
              <button
                type="button"
                className="button primary"
                data-intent={startIntent.label}
                disabled={
                  !hasValidProductionInput ||
                  starting ||
                  activeJobs.length > 0
                }
                onClick={handleStartClick}
              >
                {starting ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Play size={16} />
                )}
                {startIntent.label}
              </button>
            </div>
            <label className="production-version-summary">
              <span>生产版本</span>
              <select
                aria-label="切换生产批次"
                value={pipeline?.currentRunId ?? ""}
                disabled={
                  Boolean(switchingRunId) ||
                  (pipeline?.runs?.length ?? 0) <= 1
                }
                onChange={(event) =>
                  void switchProductionRun(event.target.value)
                }
              >
                {!pipeline?.currentRunId && (
                  <option value="">尚未创建</option>
                )}
                {pipeline?.currentRunId &&
                  (pipeline.runs?.length ?? 0) === 0 && (
                    <option value={pipeline.currentRunId}>
                      {productionVersionLabel}
                    </option>
                  )}
                {(pipeline?.runs ?? []).map((run) => (
                  <option key={run.id} value={run.id}>
                    {formatProductionVersion(run.createdAt)}
                    {" · "}
                    {run.id.slice(-6)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <WorkflowStageNavigation
          stages={stageViews}
          activeStage={activeStage}
          onSelect={setActiveStage}
        />
      </div>

      <StageTaskFeedback
        stageLabel={activeStageLabel}
        error={
          activeStage === "scripts" || currentFailureDismissed
            ? undefined
            : currentStageFailedJob?.error
        }
        onRetry={() => {
          if (currentStageFailedJob) {
            void retry(currentStageFailedJob.id);
          }
        }}
        onDismiss={() => {
          if (currentStageFailedJob) {
            dismissFailedJob(currentStageFailedJob);
          }
        }}
      />

      {activeStage === "plan" && (
        <PipelineProductionPlanStage
          productionConfig={productionConfig}
          highlightAssets={highlightAssets}
          hasSources={hasSources}
          selectedAssetIds={selectedAssetIds}
          usesUploadedHighlights={usesUploadedHighlights}
          usesBatchHighlights={usesBatchHighlights}
          durationReady={durationReady}
          totalDurationSeconds={totalDurationSeconds}
          targetDurationInput={targetDurationInput}
          targetCountInput={targetCountInput}
          hasBasicTargetDuration={hasBasicTargetDuration}
          hasBasicTargetCount={hasBasicTargetCount}
          recommendedTargetDuration={recommendedTargetDuration}
          recommendedTargetCount={recommendedTargetCount}
          targetDurationUpperLimit={targetDurationUpperLimit}
          targetCountUpperLimit={targetCountUpperLimit}
          onConfigChange={updateConfig}
          onConfigPatch={patchConfig}
          onTargetDurationInputChange={updateTargetDurationInput}
          onTargetCountInputChange={updateTargetCountInput}
        />
      )}
      {error && <div className="pipeline-callout error"><AlertCircle size={16} /> {error}</div>}

      {activeStage === "analysis" && pipeline?.analysis && (
        <PipelineAnalysisStage
          analysis={pipeline.analysis}
          sourceUnitLabel={
            usesUploadedHighlights && !hasSources ? " 个高光视频" : " 集"
          }
          reanalyzeDisabled={
            starting ||
            activeJobs.length > 0 ||
            selectedAssetIds.length === 0
          }
          onReanalyze={reanalyzeProject}
          characterWorkbench={
            <PipelineCharacterWorkbench
              characters={pipeline.characters}
              sourceVideoInfo={pipeline.analysis.sourceVideoInfo}
              onSave={saveCharacters}
            />
          }
        />
      )}

      {activeStage === "arcs" && (
        <PipelineStoryArcStage arcs={pipeline?.arcs ?? []} />
      )}

      {activeStage === "highlights" && (
        <PipelineHighlightStage
          arcs={pipeline?.arcs ?? []}
          highlights={pipeline?.highlights ?? []}
          highlightAssets={highlightAssets}
          featuredAssets={featuredAssets}
          curatingArtifactId={curatingArtifactId}
          onToggleFeatured={toggleFeaturedArtifact}
          availability={artifactAvailability}
          onAvailabilityChange={
            updateArtifactAvailability
          }
          onRecover={() => {
            setActiveStage("plan");
            setPlanMessage(
              "历史高光视频已失效，请确认生产设置后开始新的生产版本。",
            );
          }}
        />
      )}

      {activeStage === "scripts" && pipeline?.highlights?.length ? (
        <PipelineScriptWorkspace
          pipeline={pipeline}
          highlightAssets={highlightAssets}
          currentJobs={currentJobs}
          effectiveCurrentJobs={effectiveCurrentJobs}
          productionConfig={productionConfig}
          activeHighlightId={resolvedActiveHighlightId}
          selectedScriptIds={selectedScriptIds}
          confirmingScripts={confirmingScripts}
          regeneratingHighlightId={regeneratingHighlightId}
          savingScript={savingScript}
          onActiveHighlightChange={(highlightId) => {
            setActiveHighlightId(highlightId);
            setSelectedScriptIds([]);
          }}
          onSelectedScriptIdsChange={setSelectedScriptIds}
          onRequestScriptDeletion={requestScriptDeletion}
          onGenerateOrRetryScripts={() => void generateOrRetryScripts()}
          onConfirmSelectedScripts={() => void confirmSelectedScripts()}
          onConfirmScript={(scriptId) =>
            void confirmScriptsByIds([scriptId])
          }
          onGoToPrerolls={openPrerollScript}
          onSaveScript={saveScript}
        />
      ) : null}

      {activeStage === "prerolls" && (
        <PipelinePrerollStage
          projectId={projectId}
          pipeline={pipeline}
          highlightAssets={highlightAssets}
          jobs={currentJobs}
          imageAssets={imageAssets}
          featuredAssets={featuredAssets}
          curatingArtifactId={curatingArtifactId}
          productionConfig={productionConfig}
          characterSelections={characterSelections}
          submittingVideoIds={submittingVideoIds}
          videoSubmitErrors={videoSubmitErrors}
          onCharacterSelectionChange={(key, assetId) =>
            setCharacterSelections((current) => ({
              ...current,
              [key]: assetId,
            }))
          }
          onCompilePrompt={compileVideoPrompt}
          onSavePrompt={saveVideoPrompt}
          onGenerate={(scriptId) =>
            void generatePrerolls([scriptId])
          }
          onToggleFeatured={(renderId) =>
            toggleFeaturedArtifact("preroll", renderId)
          }
          onChanged={refresh}
          onComposed={() => setActiveStage("outputs")}
          availability={artifactAvailability}
          onAvailabilityChange={
            updateArtifactAvailability
          }
          onRegenerate={(scriptId) =>
            void generatePrerolls([scriptId])
          }
          activeHighlightId={resolvedActiveHighlightId}
          onActiveHighlightChange={(highlightId) => {
            setActiveHighlightId(highlightId);
            setSelectedScriptIds([]);
          }}
        />
      )}

      {activeStage === "outputs" && (
        <PipelineFinalOutputsStage
          projectId={projectId}
          compositions={pipeline?.compositions ?? []}
          highlights={pipeline?.highlights ?? []}
          highlightAssets={highlightAssets}
          arcs={pipeline?.arcs ?? []}
          activeHighlightId={resolvedActiveHighlightId}
          onActiveHighlightChange={setActiveHighlightId}
          featuredAssets={featuredAssets}
          curatingArtifactId={curatingArtifactId}
          onToggleFeatured={(compositionId) =>
            void toggleFeaturedArtifact("final", compositionId)
          }
          availability={artifactAvailability}
          onAvailabilityChange={
            updateArtifactAvailability
          }
          onRecover={() =>
            setActiveStage("prerolls")
          }
          onChanged={refresh}
        />
      )}

      <PipelineNewBatchConfirmationModal
        open={confirmNewBatch}
        starting={starting}
        onClose={() => setConfirmNewBatch(false)}
        onConfirm={() => void confirmStartNewBatch()}
      />
      <PipelineScriptDeleteConfirmationModal
        request={deleteRequest}
        deleting={deletingScripts}
        onClose={() => setDeleteRequest(null)}
        onConfirm={() => void deleteRequestedScripts()}
      />

    </section>
  );
}
