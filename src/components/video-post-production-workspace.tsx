"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronDown,
  Download,
  Eraser,
  FileVideo2,
  FolderClosed,
  FolderOpen,
  Gauge,
  GripVertical,
  LoaderCircle,
  MonitorPlay,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Stamp,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { CreativeWorkType } from "@/lib/creative-work-types";
import { SubtitleStyleControls } from "@/components/subtitle-style-controls";
import type { SubtitleVerificationEvidence } from "@/lib/subtitle-video-verification";
import {
  isSubtitleBurnStyleValid,
  normalizeSubtitles,
  SUBTITLE_BURN_DEFAULTS,
  type SubtitleBurnStyle,
} from "@/lib/subtitle-post-production";
import {
  createMultiSourceTimeline,
  createTimeline,
  deleteTimelineSegment,
  splitTimelineAtPosition,
  timelineDuration,
  timelineOffsetForSegment,
  timelineSegmentAt,
  timelineTrimRequests,
  type VideoEditSegment,
} from "@/lib/video-edit-timeline";

type EditableAsset = {
  id: string;
  name: string;
  sourceUrl: string;
  durationMs: number | null;
  episodeNumber: number | null;
  assetType:
    | "source"
    | "highlight"
    | "preroll_video"
    | "final_video";
  kind?:
    | "原视频"
    | "高光剪辑"
    | "AI 前贴视频"
    | "成片视频";
};

type PostProductionProject = {
  id: string;
  name: string;
  genre: string;
  assets: EditableAsset[];
  highlightAssets: EditableAsset[];
  prerollAssets: EditableAsset[];
  finalAssets: EditableAsset[];
};

type ProjectSummary = {
  id: string;
  name: string;
  genre: string;
  sourceCount: number;
};

type SubtitleDraft = {
  id: string;
  subtitleText: string;
  startTime: number;
  endTime: number;
  speaker?: string;
};

type ProcessedClip = {
  id: string;
  name: string;
  videoUrl: string;
  duration: number;
  operation: string;
  sourceSegmentId: string;
};

type Operation =
  | "timeline"
  | "erase_subtitles"
  | "speed"
  | "subtitles"
  | "add_watermark"
  | "enhance";

type PostProductionTaskState = {
  projectId: string;
  taskId: string;
  operation: string;
  label: string;
  status: "running" | "completed" | "failed";
  progress: number;
  statusContext: Record<string, unknown>;
  videoUrl?: string;
  error?: string;
  updatedAt: string;
};

type PostProductionWorkspaceState = {
  version: 1;
  projectId: string;
  selectedAssetIds: string[];
  selectedAssetId: string;
  measuredDurations: Record<string, number>;
  activeOperation: Operation;
  duration: number;
  playhead: number;
  segments: VideoEditSegment[];
  selectedSegmentId: string;
  history: VideoEditSegment[][];
  workingUrl: string;
  outputUrl: string;
  downloadUrl?: string;
  speed: number;
  resolution: "720p" | "1080p" | "2k";
  subtitles: SubtitleDraft[];
  subtitleStyle?: SubtitleBurnStyle;
  subtitlesConfirmed: boolean;
  subtitlesApplied?: boolean;
  verifiedSubtitleUrls?: string[];
  subtitleInputClip: ProcessedClip | null;
  processedClips: ProcessedClip[];
  updatedAt: string;
};

const operations: Array<{
  id: Operation;
  label: string;
  icon: typeof Scissors;
  comingSoon?: boolean;
}> = [
  { id: "timeline", label: "裁剪与拼接", icon: Scissors },
  { id: "erase_subtitles", label: "字幕擦除", icon: Eraser },
  { id: "subtitles", label: "添加字幕", icon: Captions },
  { id: "speed", label: "音视频调速", icon: Gauge },
  { id: "enhance", label: "画质增强", icon: WandSparkles },
  { id: "add_watermark", label: "添加明水印", icon: Stamp, comingSoon: true },
];

