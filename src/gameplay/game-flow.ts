export type GamePhase =
  | "lobby"
  | "countdown"
  | "running"
  | "chase"
  | "reward"
  | "result";

export interface RunResult {
  distanceMeters: number;
  coins: number;
  fragments: number;
  stars: 1 | 2 | 3;
  reason: "completed" | "collision" | "quit" | "debug";
}

export class GameFlow {
  private phase: GamePhase = "lobby";
  private result: RunResult | null = null;

  currentPhase(): GamePhase {
    return this.phase;
  }

  latestResult(): RunResult | null {
    return this.result;
  }

  beginCountdown(): boolean {
    if (this.phase !== "lobby" && this.phase !== "result") return false;
    this.result = null;
    this.phase = "countdown";
    return true;
  }

  beginRun(): boolean {
    if (this.phase !== "countdown") return false;
    this.phase = "running";
    return true;
  }

  beginChase(): boolean {
    if (this.phase !== "running") return false;
    this.phase = "chase";
    return true;
  }

  beginReward(): boolean {
    if (this.phase !== "chase") return false;
    this.phase = "reward";
    return true;
  }

  resumeRunning(): boolean {
    if (this.phase !== "reward") return false;
    this.phase = "running";
    return true;
  }

  endRun(result: RunResult): boolean {
    if (!new Set<GamePhase>(["running", "chase", "reward"]).has(this.phase)) {
      return false;
    }
    this.result = { ...result };
    this.phase = "result";
    return true;
  }

  returnToLobby(): void {
    this.phase = "lobby";
  }
}
