import { describe, expect, it } from "vitest";
import { forestCourse01, sectionAtDistance, validateForestCourse } from "./forest-course-01";

describe("forestCourse01", () => {
  it("forms one continuous authored level", () => {
    expect(validateForestCourse(forestCourse01)).toEqual([]);
  });

  it("changes the active section at authored landmarks", () => {
    expect(sectionAtDistance(forestCourse01, 40).id).toBe("misty-grove");
    expect(sectionAtDistance(forestCourse01, 240).id).toBe("forest-station");
    expect(sectionAtDistance(forestCourse01, 519).id).toBe("mine-portal");
  });
});

