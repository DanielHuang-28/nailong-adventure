import { describe, expect, it } from "vitest";
import { RunnerController } from "./runner-controller";

function step(runner: RunnerController, seconds: number): void {
  const fixedStep = 1 / 60;
  const count = Math.ceil(seconds / fixedStep);
  for (let index = 0; index < count; index += 1) runner.update(fixedStep);
}

describe("RunnerController", () => {
  it("clamps lane movement to the three legal lanes", () => {
    const runner = new RunnerController();
    expect(runner.moveLane(-1)).toBe(true);
    expect(runner.moveLane(-1)).toBe(false);
    expect(runner.snapshot().lane).toBe(-1);
    expect(runner.moveLane(1)).toBe(true);
    expect(runner.moveLane(1)).toBe(true);
    expect(runner.moveLane(1)).toBe(false);
    expect(runner.snapshot().lane).toBe(1);
  });

  it("lands after a jump and rejects a second jump in the air", () => {
    const runner = new RunnerController();
    expect(runner.jump()).toBe(true);
    expect(runner.jump()).toBe(false);
    step(runner, 0.2);
    expect(runner.snapshot().motion).toBe("jumping");
    expect(runner.snapshot().y).toBeGreaterThan(0);
    step(runner, 1.2);
    expect(runner.snapshot().grounded).toBe(true);
    expect(runner.snapshot().y).toBe(0);
  });

  it("finishes a slide after its configured duration", () => {
    const runner = new RunnerController();
    expect(runner.slide()).toBe(true);
    expect(runner.snapshot().motion).toBe("sliding");
    step(runner, 0.8);
    expect(runner.snapshot().motion).toBe("running");
  });

  it("prevents repeated hits during invulnerability", () => {
    const runner = new RunnerController();
    expect(runner.hit()).toBe(true);
    expect(runner.hit()).toBe(false);
    step(runner, 0.5);
    expect(runner.snapshot().motion).toBe("running");
    expect(runner.hit()).toBe(false);
    step(runner, 0.8);
    expect(runner.hit()).toBe(true);
  });
});
