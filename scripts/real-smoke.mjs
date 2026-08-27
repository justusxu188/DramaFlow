import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "public", "real-demo");

function loadEnv(content) {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(await readFile(path.join(root, ".env.local"), "utf8"));

const config = {
  arkBase: process.env.ARK_BASE_URL,
  arkKey: process.env.ARK_API_KEY,
  videoModel: process.env.ARK_VIDEO_MODEL,
  mediaBase: process.env.MEDIAKIT_BASE_URL,
  mediaKey: process.env.MEDIAKIT_API_KEY,
};

for (const [name, value] of Object.entries(config)) {
  if (!value) throw new Error(`缺少配置 ${name}`);
}

function log(stage, message) {
  console.log(`[${new Date().toISOString()}] ${stage}: ${message}`);
}

async function request(url, options, label) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text.slice(0, 300) };
  }
  if (!response.ok || data.success === false) {
    const requestId =
      response.headers.get("x-request-id") ?? data.request_id ?? "unknown";
    const message = data.error?.message ?? data.message ?? `HTTP ${response.status}`;
    throw new Error(`${label}失败: ${message} (request ${requestId})`);
  }
  return data;
}

function arkHeaders() {
  return {
    Authorization: `Bearer ${config.arkKey}`,
    "Content-Type": "application/json",
  };
}

function mediaHeaders() {
  return {
    Authorization: `Bearer ${config.mediaKey}`,
    "Content-Type": "application/json",
  };
}

async function createVideo({ prompt, duration }) {
  const data = await request(
    `${config.arkBase}/contents/generations/tasks`,
    {
      method: "POST",
      headers: arkHeaders(),
      body: JSON.stringify({
        model: config.videoModel,
        content: [{ type: "text", text: prompt }],
        duration,
        ratio: "9:16",
        resolution: "720p",
        generate_audio: true,
        return_last_frame: true,
        execution_expires_after: 3600,
      }),
    },
    "Seedance 任务创建",
  );
  log("Seedance", `任务已创建 ${data.id}`);
  return data.id;
}

async function pollArkTask(id, timeoutMs = 30 * 60 * 1000) {
  const startedAt = Date.now();
  let previous = "";
  while (Date.now() - startedAt < timeoutMs) {
    const data = await request(
      `${config.arkBase}/contents/generations/tasks/${encodeURIComponent(id)}`,
      { method: "GET", headers: arkHeaders() },
      "Seedance 状态查询",
    );
    if (data.status !== previous) {
      log("Seedance", `${id} -> ${data.status}`);
      previous = data.status;
    }
    if (data.status === "succeeded") return data;
    if (["failed", "expired", "cancelled"].includes(data.status)) {
      throw new Error(`Seedance 任务 ${id} ${data.status}: ${data.error?.message ?? ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 12_000));
  }
  throw new Error(`Seedance 任务 ${id} 超时`);
}

async function createMediaTask(pathname, body, label) {
  const data = await request(
    `${config.mediaBase}${pathname}`,
    {
      method: "POST",
      headers: mediaHeaders(),
      body: JSON.stringify(body),
    },
    label,
  );
  log("MediaKit", `${label}任务已创建 ${data.task_id}`);
  return data.task_id;
}

async function pollMediaTask(id, timeoutMs = 20 * 60 * 1000) {
  const startedAt = Date.now();
  let previous = "";
  while (Date.now() - startedAt < timeoutMs) {
    const data = await request(
      `${config.mediaBase}/tasks/${encodeURIComponent(id)}`,
      { method: "GET", headers: mediaHeaders() },
      "MediaKit 状态查询",
    );
    if (data.status !== previous) {
      log("MediaKit", `${id} -> ${data.status}`);
      previous = data.status;
    }
    if (data.status === "completed") return data;
    if (["failed", "expired", "cancelled"].includes(data.status)) {
      throw new Error(`MediaKit 任务 ${id} ${data.status}: ${data.error?.message ?? ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 8_000));
  }
  throw new Error(`MediaKit 任务 ${id} 超时`);
}

async function download(url, fileName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载 ${fileName} 失败: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(outputDir, fileName), bytes);
  log("产物", `${fileName} 已保存 (${Math.round(bytes.length / 1024)} KB)`);
}

await mkdir(outputDir, { recursive: true });

