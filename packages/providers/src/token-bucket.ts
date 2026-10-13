/** A token bucket that refills continuously; `take()` resolves once a token is available. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly capacity: number = ratePerSecond,
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.tokens = capacity;
    this.last = clock();
  }

  private refill(): void {
    const now = this.clock();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.ratePerSecond);
    this.last = now;
  }

  async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - this.tokens) / this.ratePerSecond) * 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/** One bucket per key (a project), created on first use. */
export class KeyedTokenBuckets {
  private readonly buckets = new Map<string, TokenBucket>();
  constructor(private readonly ratePerSecond: number) {}

  async take(key: string): Promise<void> {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.ratePerSecond);
      this.buckets.set(key, bucket);
    }
    await bucket.take();
  }
}
