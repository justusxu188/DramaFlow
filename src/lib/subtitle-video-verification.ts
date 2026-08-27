import { existsSync } from "node:fs";
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

export type SubtitleVerificationEvidence = {
  status: "verified";
  method: "ffmpeg_frame_difference_v1";
  sampleTimes: number[];
  strongDifferenceScores: number[];
  verifiedAt: string;
};

type SubtitleTiming = {
  startTime: number;
  endTime: number;
};

const minimumStrongDifferenceScore = 0.2;
const strongPixelDifferenceThreshold = 18;

function ffmpegPath() {
  const candidates = [
    process.env.FFMPEG_PATH,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) =>
    candidate === "ffmpeg" || existsSync(candidate)
  ) ?? "ffmpeg";
}

function sampleTimes(subtitles: SubtitleTiming[]) {
  const samples: number[] = [];
  for (const subtitle of subtitles) {
    const start = Math.max(0, subtitle.startTime);
    const end = Math.max(start, subtitle.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    const midpoint = Number(((start + end) / 2).toFixed(3));
    if (samples.every((sample) => Math.abs(sample - midpoint) >= 0.25)) {
      samples.push(midpoint);
    }
    if (samples.length === 3) break;
  }
  return samples;
}

async function downloadVideo(
  remoteUrl: string,
  localPath: string,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      /* turbopackIgnore: true */
      process.env.CURL_PATH ?? "/usr/bin/curl",
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
        "120",
        "-o",
        localPath,
        remoteUrl,
      ],
    );
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });
    child.once("error", (error) => {
      reject(
        new Error(
          `字幕画面验收下载启动失败：${error.message}`,
        ),
      );
    });
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `字幕画面验收下载视频失败：${
              errorOutput.trim() ||
              `curl 退出码 ${code}`
            }`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

function measureStrongDifference(
  sourceVideoUrl: string,
  outputVideoUrl: string,
  sampleTime: number,
) {
  return new Promise<number>((resolve, reject) => {
    const filter = [
      "[0:v]scale=854:480,format=gray[source]",
      "[1:v]scale=854:480,format=gray[output]",
      "[source][output]blend=all_mode=difference",
      `lut=y='if(gte(val,${strongPixelDifferenceThreshold}),255,0)'`,
      "signalstats",
      "metadata=print:file=-",
    ].join(",");
    const child = spawn(
      /* turbopackIgnore: true */
      ffmpegPath(),
      [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(sampleTime),
      "-i",
      sourceVideoUrl,
      "-ss",
      String(sampleTime),
      "-i",
      outputVideoUrl,
      "-filter_complex",
      filter,
      "-frames:v",
      "1",
      "-f",
      "null",
        "-",
      ],
    );
    let output = "";
    let errorOutput = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("字幕画面验收超时"));
    }, 45_000);

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          error.message.includes("ENOENT")
            ? "服务器未安装 FFmpeg，无法验收字幕画面"
            : `字幕画面验收启动失败：${error.message}`,
        ),
      );
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `字幕画面验收失败：${errorOutput.trim() || `FFmpeg 退出码 ${code}`}`,
          ),
        );
        return;
      }
      const score = Number(
        output.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/)?.[1],
      );
      if (!Number.isFinite(score)) {
        reject(new Error("字幕画面验收未能读取帧差结果"));
        return;
      }
      resolve(score);
    });
  });
}

export async function verifyBurnedSubtitles(input: {
  sourceVideoUrl: string;
  outputVideoUrl: string;
  subtitles: SubtitleTiming[];
}): Promise<SubtitleVerificationEvidence> {
  const times = sampleTimes(input.subtitles);
  if (!times.length) {
    throw new Error("没有可用于画面验收的字幕时间点");
  }
  const directory = await mkdtemp(
    path.join(tmpdir(), "frameflow-subtitle-"),
  );
  const sourcePath = path.join(directory, "source.mp4");
  const outputPath = path.join(directory, "output.mp4");
  let scores: number[];
  try {
    await Promise.all([
      downloadVideo(input.sourceVideoUrl, sourcePath),
      downloadVideo(input.outputVideoUrl, outputPath),
    ]);
    scores = await Promise.all(
      times.map((time) =>
        measureStrongDifference(
          sourcePath,
          outputPath,
          time,
        )
      ),
    );
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
  if (
    scores.some((score) => score < minimumStrongDifferenceScore)
  ) {
    throw new Error(
      "字幕任务已完成，但抽帧验收未检测到可见字幕，已禁止保存和拼接",
    );
  }
  return {
    status: "verified",
    method: "ffmpeg_frame_difference_v1",
    sampleTimes: times,
    strongDifferenceScores: scores.map((score) =>
      Number(score.toFixed(4))
    ),
    verifiedAt: new Date().toISOString(),
  };
}
