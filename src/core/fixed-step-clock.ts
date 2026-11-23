export interface FixedStepClockOptions {
  stepSeconds: number;
  maxFrameSeconds: number;
  maxStepsPerFrame: number;
}

const DEFAULT_OPTIONS: FixedStepClockOptions = {
  stepSeconds: 1 / 60,
  maxFrameSeconds: 0.1,
  maxStepsPerFrame: 6,
};

export class FixedStepClock {
  private accumulator = 0;
  private previousTimeMs: number | null = null;

  constructor(private readonly options: FixedStepClockOptions = DEFAULT_OPTIONS) {}

  reset(timeMs?: number): void {
    this.accumulator = 0;
    this.previousTimeMs = timeMs ?? null;
  }

  advance(timeMs: number, update: (stepSeconds: number) => void): number {
    if (this.previousTimeMs === null) {
      this.previousTimeMs = timeMs;
      return 0;
    }

    const frameSeconds = Math.min(
      Math.max((timeMs - this.previousTimeMs) / 1000, 0),
      this.options.maxFrameSeconds,
    );
    this.previousTimeMs = timeMs;
    this.accumulator += frameSeconds;

    let steps = 0;
    while (
      this.accumulator >= this.options.stepSeconds &&
      steps < this.options.maxStepsPerFrame
    ) {
      update(this.options.stepSeconds);
      this.accumulator -= this.options.stepSeconds;
      steps += 1;
    }

    if (steps === this.options.maxStepsPerFrame) {
      this.accumulator = Math.min(this.accumulator, this.options.stepSeconds);
    }

    return this.accumulator / this.options.stepSeconds;
  }
}