const sourcePrompt = [
  "竖屏短剧正片，现代豪门宴会厅，电影级写实风格。",
  "年轻女药师林晚被家族当众赶出家门，族谱被撕碎。",
  "突然顾家继承人昏倒，众人慌乱，林晚逆着人群上前，用银针救人。",
  "现场从嘲讽转为震惊，反派脸色骤变。",
  "包含四个清晰镜头切换，中近景和特写，高信息密度，悬念结尾。",
  "人物对白和环境音使用中文，不要字幕、标识、水印。",
].join("");

const prerollPrompt = [
  "竖屏短剧投流前贴，电影级写实风格，强身份反差钩子。",
  "开场一秒族谱在女主面前被撕碎，家主说：从今天起你不再是林家人。",
  "下一秒担架冲入大厅，监护仪报警，所有名医后退。",
  "女主拿出银针冷静说：三分钟，我能救。",
  "中近景快切，前三秒冲突爆发，口播节奏快，结尾银针落下白闪转场。",
  "中文对白，不要字幕、标识、水印。",
].join("");

log("测试", "开始并行生成真实源片与前贴");
const [sourceTaskId, prerollTaskId] = await Promise.all([
  createVideo({ prompt: sourcePrompt, duration: 15 }),
  createVideo({ prompt: prerollPrompt, duration: 10 }),
]);

const [sourceTask, prerollTask] = await Promise.all([
  pollArkTask(sourceTaskId),
  pollArkTask(prerollTaskId),
]);

const sourceUrl = sourceTask.content?.video_url;
const prerollUrl = prerollTask.content?.video_url;
if (!sourceUrl || !prerollUrl) throw new Error("Seedance 成功但未返回视频 URL");

await Promise.all([
  download(sourceUrl, "source.mp4"),
  download(prerollUrl, "preroll.mp4"),
]);

const segmentTaskId = await createMediaTask(
  "/tools/segment-scenes",
  {
    video_url: sourceUrl,
    segment_threshold: 6,
    min_duration: 2,
    enable_clip_fade: true,
  },
  "场景切分",
);
const segmentTask = await pollMediaTask(segmentTaskId);
const segments = segmentTask.result?.segments ?? [];
if (segments.length === 0) throw new Error("场景切分未返回片段");

const rankedSegments = [...segments]
  .map((segment) => ({
    ...segment,
    duration: Number(segment.end_time) - Number(segment.start_time),
  }))
  .sort((a, b) => b.duration - a.duration)
  .slice(0, Math.min(2, segments.length))
  .sort((a, b) => Number(a.start_time) - Number(b.start_time));

const highlightTaskId = await createMediaTask(
  "/tools/concat-video",
  {
    video_urls: rankedSegments.map((segment) => segment.segment_video_url),
    transitions: rankedSegments.length > 1 ? ["1182358"] : undefined,
    client_token: `highlight-${Date.now()}`,
  },
  "高光拼接",
);
const highlightTask = await pollMediaTask(highlightTaskId);
const highlightUrl = highlightTask.result?.video_url;
if (!highlightUrl) throw new Error("高光拼接未返回视频 URL");
await download(highlightUrl, "highlight.mp4");

const finalTaskId = await createMediaTask(
  "/tools/concat-video",
  {
    video_urls: [prerollUrl, highlightUrl],
    transitions: ["1182358"],
    client_token: `final-${Date.now()}`,
  },
  "前贴与高光合成",
);
const finalTask = await pollMediaTask(finalTaskId);
const finalUrl = finalTask.result?.video_url;
if (!finalUrl) throw new Error("最终合成未返回视频 URL");
await download(finalUrl, "final.mp4");

const result = {
  testedAt: new Date().toISOString(),
  mode: "real",
  source: {
    taskId: sourceTaskId,
    localUrl: "/real-demo/source.mp4",
    duration: sourceTask.duration,
  },
  preroll: {
    taskId: prerollTaskId,
    localUrl: "/real-demo/preroll.mp4",
    duration: prerollTask.duration,
  },
  segmentation: {
    taskId: segmentTaskId,
    segmentCount: segments.length,
    selectedSegments: rankedSegments.map((segment) => ({
      start: segment.start_time,
      end: segment.end_time,
      duration: segment.duration,
    })),
  },
  highlight: {
    taskId: highlightTaskId,
    localUrl: "/real-demo/highlight.mp4",
    duration: highlightTask.result?.duration,
  },
  final: {
    taskId: finalTaskId,
    localUrl: "/real-demo/final.mp4",
    duration: finalTask.result?.duration,
    resolution: finalTask.result?.resolution,
  },
};

await writeFile(
  path.join(outputDir, "result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
log("完成", "真实前贴、高光和最终成片均已生成");
