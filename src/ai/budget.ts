import { limits } from "../config/limits.js";
/** One budget per run; no retries, loops, or external provider permission. */
export class RunBudget {
  private calls = 0;
  private started = Date.now();
  private stopped = false;
  private outputChars = 0;
  check(): void {
    if (this.stopped || Date.now() - this.started >= limits.runTimeoutMs)
      throw new Error("Run safety budget exhausted");
  }
  async call<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.check();
    if (++this.calls > limits.maxProviderCalls) {
      this.stopped = true;
      throw new Error("Provider call budget exhausted");
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        operation(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              this.stopped = true;
              controller.abort();
              reject(
                new Error(
                  "Provider deadline exceeded; no further calls allowed",
                ),
              );
            },
            Math.min(
              limits.providerTimeoutMs,
              limits.runTimeoutMs - (Date.now() - this.started),
            ),
          );
        }),
      ]);
      const serialized = JSON.stringify(result);
      if (serialized.length > limits.maxOutputChars) {
        this.stopped = true;
        throw new Error("Provider output exceeds size budget");
      }
      this.outputChars += serialized.length;
      if (this.outputChars > limits.maxAggregateOutputChars) {
        this.stopped = true;
        throw new Error("Aggregate output budget exhausted");
      }
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
