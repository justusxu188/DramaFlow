/**
 * 供应商连接层（DNS/TCP/TLS/socket）瞬时错误的判定与包装。
 *
 * 公网链路抖动时 undici/Node 抛出 TypeError("fetch failed")，
 * cause.code 为 ECONNRESET/ETIMEDOUT/ENOTFOUND 等——这类错误与供应商
 * 业务失败无关，短时间退避重试即可恢复，不应消耗任务的失败次数。
 * 流水线调度层通过 isTransientNetworkError 区分两类错误。
 */

export type TransientNetworkError = Error & { transientNetwork?: boolean };

/** 连接层瞬时错误码（undici cause.code / Node libuv 错误码） */
const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

export function getFetchErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string" && direct) return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string" && causeCode) return causeCode;
  }
  return undefined;
}

export function markTransient(error: Error): Error {
  (error as TransientNetworkError).transientNetwork = true;
  return error;
}

export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as TransientNetworkError).transientNetwork === true) return true;
  const code = getFetchErrorCode(error);
  return Boolean(code && TRANSIENT_ERROR_CODES.has(code));
}

/**
 * 将连接层 fetch 错误包装为中文可读消息并标记为瞬时错误。
 * 已包装过的错误原样返回，避免多层包裹。
 */
export function wrapFetchError(error: unknown, target: string): Error {
  if (
    error instanceof Error &&
    (error as TransientNetworkError).transientNetwork === true
  ) {
    return error;
  }
  const code = getFetchErrorCode(error);
  const base = error instanceof Error ? error.message : String(error);
  const detail = code ? `${code}: ${base}` : base;
  return markTransient(
    new Error(`${target}连接失败（网络波动，将自动重试）：${detail}`),
  );
}

/** 本端 AbortController 触发的请求超时，同样视为瞬时错误 */
export function timeoutError(message: string): Error {
  return markTransient(new Error(message));
}
