import { describe, expect, it, vi } from "vitest";
import { SlidingWindowRateLimiter } from "./rate-limiter";

describe("SlidingWindowRateLimiter", () => {
  it("starts ten operations immediately and delays the eleventh", async () => {
    let now = 0;
    const sleep = vi.fn(async (durationMs: number) => {
      now += durationMs;
    });
    const limiter = new SlidingWindowRateLimiter({
      limit: 10,
      windowMs: 1000,
      now: () => now,
      sleep,
    });
    const startedAt: number[] = [];

    await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        limiter.schedule(async () => {
          startedAt[index] = now;
          return index;
        }),
      ),
    );

    expect(startedAt.slice(0, 10)).toEqual(
      Array(10).fill(0),
    );
    expect(startedAt[10]).toBe(1000);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not wait for an earlier operation to finish", async () => {
    let finishFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const limiter = new SlidingWindowRateLimiter({
      limit: 2,
      windowMs: 1000,
    });
    const secondStarted = vi.fn();

    const firstResult = limiter.schedule(() => first);
    const secondResult = limiter.schedule(async () => {
      secondStarted();
    });
    await secondResult;

    expect(secondStarted).toHaveBeenCalledOnce();
    finishFirst?.();
    await firstResult;
  });
});
