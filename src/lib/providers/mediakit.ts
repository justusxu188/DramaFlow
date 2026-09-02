import { normalizeProviderStatus } from "@/lib/domain";
import { env } from "@/lib/env";
import {
  isTransientNetworkError,
  timeoutError,
  wrapFetchError,
} from "@/lib/network-errors";
import type {
  CreativeProvider,
  HighlightResult,
  StorylineResult,
} from "./types";

type MediaKitResponse = {
  success: boolean;
  task_id: string;
  request_id?: string;
  status?: string;
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string };
};

export class MediaKitProvider
  implements
    Pick<
      CreativeProvider,
      | "analyzeStoryline"
      | "restoreDramaScript"
      | "segmentScenes"
      | "createHighlight"
      | "extractFrames"
      | "getMediaTask"
      | "concatVideos"
    >
{
  private async request<T>(
    path: string,
    init: RequestInit,
    timeoutMs: number = env.MEDIAKIT_TIMEOUT_MS ?? 120000,
  ): Promise<T> {
    if (!env.MEDIAKIT_API_KEY) throw new Error("MEDIAKIT_API_KEY 未配置");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${env.MEDIAKIT_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.MEDIAKIT_API_KEY}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw timeoutError(
          `MediaKit 请求超时（${Math.round(timeoutMs / 1000)} 秒，网络波动将自动重试）`,
        );
      }
      throw wrapFetchError(error, "MediaKit 服务");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? "unknown";
      throw new Error(
        `MediaKit 请求失败 (${response.status}, request: ${requestId})`,
      );
    }
    return (await response.json()) as T;
  }

  /**
   * 轮询类 GET 请求：瞬时网络错误自动重试（2s/4s 退避），
   * 避免一次连接抖动直接判任务失败。
   */
  private async requestWithRetry<T>(
    path: string,
    init: RequestInit,
    timeoutMs?: number,
    retries = 2,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.request<T>(path, init, timeoutMs);
      } catch (error) {
        lastError = error;
        if (!isTransientNetworkError(error) || attempt === retries) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * (attempt + 1)),
        );
      }
    }
    throw lastError;
  }

  async analyzeStoryline(input: {
    videoUrls: string[];
    clientToken: string;
    enableSnapshot?: boolean;
  }) {
    const data = await this.request<MediaKitResponse>(
      "/tools/analyze-video-storyline",
      {
        method: "POST",
        body: JSON.stringify({
          video_urls: input.videoUrls,
          enable_snapshot: input.enableSnapshot ?? false,
          client_token: input.clientToken.slice(0, 64),
        }),
      },
    );
    if (!data.success) throw new Error(data.error?.message ?? "剧情故事线分析创建失败");
    return { id: data.task_id, status: "queued" as const, progress: 2 };
  }

  async restoreDramaScript(input: { videoUrls: string[]; clientToken: string }) {
    const data = await this.request<MediaKitResponse>("/tools/drama-script", {
      method: "POST",
      body: JSON.stringify({
        video_urls: input.videoUrls,
        return_pkg: "false",
        client_token: input.clientToken.slice(0, 64),
      }),
    });
    if (!data.success) throw new Error(data.error?.message ?? "剧本还原任务创建失败");
    return { id: data.task_id, status: "queued" as const, progress: 2 };
  }

  async segmentScenes(input: { videoUrl: string }) {
    const data = await this.request<MediaKitResponse>("/tools/segment-scenes", {
      method: "POST",
      body: JSON.stringify({
        video_url: input.videoUrl,
        segment_threshold: 10,
        min_duration: 4,
        enable_clip_fade: true,
      }),
    });
    if (!data.success) throw new Error(data.error?.message ?? "场景切分失败");
    return { id: data.task_id, status: "queued" as const, progress: 5 };
  }

  async extractFrames(input: {
    videoUrl: string;
    timestamps: number[];
    clientToken: string;
  }) {
    const data = await this.request<MediaKitResponse>(
      "/tools/extract-frames",
      {
        method: "POST",
        body: JSON.stringify({
          video_url: input.videoUrl,
          snapshot_type: "SpecifiedTime",
          specified_time: input.timestamps,
          scale_long: 1920,
          scale_short: 1080,
          enable_sprite: false,
          client_token: input.clientToken.slice(0, 64),
        }),
      },
    );
    if (!data.success) {
      throw new Error(data.error?.message ?? "视频抽帧任务创建失败");
    }
    return {
      id: data.task_id,
      status: "queued" as const,
      progress: 5,
    };
  }

  async createHighlight(input: {
    videoUrls: string[];
    mode: Parameters<CreativeProvider["createHighlight"]>[0]["mode"];
    title?: string;
    prompt?: string;
    clientToken?: string;
    settings?: Parameters<CreativeProvider["createHighlight"]>[0]["settings"];
  }) {
    const settings = input.settings;
    const cutMode = settings?.cutMode ?? (input.mode !== "text" ? "Mixed" : "Sequential");
    const usesTemplate =
      settings?.template !== "none";
    const usesMixedCuts = cutMode === "Mixed";
    const rawHint =
      settings?.hint?.trim() ||
      (settings ? "" : "点击下方看完整版");
    const hint = rawHint === "无" ? "" : rawHint;
    const usesHint = Boolean(hint);
    const data = await this.request<MediaKitResponse>(
      "/tools/generate-highlights-microdrama",
      {
        method: "POST",
        body: JSON.stringify({
          video_urls: input.videoUrls,
          mode: "StorylineCuts",
          enable_return_poster: true,
          enable_segment_tag: true,
          ...(usesTemplate
            ? {
                edit_param: {
                  mode: "TemplateEdit",
                  template_edit: {
                    template:
                      settings?.template ??
                      "热门短剧1",
                    title: (
                      input.title ?? "热门短剧"
                    ).slice(0, 22),
                    ...(usesHint
                      ? { hint: hint.slice(0, 20) }
                      : {}),
                  },
                },
              }
            : {}),
          highlight_cuts_param: {
            enable_storyboard: true,
            min_duration:
              settings?.minDuration ?? 30,
            max_duration:
              settings?.maxDuration ?? 90,
            max_number: settings?.maxNumber ?? 2,
            cut_mode: cutMode,
            ...(usesMixedCuts
              ? {
                  highlight_segment_prompt:
                    settings?.segmentPrompt ||
                    input.prompt,
                  highlight_start_prompt:
                    settings?.startPrompt ||
                    (input.prompt
                      ? `目标：极短时间制造钩子。优先选择：${input.prompt}。形式：从完整冲突台词或明确动作开始。`
                      : undefined),
                  highlight_ending_prompt:
                    settings?.endingPrompt ||
                    "目标：留下强悬念。优先选择新的冲突、关键证据或身份揭露。形式：落在完整台词或明确动作上。",
                }
              : {}),
          },
          opening_hook_param: {
            enable_opening_hook:
              usesMixedCuts &&
              (settings?.enableOpeningHook ?? true),
            ...(usesMixedCuts &&
            (settings?.enableOpeningHook ?? true)
              ? {
                  min_duration:
                    settings?.openingHookMinDuration ??
                    5,
                  max_duration:
                    settings?.openingHookMaxDuration ??
                    10,
                  min_clip_duration:
                    settings?.openingHookMinDuration ??
                    5,
                  min_score:
                    settings?.openingHookMinScore ??
                    3.5,
                  opening_hook_prompt:
                    settings?.openingHookPrompt ||
                    input.prompt,
                }
              : {}),
          },
          client_token: (input.clientToken ?? crypto.randomUUID()).slice(0, 64),
        }),
      },
    );
    if (!data.success) throw new Error(data.error?.message ?? "高光任务创建失败");
    return { id: data.task_id, status: "queued" as const, progress: 5 };
  }

  async concatVideos(input: {
    videoUrls: string[];
    transitions?: string[];
    clientToken: string;
  }) {
    const transitions = input.transitions
      ?.filter((item) => /^\d+$/.test(item))
      .map(Number);
    const data = await this.request<MediaKitResponse>("/tools/concat-video", {
      method: "POST",
      body: JSON.stringify({
        video_urls: input.videoUrls,
        ...(transitions?.length ? { transitions } : {}),
        client_token: input.clientToken,
      }),
    });
    if (!data.success) throw new Error(data.error?.message ?? "视频拼接失败");
    return { id: data.task_id, status: "queued" as const, progress: 5 };
  }

  private async createVideoToolTask(
    path: string,
    body: Record<string, unknown>,
    fallbackError: string,
  ) {
    const data = await this.request<MediaKitResponse>(
      path,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    if (!data.success) {
      throw new Error(
        data.error?.message ?? fallbackError,
      );
    }
    return {
      id: data.task_id,
      status: "queued" as const,
      progress: 5,
    };
  }

  enhanceVideo(input: {
    videoUrl: string;
    resolution: "720p" | "1080p" | "2k";
    fps?: number;
  }) {
    return this.createVideoToolTask(
      "/tools/enhance-video-generative",
      {
        video_url: input.videoUrl,
        resolution: input.resolution,
        ...(input.fps ? { fps: input.fps } : {}),
      },
      "画质增强任务创建失败",
    );
  }

  eraseVideoSubtitles(input: {
    videoUrl: string;
    modelVersion?: "v4" | "v5";
    timeSegmentFilter?: {
      mode: "selected" | "skip";
      segments: Array<{
        startTime: number;
        endTime: number;
      }>;
    };
    eraseRatioLocations?: Array<{
      topLeftX: number;
      topLeftY: number;
      bottomRightX: number;
      bottomRightY: number;
    }>;
    subtitleFilter?: {
      minTextHeightRatio?: number;
      maxTextHeightRatio?: number;
      centerOffsetRatio?: number;
    };
  }) {
    return this.createVideoToolTask(
      "/tools/erase-video-subtitle-pro",
      {
        video_url: input.videoUrl,
        mode: "Subtitle",
        model_version: input.modelVersion ?? "v5",
        ...(input.timeSegmentFilter
          ? {
              time_segment_filter: {
                mode: input.timeSegmentFilter.mode,
                segments:
                  input.timeSegmentFilter.segments.map(
                    (segment) => ({
                      start_time: segment.startTime,
                      end_time: segment.endTime,
                    }),
                  ),
              },
            }
          : {}),
        ...(input.eraseRatioLocations?.length
          ? {
              erase_ratio_location:
                input.eraseRatioLocations.map((location) => ({
                  top_left_x: location.topLeftX,
                  top_left_y: location.topLeftY,
                  bottom_right_x: location.bottomRightX,
                  bottom_right_y: location.bottomRightY,
                })),
            }
          : {}),
        ...(input.subtitleFilter
          ? {
              subtitle_filter: {
                ...(input.subtitleFilter.minTextHeightRatio !==
                undefined
                  ? {
                      min_text_height_ratio:
                        input.subtitleFilter.minTextHeightRatio,
                    }
                  : {}),
                ...(input.subtitleFilter.maxTextHeightRatio !==
                undefined
                  ? {
                      max_text_height_ratio:
                        input.subtitleFilter.maxTextHeightRatio,
                    }
                  : {}),
                ...(input.subtitleFilter.centerOffsetRatio !==
                undefined
                  ? {
                      center_offset_ratio:
                        input.subtitleFilter.centerOffsetRatio,
                    }
                  : {}),
              },
            }
          : {}),
      },
      "字幕擦除任务创建失败",
    );
  }

  trimVideo(input: {
    videoUrl: string;
    startTime: number;
    endTime: number;
  }) {
    return this.createVideoToolTask(
      "/tools/trim-video",
      {
        video_url: input.videoUrl,
        start_time: input.startTime,
        end_time: input.endTime,
      },
      "视频裁剪任务创建失败",
    );
  }

  adjustVideoSpeed(input: {
    videoUrl: string;
    speed: number;
  }) {
    return this.createVideoToolTask(
      "/tools/adjust-video-speed",
      {
        video_url: input.videoUrl,
        speed: input.speed,
      },
      "视频调速任务创建失败",
    );
  }

  createAsrSubtitles(input: {
    videoUrl: string;
    language?: "cmn-Hans-CN" | "eng-US";
    enableSpeakerInfo?: boolean;
  }) {
    return this.createVideoToolTask(
      "/tools/asr-subtitles",
      {
        video_url: input.videoUrl,
        ...(input.language
          ? { language: input.language }
          : {}),
        enable_speaker_info:
          input.enableSpeakerInfo ?? true,
      },
      "语音转字幕任务创建失败",
    );
  }

  addSubtitlesToVideo(input: {
    videoUrl: string;
    subtitles: Array<{
      subtitleText: string;
      startTime: number;
      endTime: number;
    }>;
    fontType?: "sy_black" | "pm_zhengdao" | "zhanku_kuaile";
    fontSize?: number;
    fontColor?: string;
    position?: "bottom_center" | "top_center" | "center" | "lower_third";
    clientToken?: string;
  }) {
    return this.createVideoToolTask(
      "/tools/add-subtitle-to-video",
      {
        video_url: input.videoUrl,
        subtitles: input.subtitles.map((subtitle) => ({
          subtitle_text: subtitle.subtitleText,
          start_time: subtitle.startTime,
          end_time: subtitle.endTime,
        })),
        subtitle_font_type: input.fontType ?? "sy_black",
        subtitle_font_size: input.fontSize ?? 50,
        subtitle_font_color:
          input.fontColor ?? "#FFFFFFFF",
        subtitle_pos_preset:
          input.position ?? "bottom_center",
        ...(input.clientToken
          ? { client_token: input.clientToken.slice(0, 64) }
          : {}),
      },
      "视频加字幕任务创建失败",
    );
  }

  async getTask(id: string) {
    const data = await this.requestWithRetry<MediaKitResponse>(
      `/tasks/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    const status = normalizeProviderStatus(data.status ?? "failed");
    const result = data.result;
    return {
      id: data.task_id,
      status,
      progress: status === "completed" ? 100 : status === "running" ? 62 : 8,
      videoUrl: typeof result?.video_url === "string" ? result.video_url : undefined,
      result: status === "completed" ? this.normalizeResult(id, result ?? {}) : undefined,
      error: data.error?.message,
      requestId: data.request_id,
      resolution:
        typeof result?.resolution === "string"
          ? result.resolution
          : undefined,
      duration:
        typeof result?.duration === "number"
          ? result.duration
          : undefined,
    };
  }

  private normalizeResult(id: string, result: Record<string, unknown>) {
    if (id.includes("analyze-video-storyline")) {
      const sources = (result.source_video_info ?? []) as Array<Record<string, unknown>>;
      const clips = (result.storyline_clips ?? []) as Array<Record<string, unknown>>;
      const highlights = (result.storyline_highlights ?? []) as Array<Record<string, unknown>>;
      return {
        duration: Number(result.duration ?? 0),
        sourceVideoInfo: sources.map((item) => ({
          index: Number(item.source_video_index),
          url: String(item.source_video_url ?? ""),
          title: String(item.source_video_title ?? ""),
          summary: String(item.source_video_summary ?? ""),
          tags: Array.isArray(item.source_video_tag) ? item.source_video_tag.map(String) : [],
        })),
        clips: clips.map((item) => ({
          index: Number(item.clip_index),
          sourceVideoIndex: Number(item.source_video_index),
          title: String(item.clip_title ?? ""),
          summary: String(item.clip_summary ?? ""),
          dialogue: String(item.clip_dialogue ?? ""),
          score: Number(item.clip_score ?? 0),
          start: Number(item.clip_start_time ?? 0),
          end: Number(item.clip_end_time ?? 0),
          snapshotUrl: item.clip_snapshot_url ? String(item.clip_snapshot_url) : undefined,
        })),
        highlights: highlights.map((item) => ({
          index: Number(item.highlight_index),
          title: String(item.highlight_title ?? ""),
          summary: String(item.highlight_summary ?? ""),
          clipIndexes: Array.isArray(item.highlight_clips_index)
            ? item.highlight_clips_index.map(Number)
            : [],
        })),
      } satisfies StorylineResult;
    }

    if (id.includes("generate-highlights") || id.includes("highlight-miniseries")) {
      const variants = (result.mixvideo_info ?? []) as Array<Record<string, unknown>>;
      const storyboard = (result.storyboard_info ?? []) as Array<Record<string, unknown>>;
      return {
        duration: Number(result.duration ?? 0),
        videoUrls: Array.isArray(result.video_urls) ? result.video_urls.map(String) : [],
        variants: variants.map((item) => ({
          index: Number(item.mixvideo_index),
          duration: Number(item.duration ?? 0),
          size: Number(item.size ?? 0),
          videoUrl: String(item.video_url ?? ""),
          posterUrl: item.poster_url ? String(item.poster_url) : undefined,
          clips: ((item.clips ?? []) as Array<Record<string, unknown>>).map((clip) => ({
            type: String(clip.clip_type ?? ""),
            score: Number(clip.score ?? 0),
            sourceVideoIndex: Number(clip.source_video_index),
            sourceStart: Number(clip.source_start_time ?? 0),
            sourceEnd: Number(clip.source_end_time ?? 0),
            cutStart: Number(clip.cut_start_time ?? 0),
            cutEnd: Number(clip.cut_end_time ?? 0),
            tags: Array.isArray(clip.tags) ? clip.tags.map(String) : [],
          })),
        })),
        storyboard: storyboard.map((item) => ({
          sourceVideoIndex: Number(item.source_video_index),
          start: Number(item.start_time ?? 0),
          end: Number(item.end_time ?? 0),
          score: Number(item.score ?? 0),
          ocr: String(item.ocr ?? ""),
          description: String(item.description ?? ""),
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        })),
      } satisfies HighlightResult;
    }

    return result;
  }

  getMediaTask(id: string) {
    return this.getTask(id);
  }
}
