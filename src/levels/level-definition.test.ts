import { describe, expect, it } from "vitest";
import { forestLevel01 } from "./forest-level-01";
import { evaluateLevel } from "./level-definition";

describe("evaluateLevel", () => {
  it("awards one star for finishing and up to three for optional goals", () => {
    expect(evaluateLevel(forestLevel01, 520, 3, 5).stars).toBe(1);
    expect(evaluateLevel(forestLevel01, 520, 18, 4).stars).toBe(2);
    expect(evaluateLevel(forestLevel01, 520, 18, 2).stars).toBe(3);
  });
});

