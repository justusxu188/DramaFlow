// DramaFlow real-mode credential & endpoint self-check.
//
// Zero external dependencies (stdlib Node.js only).
// Mirrors the hard assertions in src/lib/env.ts assertRealProviderConfig().
//
// Usage (deploy-real-mode.sh invokes this automatically):
//   sudo -u frameflow bash -lc 'set -a; . /etc/frameflow.env; set +a; \
//     node /opt/frameflow/deploy/real-mode/check-real-config.mjs'
//
// Exit codes:
//   0  — every REQUIRED key is SET (non-empty) and schema sanity passes.
//   1  — one or more REQUIRED keys are missing. Prints a human-readable list.
//   2  — env file / provider mode / arguments are malformed.
//
// NOTE: this script inspects process.env because the caller is expected to have
// sourced /etc/frameflow.env into the environment beforehand. It does NOT read
// the file directly.

const REQUIRED_EXACT = [
  "ARK_API_KEY",
  "ARK_TEXT_MODEL_SEED_2_1_PRO",
  "MEDIAKIT_API_KEY",
];

const IMAGE_AT_LEAST_ONE = [
  "ARK_IMAGE_MODEL",
  "ARK_IMAGE_MODEL_SEEDREAM_5_0_LITE",
  "ARK_IMAGE_MODEL_SEEDREAM_5_0_PRO",
];

const VIDEO_AT_LEAST_ONE = [
  "ARK_VIDEO_MODEL",
  "ARK_VIDEO_MODEL_SEEDANCE_2_5",
  "ARK_VIDEO_MODEL_SEEDANCE_2_0",
  "ARK_VIDEO_MODEL_SEEDANCE_2_0_MINI",
  "ARK_VIDEO_MODEL_SEEDANCE_2_0_FAST",
];

const STRONG_RECOMMEND = [
  "ARK_ASSETS_ACCESS_KEY_ID",
  "ARK_ASSETS_SECRET_ACCESS_KEY",
  "TOS_ENDPOINT",
  "TOS_BUCKET",
  "TOS_ACCESS_KEY_ID",
  "TOS_SECRET_ACCESS_KEY",
];

const ALL_CHECKED_KEYS = [
  "PROVIDER_MODE",
  ...REQUIRED_EXACT,
  "ARK_TEXT_MODEL_SEED_2_0_LITE",
  ...IMAGE_AT_LEAST_ONE,
  ...VIDEO_AT_LEAST_ONE,
  ...STRONG_RECOMMEND,
  "ARK_ASSETS_PROJECT_NAME",
  "ARK_BASE_URL",
  "ARK_ASSETS_BASE_URL",
  "MEDIAKIT_BASE_URL",
  "TOS_REGION",
  "VOLCENGINE_VOD_ACCESS_KEY_ID",
  "VOLCENGINE_VOD_SECRET_ACCESS_KEY",
  "VOD_REGION",
  "VOD_SPACE_NAME",
  "VOD_BUCKET_NAME",
  "VOD_PLAY_DOMAIN",
  "VOD_WATERMARK_WORKFLOW_ID",
  "VOD_WATERMARK_TEMPLATE_ID",
  "VOD_IMAGE_WATERMARK_TEMPLATE_ID",
  "VOD_TEXT_WATERMARK_TEMPLATE_ID",
  "VOD_TEXT_WATERMARK_VARIABLE_KEY",
  "ARK_VIDEO_MAX_DURATION",
];

function setLen(v) {
  if (v === undefined || v === null) return 0;
  const s = String(v);
  return s.length;
}

function strip(v) {
  if (v === undefined || v === null) return "";
  let s = String(v);
  // Strip exactly one pair of surrounding double OR single quotes (if present).
  // Kept regex-free to ease minimal static scanners and reader comprehension.
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      s = s.slice(1, -1);
    }
  }
  return s.trim();
}

// Minimal charset check (regex-free) for a "reasonable" endpoint ID.
// Ark接入点 IDs always look like "ep-" followed by >= 15 chars of [A-Za-z0-9-].
function looksLikeEndpointId(v) {
  if (typeof v !== "string") return false;
  if (!v.startsWith("ep-")) return false;
  const tail = v.slice(3);
  if (tail.length < 15) return false;
  for (let i = 0; i < tail.length; i++) {
    const c = tail.charCodeAt(i);
    const ok =
      (c >= 0x30 && c <= 0x39) || // 0-9
      (c >= 0x41 && c <= 0x5a) || // A-Z
      (c >= 0x61 && c <= 0x7a) || // a-z
      c === 0x2d;                 // hyphen
    if (!ok) return false;
  }
  return true;
}

const env = Object.fromEntries(
  ALL_CHECKED_KEYS.map((k) => [k, strip(process.env[k])]),
);

const providerMode = env.PROVIDER_MODE;
if (providerMode === "" || providerMode === "mock") {
  console.error(
    "[SELF_CHECK] PROVIDER_MODE is '%s'. This checker only validates real-mode. " +
      "Set PROVIDER_MODE=real in the env file first.",
    providerMode || "(empty)",
  );
  process.exit(2);
}
if (providerMode !== "real") {
  console.error(
    "[SELF_CHECK] PROVIDER_MODE=%s is not supported by the real-mode template.",
    providerMode,
  );
  process.exit(2);
}

