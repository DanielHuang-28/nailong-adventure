import { describe, expect, it } from "vitest";
import { forestFrontierWorld } from "./forest-frontier";
import { validateWorldPackage } from "./world-package";

describe("forestFrontierWorld", () => {
  it("contains only valid route links", () => {
    expect(validateWorldPackage(forestFrontierWorld)).toEqual([]);
  });

  it("contains chase beats that progress through the run", () => {
    const meters = forestFrontierWorld.pursuitBeats.map((beat) => beat.triggerMeters);
    expect(meters).toEqual([...meters].sort((left, right) => left - right));
    expect(forestFrontierWorld.pursuitBeats.at(-1)?.exit).toBe("portal");
  });
});