function formatTime(value: number) {
  const safe = Math.max(0, value);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${milliseconds}`;
}

function taskStorageKey(projectId: string) {
  return `frameflow:post-production:last-task:${projectId}`;
}

function workspaceStorageKey(projectId: string) {
  return `frameflow:post-production:workspace:${projectId}`;
}

function readLastTask(projectId: string) {
  try {
    const value = window.localStorage.getItem(
      taskStorageKey(projectId),
    );
    if (!value) return null;
    const task = JSON.parse(value) as PostProductionTaskState;
    return task.projectId === projectId ? task : null;
  } catch {
    return null;
  }
}

function saveLastTask(task: PostProductionTaskState) {
  try {
    window.localStorage.setItem(
      taskStorageKey(task.projectId),
      JSON.stringify(task),
    );
  } catch {
    // Task tracking remains available in memory when storage is unavailable.
  }
}

function readWorkspace(projectId: string) {
  try {
    const value = window.localStorage.getItem(
      workspaceStorageKey(projectId),
    );
    if (!value) return null;
    const workspace =
      JSON.parse(value) as PostProductionWorkspaceState;
    return workspace.version === 1 &&
      workspace.projectId === projectId
      ? workspace
      : null;
  } catch {
    return null;
  }
}

function saveWorkspace(
  workspace: PostProductionWorkspaceState,
) {
  try {
    window.localStorage.setItem(
      workspaceStorageKey(workspace.projectId),
      JSON.stringify(workspace),
    );
  } catch {
    // The current editing session remains available in memory.
  }
}

export function VideoPostProductionWorkspace({
  projectId,
  workType,
}: {
  projectId: string;
  workType: CreativeWorkType;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const activeProjectIdRef = useRef(projectId);
  const resumedTaskRef = useRef("");
  const workspaceReadyRef = useRef(false);
  const skipTimelineResetRef = useRef(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] =
    useState(projectId);
  const [project, setProject] = useState<PostProductionProject>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [measuredDurations, setMeasuredDurations] = useState<
    Record<string, number>
  >({});
  const [activeOperation, setActiveOperation] =
    useState<Operation>("timeline");
  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [segments, setSegments] = useState<VideoEditSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [history, setHistory] = useState<VideoEditSegment[][]>([]);
  const [workingUrl, setWorkingUrl] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  // The single source of truth for "下载成片": only set by an explicit
  // export (裁剪并拼接) or a manual "设为主预览" choice, and cleared when
  // the processing scope changes. `outputUrl` still tracks the newest
  // intermediate result for preview backfill, but the download button
  // must never point at a stale intermediate clip.
  const [downloadUrl, setDownloadUrl] = useState("");
  const [speed, setSpeed] = useState(1);
  const [resolution, setResolution] =
    useState<"720p" | "1080p" | "2k">("1080p");
  const [subtitles, setSubtitles] = useState<SubtitleDraft[]>([]);
  const [subtitleStyle, setSubtitleStyle] =
    useState<SubtitleBurnStyle>(() => ({
      ...SUBTITLE_BURN_DEFAULTS,
    }));
  const [subtitlesConfirmed, setSubtitlesConfirmed] = useState(false);
  const [subtitleInputClip, setSubtitleInputClip] =
    useState<ProcessedClip | null>(null);
  // Whether a verified subtitle version has been burned AND swapped into
  // the timeline as the concat source. Mirrors the preroll gate: once
  // subtitles are recognized/confirmed, "裁剪并拼接" stays blocked until
  // this is true, so the export can never silently use the un-subtitled
  // source. Editing subtitles resets it back to false.
  const [subtitlesApplied, setSubtitlesApplied] = useState(false);
  // URLs that passed frame-level subtitle verification and now back a
  // timeline segment. Used to badge the concat source list so the
  // burned-in version is unmistakable.
  const [verifiedSubtitleUrls, setVerifiedSubtitleUrls] = useState<
    string[]
  >([]);
  const [processedClips, setProcessedClips] = useState<
    ProcessedClip[]
  >([]);
  const [previewClipId, setPreviewClipId] = useState("");
  const [processing, setProcessing] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [lastTask, setLastTask] =
    useState<PostProductionTaskState | null>(null);

  useEffect(() => {
    activeProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => response.json())
      .then((payload: { data?: ProjectSummary[] }) =>
        setProjects(payload.data ?? []),
      )
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    workspaceReadyRef.current = false;
    skipTimelineResetRef.current = false;
    void (async () => {
      try {
        setError("");
        setProject(undefined);
        setSelectedAssetId("");
        setSelectedAssetIds([]);
        setWorkingUrl("");
        setOutputUrl("");
        setDownloadUrl("");
        setDuration(0);
        setPlayhead(0);
        setSegments([]);
        setSelectedSegmentId("");
        setHistory([]);
        setSubtitles([]);
        setSubtitleStyle({ ...SUBTITLE_BURN_DEFAULTS });
        setSubtitlesConfirmed(false);
        setSubtitleInputClip(null);
        setSubtitlesApplied(false);
        setVerifiedSubtitleUrls([]);
        setProcessedClips([]);
        setProcessing("");
        setProgress(0);
        setLastTask(readLastTask(selectedProjectId));
        const response = await fetch(
          `/api/projects/${selectedProjectId}`,
        );
        const payload = (await response.json()) as {
          data?: PostProductionProject;
          error?: string;
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? "项目加载失败");
        }
        if (cancelled) return;
        setProject(payload.data);
        setMeasuredDurations({});
        const workspace = readWorkspace(selectedProjectId);
        const validAssetIds = new Set([
          ...payload.data.assets,
          ...payload.data.highlightAssets,
          ...payload.data.prerollAssets,
          ...payload.data.finalAssets,
        ].map((asset) => asset.id));
        const restoredAssetIds =
          workspace?.selectedAssetIds.filter((id) =>
            validAssetIds.has(id),
          ) ?? [];
        if (workspace && restoredAssetIds.length > 0) {
          const hasRestorableTimeline =
            workspace.segments.length > 0;
          // Always suppress the one-shot timeline-rebuild effect that
          // runs when the asset selection changes: on restore that
          // effect would wipe the subtitles / output / history we are
          // about to restore. When no timeline was saved (durations
          // were still unknown), a dedicated effect rebuilds the track
          // once durations are measured, without clearing edits.
          skipTimelineResetRef.current = true;
          const restoredSelectedAssetId = validAssetIds.has(
            workspace.selectedAssetId,
          )
            ? workspace.selectedAssetId
            : restoredAssetIds[0];
          setSelectedAssetIds(restoredAssetIds);
          setSelectedAssetId(restoredSelectedAssetId);
          setMeasuredDurations(workspace.measuredDurations);
          setActiveOperation(workspace.activeOperation);
          setSpeed(workspace.speed);
          setResolution(workspace.resolution);
          setSubtitles(workspace.subtitles);
          if (
            workspace.subtitleStyle &&
            isSubtitleBurnStyleValid(workspace.subtitleStyle)
          ) {
            setSubtitleStyle(workspace.subtitleStyle);
          }
          setSubtitlesConfirmed(
            workspace.subtitlesConfirmed,
          );
          setSubtitleInputClip(
            workspace.subtitleInputClip ?? null,
          );
          setSubtitlesApplied(
            workspace.subtitlesApplied ?? false,
          );
          setVerifiedSubtitleUrls(
            workspace.verifiedSubtitleUrls ?? [],
          );
          setProcessedClips(workspace.processedClips);
          setOutputUrl(workspace.outputUrl);
          setDownloadUrl(workspace.downloadUrl ?? "");
          if (hasRestorableTimeline) {
            setDuration(workspace.duration);
            setPlayhead(
              Math.min(workspace.playhead, workspace.duration),
            );
            setSegments(workspace.segments);
            setSelectedSegmentId(
              workspace.segments.some(
                (segment) =>
                  segment.id === workspace.selectedSegmentId,
              )
                ? workspace.selectedSegmentId
                : workspace.segments[0].id,
            );
            setHistory(workspace.history);
            setWorkingUrl(workspace.workingUrl);
          } else {
            // The timeline was empty at save time; keep a preview
            // target so the video can reload and re-measure its
            // duration, which triggers the track rebuild below.
            const activeAsset =
              [
                ...payload.data.assets,
                ...payload.data.highlightAssets,
                ...payload.data.prerollAssets,
                ...payload.data.finalAssets,
              ].find(
                (asset) => asset.id === restoredSelectedAssetId,
              );
            setWorkingUrl(
              workspace.workingUrl ||
                activeAsset?.sourceUrl ||
                "",
            );
          }
        }
        workspaceReadyRef.current = true;
      } catch (reason) {
        if (cancelled) return;
        setError(
          reason instanceof Error ? reason.message : "项目加载失败",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const assets = [
    ...(project?.highlightAssets ?? []).map((asset) => ({
      ...asset,
      assetType: "highlight" as const,
      kind: "高光剪辑" as const,
    })),
    ...(project?.assets ?? []).map((asset) => ({
      ...asset,
      assetType: "source" as const,
      kind: "原视频" as const,
    })),
    ...(project?.prerollAssets ?? []).map((asset) => ({
      ...asset,
      assetType: "preroll_video" as const,
      episodeNumber: null,
      kind: "AI 前贴视频" as const,
    })),
    ...(project?.finalAssets ?? []).map((asset) => ({
      ...asset,
      assetType: "final_video" as const,
      episodeNumber: null,
      kind: "成片视频" as const,
    })),
  ];
  const selectedAsset = assets.find(
    (asset) => asset.id === selectedAssetId,
  );
  const selectedAssets = selectedAssetIds.flatMap((assetId) => {
    const asset = assets.find((item) => item.id === assetId);
    return asset ? [asset] : [];
  });
  const selectedAssetsSignature = selectedAssets
    .map((asset) => asset.id)
    .join("|");
  const assetGroups = (
    [
      "原视频",
      "高光剪辑",
      "AI 前贴视频",
      "成片视频",
    ] as const
  ).map((kind) => ({
    kind,
    assets: assets.filter((asset) => asset.kind === kind),
  }));

  useEffect(() => {
    if (skipTimelineResetRef.current) {
      skipTimelineResetRef.current = false;
      return;
    }
    const nextSegments = createMultiSourceTimeline(
      selectedAssets.flatMap((asset) =>
        (measuredDurations[asset.id] ?? asset.durationMs)
          ? [{
              id: asset.id,
              url: asset.sourceUrl,
              name: asset.name,
              duration:
                measuredDurations[asset.id] ??
                (asset.durationMs! / 1000),
            }]
          : [],
      ),
    );
    const activeAsset =
      selectedAssets.find(
        (asset) => asset.id === selectedAssetId,
      ) ?? selectedAssets[0];
    setSelectedAssetId(activeAsset?.id ?? "");
    setWorkingUrl(activeAsset?.sourceUrl ?? "");
    setOutputUrl("");
    setDownloadUrl("");
    setPreviewClipId("");
    setSubtitles([]);
    setSubtitlesConfirmed(false);
    setSubtitleInputClip(null);
    setSubtitlesApplied(false);
    setVerifiedSubtitleUrls([]);
    setDuration(timelineDuration(nextSegments));
    setPlayhead(0);
    setSegments(nextSegments);
    setSelectedSegmentId(
      nextSegments.find(
        (segment) => segment.sourceId === activeAsset?.id,
      )?.id ??
        nextSegments[0]?.id ??
        "",
    );
    setHistory([]);
  }, [selectedAssetsSignature]);

  // Rebuild an empty track once source durations become known. This
  // recovers the timeline after a refresh where the workspace was
  // saved before any duration was measured, without discarding the
  // restored subtitles / processed clips.
  useEffect(() => {
    if (segments.length > 0 || selectedAssets.length === 0) return;
    const measurable = selectedAssets.flatMap((asset) => {
      const duration =
        measuredDurations[asset.id] ??
        (asset.durationMs != null
          ? asset.durationMs / 1000
          : null);
      return duration
        ? [{
            id: asset.id,
            url: asset.sourceUrl,
            name: asset.name,
            duration,
          }]
        : [];
    });
    if (measurable.length === 0) return;
    const nextSegments = createMultiSourceTimeline(measurable);
    const activeAsset =
      selectedAssets.find(
        (asset) => asset.id === selectedAssetId,
      ) ?? selectedAssets[0];
    setDuration(timelineDuration(nextSegments));
    setSegments(nextSegments);
    setSelectedSegmentId(
      nextSegments.find(
        (segment) => segment.sourceId === activeAsset?.id,
      )?.id ??
        nextSegments[0]?.id ??
        "",
    );
  }, [
    segments.length,
    selectedAssetsSignature,
    measuredDurations,
  ]);

  useEffect(() => {
    if (!workspaceReadyRef.current) return;
    saveWorkspace({
      version: 1,
      projectId: selectedProjectId,
      selectedAssetIds,
      selectedAssetId,
      measuredDurations,
      activeOperation,
      duration,
      playhead,
      segments,
      selectedSegmentId,
      history,
      workingUrl,
      outputUrl,
      downloadUrl,
      speed,
      resolution,
      subtitles,
      subtitleStyle,
      subtitlesConfirmed,
      subtitlesApplied,
      verifiedSubtitleUrls,
      subtitleInputClip,
      processedClips,
      updatedAt: new Date().toISOString(),
    });
  }, [
    activeOperation,
    downloadUrl,
    duration,
    history,
    measuredDurations,
    outputUrl,
    playhead,
    processedClips,
    resolution,
    segments,
    selectedAssetId,
    selectedAssetIds,
    selectedProjectId,
    selectedSegmentId,
    speed,
    subtitleInputClip,
    subtitleStyle,
    subtitles,
    subtitlesApplied,
    subtitlesConfirmed,
    verifiedSubtitleUrls,
    workingUrl,
  ]);

  useEffect(() => {
    if (!pickerOpen) return;
    function closePicker(event: Event) {
      if (
        event.target instanceof Node &&
        pickerRef.current?.contains(event.target)
      ) {
        return;
      }
      setPickerOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("pointerdown", closePicker);
    document.addEventListener("mousedown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePicker);
      document.removeEventListener("mousedown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pickerOpen]);

  function chooseProject(nextProjectId: string) {
    setPickerOpen(true);
    activeProjectIdRef.current = nextProjectId;
    setSelectedProjectId(nextProjectId);
    window.history.pushState(
      null,
      "",
      `/projects/${nextProjectId}?workType=${workType.id}`,
    );
  }

  function hasUnsavedEdits() {
    return (
      subtitles.length > 0 ||
      history.length > 0 ||
      Boolean(outputUrl)
    );
  }

  // Changing the processing scope rebuilds the track and clears
  // subtitles / undo history / output. Confirm before discarding
  // those edits instead of wiping them silently.
  function confirmScopeChange() {
    if (!hasUnsavedEdits()) return true;
    return window.confirm(
      "切换处理范围会清空当前的字幕、撤销记录和已生成结果，确定继续吗？",
    );
  }

  function toggleAsset(assetId: string) {
    // Any scope change rebuilds the track and clears subtitles / undo
    // history / output, so confirm before discarding pending edits.
    if (!confirmScopeChange()) return;
    setSelectedAssetIds((current) => {
      if (current.includes(assetId)) {
        const next = current.filter((id) => id !== assetId);
        if (selectedAssetId === assetId) {
          setSelectedAssetId(next[0] ?? "");
        }
        return next;
      }
      if (!selectedAssetId) setSelectedAssetId(assetId);
      return [...current, assetId];
    });
  }

  function initializeTimeline(nextDuration: number) {
    setDuration(nextDuration);
    const next = createTimeline(
      nextDuration,
      workingUrl
        ? {
            id: "output",
            url: workingUrl,
            name: "处理结果",
          }
        : undefined,
    );
    setSegments(next);
    setSelectedSegmentId(next[0]?.id ?? "");
  }

  function updateSegments(next: VideoEditSegment[]) {
    setHistory((current) => [...current, segments]);
    setSegments(next);
    const nextDuration = timelineDuration(next);
    setDuration(nextDuration);
    setPlayhead((current) => Math.min(current, nextDuration));
    if (!next.some((segment) => segment.id === selectedSegmentId)) {
      setSelectedSegmentId(next[0]?.id ?? "");
    }
  }

  function splitAtPlayhead() {
    const next = splitTimelineAtPosition(segments, playhead);
    if (next === segments) return;
    setHistory((current) => [...current, segments]);
    setSegments(next);
    const target = timelineSegmentAt(next, playhead);
    if (!target) return;
    setSelectedSegmentId(target.segment.id);
    if (target.segment.sourceId) {
      setSelectedAssetId(target.segment.sourceId);
    }
    if (target.segment.sourceUrl) {
      setWorkingUrl(target.segment.sourceUrl);
    }
    window.requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = target.sourceTime;
      }
    });
  }

  function activateTimelinePosition(nextPlayhead: number) {
    const target = timelineSegmentAt(segments, nextPlayhead);
    if (!target) return;
    setPlayhead(nextPlayhead);
    setSelectedSegmentId(target.segment.id);
    if (target.segment.sourceId) {
      setSelectedAssetId(target.segment.sourceId);
    }
    if (
      target.segment.sourceUrl &&
      target.segment.sourceUrl !== workingUrl
    ) {
      setWorkingUrl(target.segment.sourceUrl);
    }
    window.requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = target.sourceTime;
      }
    });
  }

  function deleteSelectedSegment() {
    const next = deleteTimelineSegment(segments, selectedSegmentId);
    if (next !== segments) updateSegments(next);
  }

  function undoTimeline() {
    const previous = history.at(-1);
    if (!previous) return;
    setSegments(previous);
    const previousDuration = timelineDuration(previous);
    setDuration(previousDuration);
    setPlayhead((current) => Math.min(current, previousDuration));
    setHistory((current) => current.slice(0, -1));
    setSelectedSegmentId(previous[0]?.id ?? "");
  }

  function selectedTimelineSegment() {
    return segments.find(
      (segment) => segment.id === selectedSegmentId,
    );
  }

  async function prepareSelectedSegment(
    label = "准备选中片段",
  ): Promise<ProcessedClip> {
    const segment = selectedTimelineSegment();
    if (!segment) throw new Error("请先在轨道中选择一个片段");
    const result = await runOperation(
      "trim",
      {
        videoUrl: segment.sourceUrl ?? workingUrl,
        startTime: segment.start,
        endTime: segment.end,
      },
      label,
    );
    if (!result.videoUrl) throw new Error("选中片段裁剪失败");
    return {
      id: `processed-${crypto.randomUUID()}`,
      name: segment.sourceName ?? "选中片段",
      videoUrl: result.videoUrl,
      duration: segment.end - segment.start,
      operation: "裁剪片段",
      sourceSegmentId: segment.id,
    };
  }

  function addProcessedClipToTimeline(clip: ProcessedClip) {
    const segment: VideoEditSegment = {
      id: `segment-${clip.id}-${crypto.randomUUID()}`,
      start: 0,
      end: clip.duration,
      sourceId: clip.id,
      sourceUrl: clip.videoUrl,
      sourceName: clip.name,
    };
    const selectedIndex = segments.findIndex(
      (item) => item.id === selectedSegmentId,
    );
    const insertAt =
      selectedIndex >= 0 ? selectedIndex + 1 : segments.length;
    const next = [
      ...segments.slice(0, insertAt),
      segment,
      ...segments.slice(insertAt),
    ];
    updateSegments(next);
    setSelectedSegmentId(segment.id);
    setSelectedAssetId("");
    setWorkingUrl(clip.videoUrl);
    setPlayhead(
      timelineOffsetForSegment(next, segment.id),
    );
  }

  function addProcessedResult(
    input: ProcessedClip,
    resultUrl: string,
    label: string,
    nextDuration = input.duration,
  ) {
    const clip: ProcessedClip = {
      ...input,
      id: `processed-${crypto.randomUUID()}`,
      name: `${input.name}-${label}`,
      videoUrl: resultUrl,
      duration: nextDuration,
      operation: label,
    };
    setProcessedClips((current) => [clip, ...current]);
    setOutputUrl(resultUrl);
    // Backfill the main preview so the newest result is immediately
    // visible — otherwise the player keeps showing the input and the
    // operation looks like it had no effect.
    setPreviewClipId(clip.id);
    setWorkingUrl(resultUrl);
    return clip;
  }

  async function waitForTask(
    taskProjectId: string,
    taskId: string,
    operation: string,
    label: string,
    statusContext: Record<string, unknown> = {},
  ): Promise<{
    videoUrl?: string;
    subtitles?: SubtitleDraft[];
    derivedAsset?: EditableAsset;
    subtitleVerification?: SubtitleVerificationEvidence;
  }> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const response = await fetch(
        `/api/projects/${taskProjectId}/post-production`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "status",
            operation,
            taskId,
            ...statusContext,
          }),
        },
      );
      const payload = await response.json() as {
        data?: {
          status?: string;
          progress?: number;
          videoUrl?: string;
          subtitles?: SubtitleDraft[];
          derivedAsset?: EditableAsset;
          subtitleVerification?: SubtitleVerificationEvidence;
        };
        error?: string;
      };
      if (!response.ok && response.status !== 202) {
        throw new Error(payload.error ?? "后期处理失败");
      }
      const nextProgress = payload.data?.progress ?? 5;
      if (activeProjectIdRef.current === taskProjectId) {
        setProgress(nextProgress);
      }
      const nextTask: PostProductionTaskState = {
        projectId: taskProjectId,
        taskId,
        operation,
        label,
        status:
          payload.data?.status === "completed"
            ? "completed"
            : "running",
        progress:
          payload.data?.status === "completed"
            ? 100
            : nextProgress,
        statusContext,
        videoUrl: payload.data?.videoUrl,
        updatedAt: new Date().toISOString(),
      };
      saveLastTask(nextTask);
      if (activeProjectIdRef.current === taskProjectId) {
        setLastTask(nextTask);
      }
      if (payload.data?.status === "completed") {
        return payload.data;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("处理时间过长，请稍后重试");
  }

  useEffect(() => {
    const resumeKey = lastTask
      ? `${lastTask.projectId}:${lastTask.taskId}`
      : "";
    if (
      !lastTask ||
      lastTask.status !== "running" ||
      resumedTaskRef.current === resumeKey
    ) {
      return;
    }
    resumedTaskRef.current = resumeKey;
    setProcessing(lastTask.label);
    setProgress(lastTask.progress);
    void waitForTask(
      lastTask.projectId,
      lastTask.taskId,
      lastTask.operation,
      lastTask.label,
      lastTask.statusContext,
    )
      .catch((reason) => {
        const failedTask: PostProductionTaskState = {
          ...lastTask,
          status: "failed",
          error:
            reason instanceof Error
              ? reason.message
              : `${lastTask.label}失败`,
          updatedAt: new Date().toISOString(),
        };
        saveLastTask(failedTask);
        if (
          activeProjectIdRef.current ===
          lastTask.projectId
        ) {
          setLastTask(failedTask);
        }
      })
      .finally(() => {
        if (
          activeProjectIdRef.current ===
          lastTask.projectId
        ) {
          setProcessing("");
          setProgress(0);
        }
      });
  }, [lastTask]);

  async function runOperation(
    operation: string,
    input: Record<string, unknown>,
    label: string,
  ) {
    const taskProjectId = selectedProjectId;
    setProcessing(label);
    setProgress(2);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${selectedProjectId}/post-production`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            operation,
            ...input,
          }),
        },
      );
      const payload = await response.json() as {
        data?: { id?: string };
        error?: string;
      };
      if (!response.ok || !payload.data?.id) {
        throw new Error(payload.error ?? `${label}启动失败`);
      }
      const statusContext =
        operation === "add_subtitles"
          ? {
              ...input,
              sourceVideoUrl: input.videoUrl,
            }
          : input;
      const taskState: PostProductionTaskState = {
        projectId: taskProjectId,
        taskId: payload.data.id,
        operation,
        label,
        status: "running",
        progress: 2,
        statusContext,
        updatedAt: new Date().toISOString(),
      };
      resumedTaskRef.current =
        `${taskProjectId}:${payload.data.id}`;
      saveLastTask(taskState);
      setLastTask(taskState);
      return await waitForTask(
        taskProjectId,
        payload.data.id,
        operation,
        label,
        statusContext,
      );
    } catch (reason) {
      const current = readLastTask(taskProjectId);
      if (current?.status === "running") {
        const failedTask: PostProductionTaskState = {
          ...current,
          status: "failed",
          error:
            reason instanceof Error
              ? reason.message
              : `${label}失败`,
          updatedAt: new Date().toISOString(),
        };
        saveLastTask(failedTask);
        if (activeProjectIdRef.current === taskProjectId) {
          setLastTask(failedTask);
        }
      }
      throw reason;
    } finally {
      if (activeProjectIdRef.current === taskProjectId) {
        setProcessing("");
        setProgress(0);
      }
    }
  }

  async function applySingleVideoOperation(
    operation: "enhance" | "erase_subtitles" | "speed" | "add_subtitles",
    input: Record<string, unknown>,
    label: string,
    preparedInput?: ProcessedClip,
  ) {
    try {
      const sourceClip =
        preparedInput ?? await prepareSelectedSegment();
      const result = await runOperation(
        operation,
        {
          videoUrl: sourceClip.videoUrl,
          ...input,
        },
        label,
      );
      if (!result.videoUrl) throw new Error(`${label}未返回视频`);
      addProcessedResult(
        sourceClip,
        result.videoUrl,
        label,
        operation === "speed"
          ? sourceClip.duration /
            Number(input.speed ?? 1)
          : sourceClip.duration,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${label}失败`);
    }
  }

  async function exportTimeline() {
    if (!segments.length) return;
    setError("");
    try {
      const trimmedUrls: string[] = [];
      const requests = timelineTrimRequests(segments);
      for (const [index, request] of requests.entries()) {
        setProcessing(`裁剪片段 ${index + 1}/${requests.length}`);
        const result = await runOperation(
          "trim",
          {
            videoUrl:
              request.sourceUrl ??
              workingUrl,
            startTime: request.startTime,
            endTime: request.endTime,
          },
          `裁剪片段 ${index + 1}/${requests.length}`,
        );
        if (!result.videoUrl) throw new Error("裁剪未返回视频");
        trimmedUrls.push(result.videoUrl);
      }
      const finalResult =
        trimmedUrls.length === 1
          ? { videoUrl: trimmedUrls[0] }
          : await runOperation(
              "concat",
              { videoUrls: trimmedUrls },
              "拼接保留片段",
            );
      if (!finalResult.videoUrl) throw new Error("拼接未返回视频");
      setWorkingUrl(finalResult.videoUrl);
      setOutputUrl(finalResult.videoUrl);
      // "下载成片" must always point at the freshly exported composition,
      // never at an intermediate processed clip written to outputUrl.
      setDownloadUrl(finalResult.videoUrl);
      const nextDuration = timelineDuration(segments);
      const next = createTimeline(nextDuration, {
        id: "output",
        url: finalResult.videoUrl,
        name: "处理结果",
      });
      setDuration(nextDuration);
      setPlayhead(0);
      setSegments(next);
      setSelectedSegmentId(next[0]?.id ?? "");
      setHistory([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "裁剪导出失败");
    }
  }

  async function generateSubtitles() {
    try {
      const sourceClip = await prepareSelectedSegment();
      const result = await runOperation(
        "asr",
        {
          videoUrl: sourceClip.videoUrl,
          language: "cmn-Hans-CN",
        },
        "识别语音字幕",
      );
      // Normalize ms→s and clamp to the clip duration up front, so the
      // editor and the burn step share the exact same timings the
      // preroll flow uses.
      const normalized = normalizeSubtitles(
        result.subtitles ?? [],
        sourceClip.duration,
      );
      if (!normalized.length) {
        throw new Error("未识别到位于视频时长内的有效字幕");
      }
      setSubtitles(normalized);
      setSubtitlesConfirmed(false);
      setSubtitlesApplied(false);
      setSubtitleInputClip(sourceClip);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "字幕识别失败");
    }
  }

  // Burn confirmed subtitles, enforce the frame-level visual acceptance
  // gate, then swap the verified URL into the timeline as the concat
  // source. This is what guarantees "裁剪并拼接" uses the subtitled
  // version rather than the original clip.
  async function burnSubtitles() {
    const sourceClip = subtitleInputClip;
    if (!sourceClip) {
      setError("请先识别并确认字幕");
      return;
    }
    try {
      const normalized = normalizeSubtitles(
        subtitles,
        sourceClip.duration,
      );
      if (!normalized.length) {
        throw new Error("没有位于视频时长内的有效字幕");
      }
      if (!isSubtitleBurnStyleValid(subtitleStyle)) {
        throw new Error("请先填写有效的字幕样式");
      }
      const result = await runOperation(
        "add_subtitles",
        {
          videoUrl: sourceClip.videoUrl,
          confirmed: true,
          subtitles: normalized,
          ...subtitleStyle,
        },
        "烧录视频字幕",
      );
      if (!result.videoUrl) throw new Error("烧录视频字幕未返回视频");
      // Hard gate: never accept a burn that did not pass frame-level
      // visual verification — otherwise a "task succeeded" but visually
      // empty caption could slip into the concat.
      if (result.subtitleVerification?.status !== "verified") {
        throw new Error(
          "字幕画面未通过验收，已禁止保存和拼接，请重试",
        );
      }
      const verifiedUrl = result.videoUrl;
      // Record the verified result and swap it into the timeline segment
      // it was burned from. The burned clip is already trimmed to that
      // segment's range, so the segment must reference it at [0,
      // clipDuration]; otherwise the export would re-trim it with the
      // original start/end. This is what makes "裁剪并拼接" concat the
      // subtitled version rather than the original source.
      setVerifiedSubtitleUrls((current) =>
        current.includes(verifiedUrl)
          ? current
          : [...current, verifiedUrl],
      );
      setSegments((current) =>
        current.map((segment) =>
          segment.id === sourceClip.sourceSegmentId
            ? {
                ...segment,
                start: 0,
                end: sourceClip.duration,
                sourceUrl: verifiedUrl,
                sourceName: `${segment.sourceName ?? sourceClip.name}·字幕版`,
              }
            : segment,
        ),
      );
      addProcessedResult(
        sourceClip,
        verifiedUrl,
        "烧录视频字幕",
        sourceClip.duration,
      );
      setSubtitlesApplied(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "烧录视频字幕失败",
      );
    }
  }

  if (!project && !error) {
    return (
      <div className="post-production-loading">
        <LoaderCircle className="spin" size={18} />
        正在读取剪辑素材
      </div>
    );
  }

  const activeSegment = selectedTimelineSegment();

  // Guard against exporting a composition that silently drops subtitles:
  // if captions were identified but the verified subtitle clip has not
  // been burned + swapped into the track yet, "裁剪并拼接" would concat
  // the original (caption-less) source. Block it and explain why.
  const hasPendingSubtitles =
    subtitles.length > 0 && !subtitlesApplied;
  // The distinct source URLs the export will actually concat, in track
  // order — surfaced to the user so a stale/original version can never be
  // mistaken for the subtitled one.
  const concatSources = segments.map((segment, index) => ({
    id: segment.id,
    name: segment.sourceName ?? `片段 ${index + 1}`,
    subtitled: verifiedSubtitleUrls.includes(
      segment.sourceUrl ?? "",
    ),
  }));

  return (
    <div className="pipeline-page post-production-page">
      <header className="pipeline-topbar">
        <div className="project-breadcrumb">
          <Link
            href="/production/post-production"
            aria-label="返回视频后期剪辑"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="post-production-picker" ref={pickerRef}>
            <button
              type="button"
              className="project-switcher-trigger"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((current) => !current)}
            >
              <FileVideo2 size={18} />
              <span>
                <strong>选择项目</strong>
                <small>
                  {project?.name ?? "未选择"} · 已选{" "}
                  {selectedAssetIds.length} 个视频
                </small>
              </span>
              <ChevronDown size={15} />
            </button>
            {pickerOpen && (
              <div className="post-production-picker-menu">
                <section className="post-production-project-list">
                  <header>
                    <strong>项目</strong>
                    <small>{projects.length} 个</small>
                  </header>
                  {projects.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={
                        item.id === selectedProjectId ? "active" : ""
                      }
                      onClick={() => chooseProject(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.genre} · {item.sourceCount} 个源视频</small>
                      </span>
                      {item.id === selectedProjectId && <Check size={14} />}
                    </button>
                  ))}
                </section>
                <section className="post-production-picker-assets">
                  <header>
                    <strong>{project?.name ?? "项目视频"}</strong>
                    <small>可多选</small>
                  </header>
                  {assetGroups.map((group) => (
                    <details key={group.kind}>
                      <summary>
                        <span className="library-folder-icon">
                          <FolderClosed className="closed" size={15} />
                          <FolderOpen className="open" size={15} />
                        </span>
                        <strong>{group.kind}</strong>
                        <small>{group.assets.length}</small>
                      </summary>
                      <div>
                        {group.assets.map((asset) => (
                          <div
                            className="post-production-picker-asset-row"
                            key={asset.id}
                          >
                            <input
                              type="checkbox"
                              aria-label={`选择 ${asset.name}`}
                              checked={selectedAssetIds.includes(asset.id)}
                              onChange={() => toggleAsset(asset.id)}
                            />
                            <span>
                              <strong>{asset.name}</strong>
                              <small>
                                {selectedAssetId === asset.id
                                  ? "当前编辑"
                                  : "加入处理范围"}
                              </small>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  selectedAssetIds.includes(
                                    asset.id,
                                  )
                                ) {
                                  // Already in scope: just switch the
                                  // active edit target, no rebuild.
                                  setSelectedAssetId(asset.id);
                                  return;
                                }
                                if (!confirmScopeChange()) return;
                                setSelectedAssetId(asset.id);
                                setSelectedAssetIds((current) => [
                                  ...current,
                                  asset.id,
                                ]);
                              }}
                            >
                              编辑
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </section>
              </div>
            )}
          </div>
        </div>
        <a
          className={`button primary ${downloadUrl ? "" : "disabled"}`}
          href={downloadUrl || undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!downloadUrl}
        >
          <Download size={16} />
          下载成片
        </a>
      </header>

      {error && <div className="pipeline-callout error">{error}</div>}
      {processing && (
        <div className="post-production-progress">
          <LoaderCircle className="spin" size={15} />
          <span>{processing}</span>
          <i><em style={{ width: `${progress}%` }} /></i>
        </div>
      )}

      <div className="post-production-layout">
        <aside className="post-production-assets">
          <header>
            <strong>处理范围</strong>
            <small>{selectedAssetIds.length} / {assets.length}</small>
          </header>
          <div>
            {selectedAssets.map((asset) => (
              <div
                className="post-production-asset-row"
                key={asset.id}
              >
                <button
                  type="button"
                  className={
                    selectedAssetId === asset.id ? "active" : ""
                  }
                  onClick={() => {
                    const segment = segments.find(
                      (item) => item.sourceId === asset.id,
                    );
                    if (segment) {
                      activateTimelinePosition(
                        timelineOffsetForSegment(
                          segments,
                          segment.id,
                        ),
                      );
                    } else {
                      setSelectedAssetId(asset.id);
                      setWorkingUrl(asset.sourceUrl);
                    }
                  }}
                >
                  <FileVideo2 size={16} />
                  <span>
                    <strong>{asset.name}</strong>
                    <small>
                      {asset.kind}
                      {selectedAssetId === asset.id
                        ? " · 当前编辑"
                        : ""}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="post-production-remove-asset"
                  aria-label={`从处理范围移除 ${asset.name}`}
                  title="从处理范围移除"
                  onClick={() => toggleAsset(asset.id)}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {!selectedAssets.length && (
              <div className="post-production-assets-empty">
                请从顶部“选择项目”中勾选视频
              </div>
            )}
          </div>
        </aside>

        <main className="post-production-canvas">
          {workingUrl ? (
            <video
              ref={videoRef}
              key={workingUrl}
              src={workingUrl}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => {
                const mediaDuration =
                  event.currentTarget.duration;
                const assetId = selectedAsset?.id;
                if (
                  assetId &&
                  Number.isFinite(mediaDuration) &&
                  mediaDuration > 0
                ) {
                  setMeasuredDurations((current) =>
                    current[assetId] === mediaDuration
                      ? current
                      : {
                          ...current,
                          [assetId]: mediaDuration,
                        });
                  setSegments((current) => {
                    const sourceSegments = current.filter(
                      (segment) =>
                        segment.sourceId === assetId,
                    );
                    if (
                      sourceSegments.length !== 1 ||
                      sourceSegments[0].start !== 0
                    ) {
                      return current;
                    }
                    const next = current.map((segment) =>
                      segment.id === sourceSegments[0].id
                        ? {
                            ...segment,
                            end: mediaDuration,
                          }
                        : segment,
                    );
                    const nextDuration =
                      timelineDuration(next);
                    setDuration(nextDuration);
                    setPlayhead((value) =>
                      Math.min(value, nextDuration),
                    );
                    return next;
                  });
                }
              }}
              onTimeUpdate={(event) => {
                const segment = segments.find(
                  (item) => item.id === selectedSegmentId,
                );
                if (!segment) return;
                const sourceTime = event.currentTarget.currentTime;
                const offset = timelineOffsetForSegment(
                  segments,
                  segment.id,
                );
                setPlayhead(
                  Math.min(
                    duration,
                    offset +
                      Math.max(0, sourceTime - segment.start),
                  ),
                );
                if (sourceTime >= segment.end) {
                  event.currentTarget.pause();
                }
              }}
            />
          ) : (
            <div className="stage-empty">
              {lastTask ? (
                <>
                  <strong>上次后期任务</strong>
                  <span>
                    {lastTask.label} ·{" "}
                    {lastTask.status === "completed"
                      ? "已完成"
                      : lastTask.status === "failed"
                        ? "失败"
                        : `处理中 ${lastTask.progress}%`}
                  </span>
                  <small>
                    {new Date(
                      lastTask.updatedAt,
                    ).toLocaleString("zh-CN")}
                  </small>
                  {lastTask.error && (
                    <small>{lastTask.error}</small>
                  )}
                </>
              ) : (
                <>
                  <strong>请选择需要处理的视频</strong>
                  <span>
                    从顶部“选择项目”中勾选一个或多个视频。
                  </span>
                </>
              )}
            </div>
          )}

          <div className="video-edit-toolbar">
            <button type="button" onClick={undoTimeline} disabled={!history.length}>
              <RotateCcw size={15} /> 撤销
            </button>
            <button type="button" onClick={splitAtPlayhead} disabled={!duration}>
              <Scissors size={15} /> 在播放头切分
            </button>
            <button
              type="button"
              onClick={deleteSelectedSegment}
              disabled={segments.length <= 1}
            >
              <Trash2 size={15} /> 删除片段
            </button>
            <span>
              {formatTime(playhead)} / {formatTime(duration)}
            </span>
          </div>

          {processedClips.length > 0 && (
            <section
              className="post-production-results"
              aria-label="处理结果"
            >
              <header>
                <div>
                  <strong>处理结果</strong>
                  <small>可设为主预览、拖入轨道或点击加入</small>
                </div>
                <span>{processedClips.length} 个片段</span>
              </header>
              <div>
                {processedClips.map((clip) => (
                  <article
                    key={clip.id}
                    className={
                      previewClipId === clip.id ? "active" : ""
                    }
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "application/x-frameflow-clip",
                        clip.id,
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={clip.videoUrl}
                    />
                    <div>
                      <GripVertical size={14} />
                      <span>
                        <strong>{clip.name}</strong>
                        <small>
                          {previewClipId === clip.id
                            ? "主预览中 · "
                            : ""}
                          {clip.operation} · {formatTime(clip.duration)}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        title="设为主预览"
                        aria-label={`将 ${clip.name} 设为主预览`}
                        aria-pressed={previewClipId === clip.id}
                        onClick={() => {
                          setPreviewClipId(clip.id);
                          setWorkingUrl(clip.videoUrl);
                          setOutputUrl(clip.videoUrl);
                          setDownloadUrl(clip.videoUrl);
                        }}
                      >
                        <MonitorPlay size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="加入轨道"
                        aria-label={`加入轨道 ${clip.name}`}
                        onClick={() =>
                          addProcessedClipToTimeline(clip)}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="video-edit-timeline">
            <input
              aria-label="视频播放头"
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={Math.min(playhead, duration || 0)}
              onChange={(event) => {
                const value = Number(event.target.value);
                activateTimelinePosition(value);
              }}
            />
            <div
              className="video-segment-track"
              onDragOver={(event) => {
                if (
                  event.dataTransfer.types.includes(
                    "application/x-frameflow-clip",
                  )
                ) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const clipId = event.dataTransfer.getData(
                  "application/x-frameflow-clip",
                );
                const clip = processedClips.find(
                  (item) => item.id === clipId,
                );
                if (clip) addProcessedClipToTimeline(clip);
              }}
            >
              {segments.map((segment, index) => (
                <button
                  type="button"
                  key={segment.id}
                  className={
                    selectedSegmentId === segment.id ? "active" : ""
                  }
                  style={{
                    width: `${((segment.end - segment.start) / Math.max(duration, 1)) * 100}%`,
                  }}
                  onClick={() => {
                    setSelectedSegmentId(segment.id);
                    activateTimelinePosition(
                      timelineOffsetForSegment(
                        segments,
                        segment.id,
                      ),
                    );
                  }}
                >
                  <strong>
                    {segment.sourceName ?? `片段 ${index + 1}`}
                  </strong>
                  <small>
                    {formatTime(segment.start)}–{formatTime(segment.end)}
                  </small>
                </button>
              ))}
              <i
                className="video-playhead"
                style={{
                  left: `${(playhead / Math.max(duration, 1)) * 100}%`,
                }}
              />
            </div>
            <footer>
              <span>
                保留 {segments.length} 段 · 成片约 {formatTime(timelineDuration(segments))}
                {" · "}剪辑进度已自动保存
              </span>
              <button
                type="button"
                className="button primary"
                disabled={
                  !segments.length ||
                  Boolean(processing) ||
                  hasPendingSubtitles
                }
                title={
                  hasPendingSubtitles
                    ? "已识别字幕但尚未生成并验收字幕版，请先点“生成字幕视频”再拼接"
                    : undefined
                }
                onClick={() => void exportTimeline()}
              >
                <Scissors size={15} /> 裁剪并拼接
              </button>
            </footer>
            {segments.length > 0 && (
              <div className="post-production-concat-sources">
                <span className="concat-sources-title">
                  本次拼接将按顺序合并
                </span>
                <ol>
                  {concatSources.map((source) => (
                    <li key={source.id}>
                      <span>{source.name}</span>
                      {source.subtitled ? (
                        <em className="concat-source-tag subtitled">
                          <Check size={12} /> 字幕版
                        </em>
                      ) : (
                        <em className="concat-source-tag">原始</em>
                      )}
                    </li>
                  ))}
                </ol>
                {hasPendingSubtitles && (
                  <p className="concat-sources-warning">
                    已识别字幕但尚未生成字幕版，拼接已暂时锁定。
                  </p>
                )}
              </div>
            )}
          </div>
        </main>

        <aside className="post-production-tools">
          <header><strong>后期处理</strong></header>
          <nav>
            {operations.map((operation) => {
              const Icon = operation.icon;
              return (
                <button
                  type="button"
                  key={operation.id}
                  className={`${activeOperation === operation.id ? "active" : ""}${
                    operation.comingSoon ? " coming-soon" : ""
                  }`}
                  disabled={operation.comingSoon}
                  aria-disabled={operation.comingSoon}
                  title={
                    operation.comingSoon
                      ? "该功能即将上线，暂不可用"
                      : undefined
                  }
                  onClick={() => {
                    if (operation.comingSoon) return;
                    setActiveOperation(operation.id);
                  }}
                >
                  <Icon size={16} />
                  <span>
                    <strong>{operation.label}</strong>
                    {operation.comingSoon && <small>即将上线</small>}
                  </span>
                  {operation.comingSoon && (
                    <em className="coming-soon-badge">敬请期待</em>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="post-production-tool-panel">
            <div className="post-production-operation-target">
              <span>当前处理片段</span>
              <strong>
                {activeSegment?.sourceName ?? "请先选择轨道片段"}
              </strong>
              {activeSegment && (
                <small>
                  {formatTime(activeSegment.start)}–
                  {formatTime(activeSegment.end)}
                </small>
              )}
            </div>
            {activeOperation === "timeline" && (
              <>
                <p>
                  已将 {selectedAssets.length} 个视频按选择顺序加入轨道。
                  移动播放头可跨视频预览、分割并删除片段，导出时自动合并。
                </p>
              </>
            )}
            {activeOperation === "erase_subtitles" && (
              <>
                <p>使用精细化 V5 模型自动识别并无痕擦除中英文硬字幕。</p>
                <button
                  className="button primary"
                  disabled={!activeSegment || Boolean(processing)}
                  onClick={() => void applySingleVideoOperation(
                    "erase_subtitles", {}, "擦除字幕",
                  )}
                >
                  <Eraser size={15} /> 开始擦除
                </button>
              </>
            )}
            {activeOperation === "speed" && (
              <>
                <label>
                  播放速度
                  <select
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((value) => (
                      <option value={value} key={value}>{value}x</option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={!activeSegment || Boolean(processing) || speed === 1}
                  onClick={() => void applySingleVideoOperation(
                    "speed", { speed }, "调整音视频速度",
                  )}
                >
                  <Gauge size={15} /> 应用调速
                </button>
              </>
            )}
            {activeOperation === "subtitles" && (
              <>
                <p>
                  先识别字幕，再在线校对并人工确认；确认前不能烧录到视频。
                </p>
                <button
                  className="button primary"
                  disabled={!activeSegment || Boolean(processing)}
                  onClick={() => void generateSubtitles()}
                >
                  <Captions size={15} /> 识别语音字幕
                </button>
                {subtitles.length > 0 && (
                  <div className="subtitle-review-list">
                    {subtitles.map((subtitle, index) => (
                      <article key={subtitle.id}>
                        <span>{formatTime(subtitle.startTime)}</span>
                        <textarea
                          aria-label={`字幕 ${index + 1}`}
                          value={subtitle.subtitleText}
                          onChange={(event) => {
                            setSubtitlesConfirmed(false);
                            setSubtitles((current) =>
                              current.map((item) =>
                                item.id === subtitle.id
                                  ? { ...item, subtitleText: event.target.value }
                                  : item,
                              ),
                            );
                          }}
                        />
                      </article>
                    ))}
                    <SubtitleStyleControls
                      value={subtitleStyle}
                      ariaLabelPrefix="后期"
                      disabled={Boolean(processing)}
                      onChange={(nextStyle) => {
                        setSubtitleStyle(nextStyle);
                        setSubtitlesApplied(false);
                      }}
                    />
                    <button
                      type="button"
                      className={`button ${subtitlesConfirmed ? "ghost" : "primary"}`}
                      onClick={() => setSubtitlesConfirmed(true)}
                    >
                      <Check size={15} />
                      {subtitlesConfirmed ? "字幕已确认" : "确认字幕内容"}
                    </button>
                    <button
                      className="button primary"
                      disabled={
                        !activeSegment ||
                        !subtitleInputClip ||
                        subtitleInputClip.sourceSegmentId !==
                          activeSegment.id ||
                        !subtitlesConfirmed ||
                        !subtitles.length ||
                        !isSubtitleBurnStyleValid(subtitleStyle) ||
                        Boolean(processing)
                      }
                      onClick={() => void burnSubtitles()}
                    >
                      <Sparkles size={15} />
                      {subtitlesApplied
                        ? "重新生成字幕视频"
                        : "生成字幕视频"}
                    </button>
                    {subtitlesApplied && (
                      <p className="subtitle-applied-hint">
                        <Check size={13} /> 字幕已通过画面验收并替换到轨道，
                        “裁剪并拼接”将使用字幕版。
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {activeOperation === "add_watermark" && (
              <div className="post-production-coming-soon">
                <Stamp size={22} />
                <strong>明水印功能即将上线</strong>
                <p>
                  明水印由火山引擎视频点播 VOD 转码生成，需要点播空间、水印模板与独立 VOD 权限。
                  待接入完成后可在此为成片批量添加文字或图片水印。
                </p>
                <span className="coming-soon-badge">敬请期待</span>
              </div>
            )}
            {activeOperation === "enhance" && (
              <>
                <label>
                  输出分辨率
                  <select
                    value={resolution}
                    onChange={(event) =>
                      setResolution(
                        event.target.value as typeof resolution,
                      )
                    }
                  >
                    <option value="720p">720P</option>
                    <option value="1080p">1080P</option>
                    <option value="2k">2K</option>
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={!activeSegment || Boolean(processing)}
                  onClick={() => void applySingleVideoOperation(
                    "enhance", { resolution }, "大模型画质增强",
                  )}
                >
                  <WandSparkles size={15} /> 开始增强
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