// Print a per-key status table (never prints values, only SET/EMPTY + length).
console.log("DramaFlow real-mode credential self-check\n");
console.log(
  "key".padEnd(48, " ") +
    "status".padEnd(8, " ") +
    "len",
);
console.log("-".repeat(68));

for (const k of ALL_CHECKED_KEYS) {
  const v = env[k];
  const len = setLen(v);
  const status = len > 0 ? "SET" : "EMPTY";
  const tag =
    REQUIRED_EXACT.includes(k) ? "*" :
    IMAGE_AT_LEAST_ONE.includes(k) ? "i" :
    VIDEO_AT_LEAST_ONE.includes(k) ? "v" :
    STRONG_RECOMMEND.includes(k) ? "+" : " ";
  const keyStr = `${tag} ${k}`;
  console.log(
    keyStr.padEnd(48, " ") + status.padEnd(8, " ") + String(len).padStart(4, " "),
  );
}
console.log();
console.log("Legend:  * REQUIRED      i 至少 1 个 SET (Image/Seedream)");
console.log("         v 至少 1 个 SET (Video/Seedance)");
console.log("         + STRONG RECOMMEND (无则真实上传/存储链路会报错)");
console.log();

// ---- hard assertions ------------------------------------------------------
const missing = [];
for (const k of REQUIRED_EXACT) if (setLen(env[k]) === 0) missing.push(k);

if (IMAGE_AT_LEAST_ONE.every((k) => setLen(env[k]) === 0))
  missing.push("至少一个 ARK_IMAGE_MODEL(_SEEDREAM_5_0_*)");
if (VIDEO_AT_LEAST_ONE.every((k) => setLen(env[k]) === 0))
  missing.push("至少一个 ARK_VIDEO_MODEL(_SEEDANCE_*)");

// Format sanity:
//   · Model/endpoint IDs should be ep-xxxxxxxxxxxxxxx-style strings.
for (const k of [...IMAGE_AT_LEAST_ONE, ...VIDEO_AT_LEAST_ONE, "ARK_TEXT_MODEL_SEED_2_1_PRO", "ARK_TEXT_MODEL_SEED_2_0_LITE"]) {
  const v = env[k];
  if (!v) continue;
  if (!looksLikeEndpointId(v)) {
    const head = v.length > 6 ? `${v.slice(0, 6)}...` : v;
    console.warn(`WARN: ${k}='${head}' 看起来不像 ep- 开头的 Endpoint ID，请确认是否填错（应为 Ark 接入点页面复制的 ep-xxx，不是模型名称）。`);
  }
}

// Simple length heuristic on AK-style keys.
const akLike = [
  ["ARK_API_KEY", [24, 64]],
  ["MEDIAKIT_API_KEY", [32, 80]],
  ["ARK_ASSETS_ACCESS_KEY_ID", [16, 80]],
  ["TOS_ACCESS_KEY_ID", [16, 80]],
  ["VOLCENGINE_VOD_ACCESS_KEY_ID", [16, 80]],
  ["ARK_ASSETS_SECRET_ACCESS_KEY", [32, 96]],
  ["TOS_SECRET_ACCESS_KEY", [32, 96]],
  ["VOLCENGINE_VOD_SECRET_ACCESS_KEY", [32, 96]],
];
for (const [k, [lo, hi]] of akLike) {
  const L = setLen(env[k]);
  if (L === 0) continue;
  if (L < lo || L > hi) {
    console.warn(`WARN: ${k} 长度=${L}，超出典型区间 [${lo}, ${hi}]，请确认是否粘贴了多余字符或漏了字符。`);
  }
}

if (missing.length > 0) {
  console.error("[SELF_CHECK] FAIL — 缺少以下必填/至少选一条目的 real-mode 凭据：");
  for (const m of missing) console.error("  · ", m);
  console.error();
  console.error(
    "请编辑 /etc/frameflow.env 填入真实值后，执行 sudo systemctl restart frameflow.service。",
  );
  console.error(
    "完整取值路径参考：deploy/real-mode/README.md#2-收集火山控制台凭据清单",
  );
  process.exit(1);
}

// Weak warnings for missing TOS / Ark Assets config (not a hard start error,
// because users may be validating only the Ark chat/seedance paths first).
const softMissing = STRONG_RECOMMEND.filter((k) => setLen(env[k]) === 0);
if (softMissing.length > 0) {
  console.warn(
    "[SELF_CHECK] PASS (hard requirements OK)，但以下强烈建议配置的资源型凭据仍为 EMPTY（若无则素材上传/存储会失败）：",
  );
  for (const k of softMissing) console.warn("  · ", k);
  console.warn();
} else {
  console.log(
    "[SELF_CHECK] PASS — 所有 real-mode 硬要求 + 资源型 AK/SK 均已 SET。",
  );
}
