import { describe, expect, it } from "vitest";
import { fmtDuration, remainingLabel } from "../runEta";

describe("runEta", () => {
  it("says nothing before the first unit finishes", () => {
    expect(remainingLabel(0, 20, 30)).toBeNull();
  });
  it("projects the measured rate over what is left", () => {
    expect(remainingLabel(4, 20, 60)).toBe("about 4m left");
  });
  it("reads as wrapping up at the end", () => {
    expect(remainingLabel(19, 20, 60)).toBe("wrapping up");
  });
  it("formats durations", () => {
    expect(fmtDuration(45)).toBe("45s");
    expect(fmtDuration(130)).toBe("2m 10s");
  });
});
