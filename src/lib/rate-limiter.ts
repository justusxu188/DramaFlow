type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
};

export class SlidingWindowRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (durationMs: number) => Promise<void>;
  private readonly starts: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((durationMs) =>
        new Promise((resolve) =>
          setTimeout(resolve, durationMs),
        ));
  }

  schedule<T>(operation: () => Promise<T>): Promise<T> {
    const slot = this.queue.then(() => this.acquire());
    this.queue = slot.catch(() => undefined);
    return slot.then(operation);
  }

  private async acquire() {
    while (true) {
      const now = this.now();
      while (
        this.starts.length > 0 &&
        now - this.starts[0] >= this.windowMs
      ) {
        this.starts.shift();
      }
      if (this.starts.length < this.limit) {
        this.starts.push(now);
        return;
      }
      await this.sleep(
        Math.max(
          1,
          this.windowMs - (now - this.starts[0]),
        ),
      );
    }
  }
}

export const videoSubmissionLimiter =
  new SlidingWindowRateLimiter({
    limit: 10,
    windowMs: 1000,
  });
