import { describe, expect, it } from "vitest";
import { GameFlow } from "./game-flow";

describe("GameFlow", () => {
  it("follows the valid chase and reward sequence", () => {
    const flow = new GameFlow();
    expect(flow.beginCountdown()).toBe(true);
    expect(flow.beginRun()).toBe(true);
    expect(flow.beginChase()).toBe(true);
    expect(flow.beginReward()).toBe(true);
    expect(flow.resumeRunning()).toBe(true);
    expect(flow.currentPhase()).toBe("running");
  });

  it("rejects transitions that skip required phases", () => {
    const flow = new GameFlow();
    expect(flow.beginRun()).toBe(false);
    expect(flow.beginChase()).toBe(false);
    expect(flow.currentPhase()).toBe("lobby");
  });

  it("stores a defensive copy of the run result", () => {
    const flow = new GameFlow();
    flow.beginCountdown();
    flow.beginRun();
    const result = { distanceMeters: 640, coins: 42, fragments: 1, stars: 2 as const, reason: "collision" as const };
    expect(flow.endRun(result)).toBe(true);
    result.coins = 0;
    expect(flow.latestResult()?.coins).toBe(42);
    expect(flow.currentPhase()).toBe("result");
  });
});
