/**
 * 一次性恢复脚本：重置因公网链路瞬时抖动被误判 failed 的 preroll 任务。
 *
 * 背景：2026-09-01 ECS→火山公网连接层抖动，ARK 侧视频任务实际全部 succeeded，
 * 但流水线因无超时/无退避将任务标记 failed。本脚本把这类 job 重置为 queued，
 * 由修复后的 worker 自动继续：轮询 ARK（任务已成功）→ 取新鲜签名 URL →
 * 转存 TOS → 标记完成，零视频重生成成本。
 *
 * 用法：
 *   node scripts/recover-fetch-failed-jobs.mjs           # dry-run，只打印
 *   node scripts/recover-fetch-failed-jobs.mjs --apply   # 实际写回（自动备份）
 */
import { readFileSync, writeFileSync, renameSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const storePath = join(process.cwd(), "data", "pipeline-store.json");

const NETWORK_ERROR_PATTERN =
  /fetch failed|网络波动|连接失败|请求超时|下载供应商产物|转存供应商产物|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR/i;

const raw = JSON.parse(readFileSync(storePath, "utf8"));
const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];

const toReset = [];
const toClearError = [];
for (const job of jobs) {
  if (job.kind !== "preroll") continue;
  if (job.status === "failed" && NETWORK_ERROR_PATTERN.test(job.error ?? "")) {
    toReset.push(job);
  } else if (
    job.status === "completed" &&
    typeof job.error === "string" &&
    job.error.length > 0 &&
    NETWORK_ERROR_PATTERN.test(job.error)
  ) {
    toClearError.push(job);
  }
}

console.log(`[recover] matched ${toReset.length} failed preroll job(s) to requeue, ${toClearError.length} completed job(s) with stale error`);
for (const job of toReset) {
  const segmentCount = Array.isArray(job.input?.segmentTaskIds)
    ? job.input.segmentTaskIds.filter(Boolean).length
    : 0;
  console.log(
    `  - RESET ${job.id} progress=${job.progress} attempts=${job.attempts} phase=${job.input?.prerollPhase ?? "-"} segments=${segmentCount} error=${(job.error ?? "").slice(0, 120)}`,
  );
}
for (const job of toClearError) {
  console.log(
    `  - CLEAR-ERROR ${job.id} status=${job.status} error=${(job.error ?? "").slice(0, 120)}`,
  );
}

if (!APPLY) {
  console.log("[recover] dry-run only; re-run with --apply to write changes");
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(
  process.cwd(),
  "data",
  `pipeline-store.before-recover-${timestamp}.json`,
);
copyFileSync(storePath, backupPath);
console.log(`[recover] backup written: ${backupPath}`);

const now = new Date().toISOString();
for (const job of toReset) {
  job.status = "queued";
  job.attempts = 0;
  job.error = undefined;
  job.runAfter = undefined;
  job.completedAt = undefined;
  job.updatedAt = now;
}
for (const job of toClearError) {
  job.error = undefined;
  job.updatedAt = now;
}

const tmpPath = `${storePath}.tmp-${process.pid}`;
writeFileSync(tmpPath, JSON.stringify(raw, null, 2));
renameSync(tmpPath, storePath);
console.log(
  `[recover] done: ${toReset.length} job(s) requeued, ${toClearError.length} error(s) cleared. Worker will pick them up within seconds.`,
);
