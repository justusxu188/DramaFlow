"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Eraser,
  LoaderCircle,
  LocateFixed,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Sparkles,
  StepBack,
  StepForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { SubtitleStyleControls } from "@/components/subtitle-style-controls";
import type { RenderVariant } from "@/lib/pipeline-store";
import type { ProductionConfig } from "@/lib/production-config";
import {
  clipSubtitlesToRanges,
  complementTimeRanges,
  isSubtitleBurnStyleValid,
  normalizeSubtitles,
  normalizeTimeRanges,
  subtitleBurnStyleFromProductionConfig,
  type SubtitleDraft,
  type SubtitleTimeRange,
} from "@/lib/subtitle-post-production";

export type PrerollVideoTool =
  | "erase_subtitles"
  | "add_subtitles"
  | "enhance";

type Props = {
  tool: PrerollVideoTool;
  videoUrl: string;
  sourceVersionLabel: string;
  duration: number;
  initialSubtitles?: SubtitleDraft[];
  subtitleEraseConfig?: RenderVariant["subtitleEraseConfig"];
  subtitleStyle?: Pick<
    ProductionConfig,
    | "subtitleFontType"
    | "subtitleFontSize"
    | "subtitleFontColor"
    | "subtitlePosition"
  >;
  onClose: () => void;
  onSubmit: (
    operation: PrerollVideoTool,
    input: Record<string, unknown>,
  ) => Promise<void>;
};

const toolTitles: Record<PrerollVideoTool, string> = {
  erase_subtitles: "精细字幕擦除",
  add_subtitles: "添加字幕",
  enhance: "画质增强",
};

const minimumEraseRangeDuration = 0.04;

