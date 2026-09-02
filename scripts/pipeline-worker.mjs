const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 3000);
const tickTimeoutMs = Number(process.env.WORKER_TICK_TIMEOUT_MS ?? 120000);

async function tick() {
  try {
    const response = await fetch(`${baseUrl}/api/internal/worker/tick`, {
      method: "POST",
      signal: AbortSignal.timeout(tickTimeoutMs),
    });
    const payload = await response.json();
    if (!response.ok) {
      console.error("[worker] tick failed", payload);
      return;
    }
    if (payload.data?.processed) {
      if (payload.data.retried) {
        console.log(
          `[worker] ${payload.data.kind} ${payload.data.jobId} transient network error, retry scheduled: ${payload.data.error}`,
        );
      } else {
        console.log(
          `[worker] ${payload.data.kind} ${payload.data.jobId}${
            payload.data.error ? ` failed: ${payload.data.error}` : ""
          }`,
        );
      }
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      console.error(
        `[worker] tick timeout after ${Math.round(tickTimeoutMs / 1000)}s`,
      );
    } else {
      console.error(
        "[worker] unavailable",
        error instanceof Error ? error.message : error,
      );
    }
  }
}

console.log(`[worker] connected to ${baseUrl}, interval ${intervalMs}ms`);
await tick();
setInterval(tick, intervalMs);
