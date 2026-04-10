export class ForkTimeoutError extends Error {
  public readonly durationMs: number;
  public readonly thresholdMs: number;

  public constructor(durationMs: number, thresholdMs: number) {
    super(
      `Fork operation exceeded timeout: ${durationMs.toFixed(2)}ms > ${thresholdMs.toFixed(2)}ms.`
    );
    this.name = "ForkTimeoutError";
    this.durationMs = durationMs;
    this.thresholdMs = thresholdMs;
  }
}