function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00.000";
  const totalMilliseconds = Math.round(value * 1000);
  const minutes = Math.floor(totalMilliseconds / 60000);
  const seconds = Math.floor(
    (totalMilliseconds % 60000) / 1000,
  );
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(
    milliseconds,
  ).padStart(3, "0")}`;
}

function parsePlaybackTime(value: string) {
  const parts = value.trim().split(":");
  if (
    parts.length === 0 ||
    parts.length > 3 ||
    parts.some((part) => part.trim() === "")
  ) {
    return null;
  }
  const values = parts.map(Number);
  if (values.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }
  const seconds = values.at(-1) ?? 0;
  const minutes = values.at(-2) ?? 0;
  const hours = values.at(-3) ?? 0;
  if (
    (parts.length > 1 && seconds >= 60) ||
    (parts.length > 2 && minutes >= 60)
  ) {
    return null;
  }
  return Number(
    (hours * 3600 + minutes * 60 + seconds).toFixed(3),
  );
}

function effectiveRanges(
  config: RenderVariant["subtitleEraseConfig"],
  duration: number,
) {
  if (!config || config.rangeMode === "all" || duration <= 0) {
    return duration > 0
      ? [{ startTime: 0, endTime: duration }]
      : [];
  }
  return config.rangeMode === "selected"
    ? normalizeTimeRanges(config.segments, duration)
    : complementTimeRanges(config.segments, duration);
}

function RangeEditor({
  ranges,
  duration,
  disabled,
  onChange,
  onCaptureTime,
}: {
  ranges: SubtitleTimeRange[];
  duration: number;
  disabled: boolean;
  onChange: (ranges: SubtitleTimeRange[]) => void;
  onCaptureTime: (
    index: number,
    edge: "startTime" | "endTime",
  ) => void;
}) {
  return (
    <div className="video-tool-ranges">
      {ranges.map((range, index) => (
        <div className="video-tool-range" key={`range-${index + 1}`}>
          <label>
            开始
            <input
              type="number"
              min={0}
              max={duration || undefined}
              step={0.001}
              value={
                Number.isFinite(range.startTime)
                  ? range.startTime
                  : ""
              }
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  ranges.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          startTime:
                            event.target.value === ""
                              ? Number.NaN
                              : event.target.valueAsNumber,
                        }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label>
            结束
            <input
              type="number"
              min={0}
              max={duration || undefined}
              step={0.001}
              value={
                Number.isFinite(range.endTime)
                  ? range.endTime
                  : ""
              }
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  ranges.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          endTime:
                            event.target.value === ""
                              ? Number.NaN
                              : event.target.valueAsNumber,
                        }
                      : item,
                  ),
                )
              }
            />
          </label>
          <button
            className="button ghost compact video-tool-capture-button start"
            type="button"
            title="将当前播放时间设为开始"
            aria-label="将当前播放时间设为开始"
            disabled={disabled}
            onClick={() => onCaptureTime(index, "startTime")}
          >
            <ArrowLeftToLine size={14} />
            设为开始
          </button>
          <button
            className="button ghost compact video-tool-capture-button end"
            type="button"
            title="将当前播放时间设为结束"
            aria-label="将当前播放时间设为结束"
            disabled={disabled}
            onClick={() => onCaptureTime(index, "endTime")}
          >
            <ArrowRightToLine size={14} />
            设为结束
          </button>
          <button
            className="icon-button"
            type="button"
            title="删除时间段"
            disabled={disabled || ranges.length === 1}
            onClick={() =>
              onChange(
                ranges.filter((_, itemIndex) => itemIndex !== index),
              )
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        className="button ghost compact"
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...ranges,
            {
              startTime: ranges.at(-1)?.endTime ?? 0,
              endTime: duration || (ranges.at(-1)?.endTime ?? 0) + 1,
            },
          ])
        }
      >
        <Plus size={15} />
        添加时间段
      </button>
    </div>
  );
}

export function PrerollVideoToolsDialog({
  tool,
  videoUrl,
  sourceVersionLabel,
  duration,
  initialSubtitles = [],
  subtitleEraseConfig,
  subtitleStyle,
  onClose,
  onSubmit,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stepHoldTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepHoldIntervalRef =
    useRef<ReturnType<typeof setInterval> | null>(null);
  const stepWasHeldRef = useRef(false);
  const [minimized, setMinimized] = useState(false);
  const [processing, setProcessing] = useState("");
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] =
    useState(duration);
  const [seekInput, setSeekInput] = useState("0:00.000");
  const [editingSeekInput, setEditingSeekInput] = useState(false);
  const [seekInputInvalid, setSeekInputInvalid] = useState(false);
  const [rangeMode, setRangeMode] = useState<
    "all" | "selected" | "skip"
  >(subtitleEraseConfig?.rangeMode ?? "all");
  const [ranges, setRanges] = useState<SubtitleTimeRange[]>(
    subtitleEraseConfig?.segments.length
      ? subtitleEraseConfig.segments
      : [{ startTime: 0, endTime: duration || 1 }],
  );
  const [useCustomArea, setUseCustomArea] = useState(
    Boolean(subtitleEraseConfig?.eraseRatioLocations?.length),
  );
  const [eraseArea, setEraseArea] = useState(
    subtitleEraseConfig?.eraseRatioLocations?.[0] ?? {
      topLeftX: 0.05,
      topLeftY: 0.5,
      bottomRightX: 0.95,
      bottomRightY: 0.98,
    },
  );
  const [minTextHeightRatio, setMinTextHeightRatio] = useState(
    subtitleEraseConfig?.subtitleFilter?.minTextHeightRatio ?? 0.01,
  );
  const [maxTextHeightRatio, setMaxTextHeightRatio] = useState(
    subtitleEraseConfig?.subtitleFilter?.maxTextHeightRatio ?? 0.1,
  );
  const [centerOffsetRatio, setCenterOffsetRatio] = useState(
    subtitleEraseConfig?.subtitleFilter?.centerOffsetRatio ?? 0.08,
  );
  const initialUseEraseScope = Boolean(
    subtitleEraseConfig &&
      subtitleEraseConfig.rangeMode !== "all",
  );
  const initialScopedRanges = effectiveRanges(
    subtitleEraseConfig,
    duration,
  );
  const normalizedInitialSubtitles = normalizeSubtitles(
    initialSubtitles,
    duration,
  );
  const [recognizedSubtitles] = useState<SubtitleDraft[]>(
    normalizedInitialSubtitles,
  );
  const [subtitles, setSubtitles] = useState<SubtitleDraft[]>(
    initialUseEraseScope && initialScopedRanges.length
      ? clipSubtitlesToRanges(
          normalizedInitialSubtitles,
          initialScopedRanges,
        )
      : normalizedInitialSubtitles,
  );
  const [useEraseScope, setUseEraseScope] = useState(
    initialUseEraseScope,
  );
  const [burnStyle, setBurnStyle] = useState(() =>
    subtitleBurnStyleFromProductionConfig(subtitleStyle),
  );
  const [enhanceResolution, setEnhanceResolution] =
    useState<"720p" | "1080p" | "2k">("1080p");
  const [enhanceFps, setEnhanceFps] = useState(30);

  const scopedRanges = useMemo(
    () => effectiveRanges(subtitleEraseConfig, duration),
    [duration, subtitleEraseConfig],
  );

  function stopContinuousStep(resetHeld = false) {
    if (stepHoldTimeoutRef.current) {
      clearTimeout(stepHoldTimeoutRef.current);
      stepHoldTimeoutRef.current = null;
    }
    if (stepHoldIntervalRef.current) {
      clearInterval(stepHoldIntervalRef.current);
      stepHoldIntervalRef.current = null;
    }
    if (resetHeld) {
      stepWasHeldRef.current = false;
    }
  }

  useEffect(
    () => () => stopContinuousStep(true),
    [],
  );

  function captureRangeTime(
    index: number,
    edge: "startTime" | "endTime",
  ) {
    const currentTime = Number(
      videoRef.current?.currentTime ?? 0,
    ).toFixed(3);
    setRanges((current) =>
      current.map((range, rangeIndex) =>
        rangeIndex === index
          ? {
              ...range,
              [edge]: Number(currentTime),
            }
          : range,
      ),
    );
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  function seekPlayback(value: number) {
    const video = videoRef.current;
    if (!video) return;
    const upperBound =
      playbackDuration || duration || Number.POSITIVE_INFINITY;
    const nextTime = Number(
      Math.min(Math.max(value, 0), upperBound).toFixed(3),
    );
    video.currentTime = nextTime;
    setPlaybackTime(nextTime);
    setSeekInput(formatPlaybackTime(nextTime));
    setSeekInputInvalid(false);
  }

  function stepPlayback(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    const upperBound =
      playbackDuration || duration || Number.POSITIVE_INFINITY;
    const nextTime = Number(
      Math.min(
        Math.max(video.currentTime + delta, 0),
        upperBound,
      ).toFixed(3),
    );
    video.currentTime = nextTime;
    setPlaybackTime(nextTime);
    setSeekInput(formatPlaybackTime(nextTime));
    setSeekInputInvalid(false);
  }

  function startContinuousStep(delta: number) {
    stopContinuousStep(true);
    stepHoldTimeoutRef.current = setTimeout(() => {
      stepWasHeldRef.current = true;
      stepPlayback(delta);
      stepHoldIntervalRef.current = setInterval(
        () => stepPlayback(delta),
        60,
      );
    }, 320);
  }

  function handleStepClick(delta: number) {
    if (stepWasHeldRef.current) {
      stepWasHeldRef.current = false;
      return;
    }
    stepPlayback(delta);
  }

  function jumpToInputTime() {
    const target = parsePlaybackTime(seekInput);
    if (target === null) {
      setSeekInputInvalid(true);
      return;
    }
    seekPlayback(target);
  }

  function toggleMuted() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }

  function toggleSubtitleScope(next: boolean) {
    setUseEraseScope(next);
    setSubtitles(
      next && scopedRanges.length
        ? clipSubtitlesToRanges(
            recognizedSubtitles,
            scopedRanges,
          )
        : recognizedSubtitles,
    );
  }

  async function submitErase() {
    const normalizedRanges =
      rangeMode === "all"
        ? []
        : normalizeTimeRanges(ranges, duration);
    if (rangeMode !== "all" && normalizedRanges.length === 0) {
      setError("请至少填写一个有效时间段");
      return;
    }
    if (
      normalizedRanges.some(
        (range) =>
          range.endTime - range.startTime <
          minimumEraseRangeDuration,
      )
    ) {
      setError(
        "单个擦除时间段不能短于 0.040 秒，否则不足一个常见视频帧，无法可靠处理",
      );
      return;
    }
    const config: NonNullable<RenderVariant["subtitleEraseConfig"]> = {
      rangeMode,
      segments: normalizedRanges,
      eraseRatioLocations: useCustomArea ? [eraseArea] : undefined,
      subtitleFilter: {
        minTextHeightRatio,
        maxTextHeightRatio,
        centerOffsetRatio,
      },
    };
    setProcessing("正在提交字幕擦除任务");
    setError("");
    try {
      await onSubmit("erase_subtitles", {
        modelVersion: "v5",
        ...(rangeMode === "all"
          ? {}
          : {
              timeSegmentFilter: {
                mode: rangeMode,
                segments: normalizedRanges,
              },
            }),
        eraseRatioLocations: config.eraseRatioLocations,
        subtitleFilter: config.subtitleFilter,
        subtitleEraseConfig: config,
        operationSettings: config,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "字幕擦除失败",
      );
    } finally {
      setProcessing("");
    }
  }

  async function submitSubtitles() {
    if (
      useEraseScope &&
      scopedRanges.some(
        (range) =>
          range.endTime - range.startTime <
          minimumEraseRangeDuration,
      )
    ) {
      setError(
        "最近擦除区间短于 0.040 秒，请先回退并重新设置有效的字幕处理范围",
      );
      return;
    }
    const normalized = normalizeSubtitles(subtitles, duration);
    if (!normalized.length) {
      setError("没有位于处理范围内的有效字幕");
      return;
    }
    if (!isSubtitleBurnStyleValid(burnStyle)) {
      setError("请填写有效的字幕样式");
      return;
    }
    setProcessing("正在提交添加字幕任务");
    setError("");
    try {
      await onSubmit("add_subtitles", {
        subtitles: normalized,
        ...burnStyle,
        scope: useEraseScope ? "erase_scope" : "full",
        ranges: useEraseScope ? scopedRanges : [],
        operationSettings: {
          scope: useEraseScope ? "erase_scope" : "full",
          ranges: useEraseScope ? scopedRanges : [],
          subtitleCount: normalized.length,
          ...burnStyle,
        },
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "添加字幕失败",
      );
    } finally {
      setProcessing("");
    }
  }

  async function submitEnhance() {
    setProcessing("正在提交画质增强任务");
    setError("");
    try {
      await onSubmit("enhance", {
        resolution: enhanceResolution,
        fps: enhanceFps,
        operationSettings: {
          resolution: enhanceResolution,
          fps: enhanceFps,
        },
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "画质增强失败",
      );
    } finally {
      setProcessing("");
    }
  }

  if (minimized) {
    return (
      <button
        className="video-tool-minimized"
        type="button"
        onClick={() => setMinimized(false)}
      >
        <Maximize2 size={15} />
        {toolTitles[tool]} · {sourceVersionLabel}
      </button>
    );
  }

  return (
    <div className="video-tool-dock" role="presentation">
      <section
        className="video-tool-modal"
        role="dialog"
        aria-modal="false"
        aria-labelledby="video-tool-title"
      >
        <header className="modal-heading">
          <div>
            <span>
              AI 前贴视频 · 基于 {sourceVersionLabel}
            </span>
            <h3 id="video-tool-title">{toolTitles[tool]}</h3>
          </div>
          <div className="video-tool-heading-actions">
            <button
              className="icon-button"
              type="button"
              title="最小化"
              disabled={Boolean(processing)}
              onClick={() => setMinimized(true)}
            >
              <Minimize2 size={17} />
            </button>
            <button
              className="icon-button"
              type="button"
              title="关闭"
              disabled={Boolean(processing)}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {tool === "erase_subtitles" && (
          <div className="video-tool-body">
            <div className="video-tool-preview-stage">
              <video
                ref={videoRef}
                src={videoUrl}
                playsInline
                preload="metadata"
                onClick={togglePlayback}
                onLoadedMetadata={(event) =>
                  setPlaybackDuration(event.currentTarget.duration)
                }
                onTimeUpdate={(event) => {
                  const nextTime = event.currentTarget.currentTime;
                  setPlaybackTime(nextTime);
                  if (!editingSeekInput) {
                    setSeekInput(formatPlaybackTime(nextTime));
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              {useCustomArea && (
                <div
                  className="subtitle-erase-region"
                  style={{
                    left: `${eraseArea.topLeftX * 100}%`,
                    top: `${eraseArea.topLeftY * 100}%`,
                    width:
                      `${(eraseArea.bottomRightX - eraseArea.topLeftX) * 100}%`,
                    height:
                      `${(eraseArea.bottomRightY - eraseArea.topLeftY) * 100}%`,
                  }}
                >
                  擦除区域
                </div>
              )}
            </div>
            <div
              className="video-tool-player-controls"
              aria-label="视频播放控制"
            >
              <div className="video-tool-player-main">
                <button
                  className="icon-button"
                  type="button"
                  aria-label={isPlaying ? "暂停视频" : "播放视频"}
                  title={isPlaying ? "暂停" : "播放"}
                  onClick={togglePlayback}
                >
                  {isPlaying ? (
                    <Pause size={15} />
                  ) : (
                    <Play size={15} />
                  )}
                </button>
                <button
                  className="button ghost compact video-tool-step-button"
                  type="button"
                  aria-label="后退 10 毫秒，长按连续后退"
                  title="单击后退 10 毫秒，长按连续后退"
                  onPointerDown={() => startContinuousStep(-0.01)}
                  onPointerUp={() => stopContinuousStep()}
                  onPointerCancel={() => stopContinuousStep(true)}
                  onPointerLeave={() => stopContinuousStep(true)}
                  onBlur={() => stopContinuousStep(true)}
                  onClick={() => handleStepClick(-0.01)}
                >
                  <StepBack size={13} />
                  10ms
                </button>
                <time>
                  {formatPlaybackTime(playbackTime)} /{" "}
                  {formatPlaybackTime(playbackDuration)}
                </time>
                <input
                  type="range"
                  min={0}
                  max={playbackDuration || duration || 0.1}
                  step={0.001}
                  value={Math.min(
                    playbackTime,
                    playbackDuration || duration || 0.1,
                  )}
                  aria-label="视频进度"
                  onChange={(event) =>
                    seekPlayback(Number(event.target.value))
                  }
                />
                <button
                  className="button ghost compact video-tool-step-button"
                  type="button"
                  aria-label="前进 10 毫秒，长按连续前进"
                  title="单击前进 10 毫秒，长按连续前进"
                  onPointerDown={() => startContinuousStep(0.01)}
                  onPointerUp={() => stopContinuousStep()}
                  onPointerCancel={() => stopContinuousStep(true)}
                  onPointerLeave={() => stopContinuousStep(true)}
                  onBlur={() => stopContinuousStep(true)}
                  onClick={() => handleStepClick(0.01)}
                >
                  <StepForward size={13} />
                  10ms
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={isMuted ? "开启声音" : "静音"}
                  title={isMuted ? "开启声音" : "静音"}
                  onClick={toggleMuted}
                >
                  {isMuted ? (
                    <VolumeX size={15} />
                  ) : (
                    <Volume2 size={15} />
                  )}
                </button>
              </div>
              <div className="video-tool-exact-seek">
                <label htmlFor="preroll-exact-seek">
                  精确定位
                </label>
                <input
                  id="preroll-exact-seek"
                  type="text"
                  inputMode="decimal"
                  value={seekInput}
                  aria-invalid={seekInputInvalid}
                  aria-describedby="preroll-exact-seek-hint"
                  onFocus={() => setEditingSeekInput(true)}
                  onBlur={() => setEditingSeekInput(false)}
                  onChange={(event) => {
                    setSeekInput(event.target.value);
                    setSeekInputInvalid(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      jumpToInputTime();
                    }
                  }}
                />
                <span id="preroll-exact-seek-hint">
                  分:秒.毫秒
                </span>
                <button
                  className="button ghost compact"
                  type="button"
                  onClick={jumpToInputTime}
                >
                  <LocateFixed size={13} />
                  跳转
                </button>
              </div>
            </div>
            <label className="field">
              <span>处理范围</span>
              <select
                value={rangeMode}
                disabled={Boolean(processing)}
                onChange={(event) =>
                  setRangeMode(
                    event.target.value as typeof rangeMode,
                  )
                }
              >
                <option value="all">全片字幕</option>
                <option value="selected">仅指定片段</option>
                <option value="skip">除指定片段外</option>
              </select>
            </label>
            {rangeMode !== "all" && (
              <RangeEditor
                ranges={ranges}
                duration={duration}
                disabled={Boolean(processing)}
                onChange={setRanges}
                onCaptureTime={captureRangeTime}
              />
            )}
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={useCustomArea}
                disabled={Boolean(processing)}
                onChange={(event) =>
                  setUseCustomArea(event.target.checked)
                }
              />
              限制字幕擦除画面区域
            </label>
            <details className="video-tool-advanced">
              <summary>高级参数</summary>
              {useCustomArea && (
                <div className="video-tool-grid four">
                  {([
                    ["topLeftX", "左"],
                    ["topLeftY", "上"],
                    ["bottomRightX", "右"],
                    ["bottomRightY", "下"],
                  ] as const).map(([key, label]) => (
                    <label className="field" key={key}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={eraseArea[key]}
                        disabled={Boolean(processing)}
                        onChange={(event) =>
                          setEraseArea((current) => ({
                            ...current,
                            [key]: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="video-tool-grid three">
                <label className="field">
                  <span>最小文字高度</span>
                  <input
                    type="number"
                    min={0.001}
                    max={0.5}
                    step={0.01}
                    value={minTextHeightRatio}
                    onChange={(event) =>
                      setMinTextHeightRatio(Number(event.target.value))
                    }
                  />
                </label>
                <label className="field">
                  <span>最大文字高度</span>
                  <input
                    type="number"
                    min={0.001}
                    max={0.5}
                    step={0.01}
                    value={maxTextHeightRatio}
                    onChange={(event) =>
                      setMaxTextHeightRatio(Number(event.target.value))
                    }
                  />
                </label>
                <label className="field">
                  <span>水平偏离</span>
                  <input
                    type="number"
                    min={0}
                    max={0.5}
                    step={0.01}
                    value={centerOffsetRatio}
                    onChange={(event) =>
                      setCenterOffsetRatio(Number(event.target.value))
                    }
                  />
                </label>
              </div>
            </details>
          </div>
        )}

        {tool === "add_subtitles" && (
          <div className="video-tool-body">
            {subtitleEraseConfig &&
              subtitleEraseConfig.rangeMode !== "all" && (
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={useEraseScope}
                    disabled={Boolean(processing)}
                    onChange={(event) =>
                      toggleSubtitleScope(event.target.checked)
                    }
                  />
                  仅在最近擦除字幕的片段中添加
                </label>
              )}
            {subtitles.length > 0 && (
              <>
                <div className="video-tool-subtitles">
                  {subtitles.map((subtitle, index) => (
                    <div
                      className="video-tool-subtitle-row"
                      key={subtitle.id}
                    >
                      <div className="video-tool-subtitle-times">
                        <label>
                          <span>开始</span>
                          <input
                            type="number"
                            min={0}
                            max={duration || undefined}
                            step={0.001}
                            value={
                              Number.isFinite(subtitle.startTime)
                                ? subtitle.startTime
                                : ""
                            }
                            aria-label={`第 ${index + 1} 条字幕开始时间`}
                            disabled={Boolean(processing)}
                            onChange={(event) =>
                              setSubtitles((current) =>
                                current.map((item) =>
                                  item.id === subtitle.id
                                    ? {
                                        ...item,
                                        startTime:
                                          event.target.value === ""
                                            ? Number.NaN
                                            : event.target.valueAsNumber,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>结束</span>
                          <input
                            type="number"
                            min={0}
                            max={duration || undefined}
                            step={0.001}
                            value={
                              Number.isFinite(subtitle.endTime)
                                ? subtitle.endTime
                                : ""
                            }
                            aria-label={`第 ${index + 1} 条字幕结束时间`}
                            disabled={Boolean(processing)}
                            onChange={(event) =>
                              setSubtitles((current) =>
                                current.map((item) =>
                                  item.id === subtitle.id
                                    ? {
                                        ...item,
                                        endTime:
                                          event.target.value === ""
                                            ? Number.NaN
                                            : event.target.valueAsNumber,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                      <label className="video-tool-subtitle-text">
                        <span>字幕</span>
                        <input
                          aria-label={`第 ${index + 1} 条字幕内容`}
                        value={subtitle.subtitleText}
                        disabled={Boolean(processing)}
                        onChange={(event) =>
                          setSubtitles((current) =>
                            current.map((item) =>
                              item.id === subtitle.id
                                ? {
                                    ...item,
                                    subtitleText: event.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <SubtitleStyleControls
                  value={burnStyle}
                  ariaLabelPrefix="前贴"
                  disabled={Boolean(processing)}
                  onChange={setBurnStyle}
                />
              </>
            )}
          </div>
        )}

        {tool === "enhance" && (
          <div className="video-tool-body video-tool-grid two">
            <label className="field">
              <span>输出分辨率</span>
              <select
                value={enhanceResolution}
                disabled={Boolean(processing)}
                onChange={(event) =>
                  setEnhanceResolution(
                    event.target.value as typeof enhanceResolution,
                  )
                }
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="2k">2K</option>
              </select>
            </label>
            <label className="field">
              <span>输出帧率</span>
              <select
                value={enhanceFps}
                disabled={Boolean(processing)}
                onChange={(event) =>
                  setEnhanceFps(Number(event.target.value))
                }
              >
                <option value={24}>24 fps</option>
                <option value={25}>25 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </label>
          </div>
        )}

        {processing && (
          <div className="preroll-review-status" role="status">
            <LoaderCircle className="spin" size={15} />
            {processing}
          </div>
        )}
        {error && (
          <div className="pipeline-callout error">{error}</div>
        )}

        <footer className="modal-actions">
          <button
            className="button ghost"
            type="button"
            disabled={Boolean(processing)}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button primary"
            type="button"
            disabled={
              Boolean(processing) ||
              (tool === "add_subtitles" && subtitles.length === 0)
            }
            onClick={() => {
              if (tool === "erase_subtitles") {
                void submitErase();
              } else if (tool === "add_subtitles") {
                void submitSubtitles();
              } else {
                void submitEnhance();
              }
            }}
          >
            {processing ? (
              <LoaderCircle className="spin" size={15} />
            ) : tool === "erase_subtitles" ? (
              <Eraser size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {tool === "erase_subtitles"
              ? "开始擦除"
              : tool === "add_subtitles"
                ? "添加字幕"
                : "开始增强"}
          </button>
        </footer>
      </section>
    </div>
  );
}
