export type RunnerMotionState = "running" | "jumping" | "sliding" | "hit";

export interface RunnerConfig {
  laneWidth: number;
  laneResponse: number;
  gravity: number;
  jumpVelocity: number;
  slideSeconds: number;
  hitStunSeconds: number;
  invulnerabilitySeconds: number;
}

export interface RunnerSnapshot {
  lane: -1 | 0 | 1;
  targetX: number;
  x: number;
  y: number;
  verticalVelocity: number;
  grounded: boolean;
  motion: RunnerMotionState;
  invulnerabilityRemaining: number;
}

export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  laneWidth: 2.75,
  laneResponse: 18,
  gravity: -34,
  jumpVelocity: 12.8,
  slideSeconds: 0.72,
  hitStunSeconds: 0.42,
  invulnerabilitySeconds: 1.15,
};

export class RunnerController {
  private lane: -1 | 0 | 1 = 0;
  private x = 0;
  private y = 0;
  private verticalVelocity = 0;
  private grounded = true;
  private slideRemaining = 0;
  private hitRemaining = 0;
  private invulnerabilityRemaining = 0;

  constructor(private readonly config: RunnerConfig = DEFAULT_RUNNER_CONFIG) {}

  reset(): void {
    this.lane = 0;
    this.x = 0;
    this.y = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.slideRemaining = 0;
    this.hitRemaining = 0;
    this.invulnerabilityRemaining = 0;
  }

  moveLane(direction: -1 | 1): boolean {
    if (this.hitRemaining > 0) return false;
    const nextLane = Math.max(-1, Math.min(1, this.lane + direction)) as -1 | 0 | 1;
    if (nextLane === this.lane) return false;
    this.lane = nextLane;
    return true;
  }

  jump(): boolean {
    if (!this.grounded || this.slideRemaining > 0 || this.hitRemaining > 0) return false;
    this.grounded = false;
    this.verticalVelocity = this.config.jumpVelocity;
    return true;
  }

  slide(): boolean {
    if (!this.grounded || this.slideRemaining > 0 || this.hitRemaining > 0) return false;
    this.slideRemaining = this.config.slideSeconds;
    return true;
  }

  hit(): boolean {
    if (this.invulnerabilityRemaining > 0) return false;
    this.hitRemaining = this.config.hitStunSeconds;
    this.invulnerabilityRemaining = this.config.invulnerabilitySeconds;
    this.slideRemaining = 0;
    return true;
  }

  update(stepSeconds: number): void {
    if (stepSeconds <= 0) return;

    const targetX = this.lane * this.config.laneWidth;
    const laneBlend = 1 - Math.exp(-this.config.laneResponse * stepSeconds);
    this.x += (targetX - this.x) * laneBlend;

    this.slideRemaining = Math.max(0, this.slideRemaining - stepSeconds);
    this.hitRemaining = Math.max(0, this.hitRemaining - stepSeconds);
    this.invulnerabilityRemaining = Math.max(
      0,
      this.invulnerabilityRemaining - stepSeconds,
    );

    if (!this.grounded) {
      this.verticalVelocity += this.config.gravity * stepSeconds;
      this.y += this.verticalVelocity * stepSeconds;

      if (this.y <= 0) {
        this.y = 0;
        this.verticalVelocity = 0;
        this.grounded = true;
      }
    }
  }

  snapshot(): RunnerSnapshot {
    return {
      lane: this.lane,
      targetX: this.lane * this.config.laneWidth,
      x: this.x,
      y: this.y,
      verticalVelocity: this.verticalVelocity,
      grounded: this.grounded,
      motion: this.motionState(),
      invulnerabilityRemaining: this.invulnerabilityRemaining,
    };
  }

  private motionState(): RunnerMotionState {
    if (this.hitRemaining > 0) return "hit";
    if (!this.grounded) return "jumping";
    if (this.slideRemaining > 0) return "sliding";
    return "running";
  }
}
