import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadLocalFileToTos } from "@/lib/tos";

export type SubtitleVideoPreparation = {
  videoUrl: string;
  normalized: boolean;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
};

function executable(
  configured: string | undefined,
  candidates: string[],
) {
  return [configured, ...candidates]
    .filter((candidate): candidate is string => Boolean(candidate))
    .find((candidate) =>
      !candidate.includes("/") || existsSync(candidate)
    ) ?? candidates.at(-1)!;
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      /* turbopackIgnore: true */
      command,
      args,
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("字幕输入视频规范化超时"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(`字幕输入视频规范化启动失败：${error.message}`),
      );
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `字幕输入视频规范化失败：${
              stderr.trim() || `${command} 退出码 ${code}`
            }`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

function even(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function subtitleNormalizationDimensions(
  width: number,
  height: number,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("无法读取字幕输入视频分辨率");
  }
  if (Math.min(width, height) >= 720) {
    return { width, height, required: false };
  }

  const ratio = width / height;
  const presets = [
    { ratio: 16 / 9, width: 1280, height: 720 },
    { ratio: 9 / 16, width: 720, height: 1280 },
    { ratio: 4 / 3, width: 960, height: 720 },
    { ratio: 3 / 4, width: 720, height: 960 },
    { ratio: 1, width: 720, height: 720 },
  ];
  const preset = presets.find(
    (item) => Math.abs(item.ratio - ratio) / item.ratio <= 0.01,
  );
  if (preset) {
    return {
      width: preset.width,
      height: preset.height,
      required: true,
    };
  }
  return width >= height
    ? {
        width: even(width * (720 / height)),
        height: 720,
        required: true,
      }
    : {
        width: 720,
        height: even(height * (720 / width)),
        required: true,
      };
}

async function downloadVideo(remoteUrl: string, localPath: string) {
  await runProcess(
    executable(process.env.CURL_PATH, [
      "/usr/bin/curl",
      "curl",
    ]),
    [
      "-L",
      "--fail",
      "--silent",
      "--show-error",
      "--retry",
      "3",
      "--retry-all-errors",
      "--connect-timeout",
      "15",
      "--max-time",
      "180",
      "-o",
      localPath,
      remoteUrl,
    ],
    210_000,
  );
}

async function probeVideo(localPath: string) {
  const stdout = await runProcess(
    executable(process.env.FFPROBE_PATH, [
      "/opt/homebrew/bin/ffprobe",
      "/usr/local/bin/ffprobe",
      "ffprobe",
    ]),
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      localPath,
    ],
    30_000,
  );
  const stream = (
    JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number }>;
    }
  ).streams?.[0];
  return {
    width: Number(stream?.width),
    height: Number(stream?.height),
  };
}

export async function prepareVideoForSubtitleBurn(input: {
  sourceVideoUrl: string;
  projectId: string;
  projectName?: string;
  runId?: string;
  fileName: string;
}): Promise<SubtitleVideoPreparation> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "frameflow-subtitle-input-"),
  );
  const sourcePath = path.join(directory, "source.mp4");
  const outputPath = path.join(directory, "normalized.mp4");
  try {
    await downloadVideo(input.sourceVideoUrl, sourcePath);
    const source = await probeVideo(sourcePath);
    const target = subtitleNormalizationDimensions(
      source.width,
      source.height,
    );
    if (!target.required) {
      return {
        videoUrl: input.sourceVideoUrl,
        normalized: false,
        sourceWidth: source.width,
        sourceHeight: source.height,
        outputWidth: source.width,
        outputHeight: source.height,
      };
    }

    await runProcess(
      executable(process.env.FFMPEG_PATH, [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "ffmpeg",
      ]),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        `scale=${target.width}:${target.height}:flags=lanczos,fps=30`,
        "-c:v",
        "libx264",
        "-profile:v",
        "main",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
      600_000,
    );
    const stored = await uploadLocalFileToTos({
      localPath: outputPath,
      projectId: input.projectId,
      projectName: input.projectName,
      runId: input.runId,
      stage: "postproduction",
      fileName: input.fileName,
      contentType: "video/mp4",
    });
    return {
      videoUrl: stored.sourceUrl,
      normalized: true,
      sourceWidth: source.width,
      sourceHeight: source.height,
      outputWidth: target.width,
      outputHeight: target.height,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
