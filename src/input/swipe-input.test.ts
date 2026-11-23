import { describe, expect, it } from "vitest";
import { recognizeSwipe, type PointerPoint } from "./swipe-input";

const start: PointerPoint = { x: 100, y: 100, timeMs: 0 };

describe("recognizeSwipe", () => {
  it.each([
    [{ x: 30, y: 104, timeMs: 180 }, "left"],
    [{ x: 172, y: 97, timeMs: 180 }, "right"],
    [{ x: 103, y: 35, timeMs: 180 }, "jump"],
    [{ x: 98, y: 170, timeMs: 180 }, "slide"],
  ] as const)("maps a directional gesture to %s", (end, action) => {
    expect(recognizeSwipe(start, end)).toBe(action);
  });

  it("ignores taps, diagonal ambiguity and long holds", () => {
    expect(recognizeSwipe(start, { x: 112, y: 108, timeMs: 100 })).toBeNull();
    expect(recognizeSwipe(start, { x: 150, y: 150, timeMs: 100 })).toBeNull();
    expect(recognizeSwipe(start, { x: 180, y: 100, timeMs: 900 })).toBeNull();
  });
});

