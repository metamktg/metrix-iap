import { describe, it, expect } from "vitest";
import { fmtElapsed, pacePhrase } from "../generation-pace";

describe("fmtElapsed", () => {
  it("reads in seconds under a minute", () => {
    expect(fmtElapsed(0)).toBe("0s");
    expect(fmtElapsed(45)).toBe("45s");
  });

  it("switches to minutes, dropping a zero seconds remainder", () => {
    expect(fmtElapsed(60)).toBe("1m");
    expect(fmtElapsed(192)).toBe("3m 12s");
    expect(fmtElapsed(255)).toBe("4m 15s"); // the run that actually succeeded
  });

  it("never renders a negative or fractional value", () => {
    expect(fmtElapsed(-5)).toBe("0s");
    expect(fmtElapsed(12.7)).toBe("12s");
  });
});

describe("pacePhrase", () => {
  // The whole point: under the typical duration it must EXPLAIN the frozen
  // bar, because that is when the screen misleads.
  it("explains the held bar while the run is within its usual time", () => {
    const phrase = pacePhrase(90, 210);
    expect(phrase).toContain("bar holds");
    expect(phrase).not.toContain("Longer than");
  });

  it("stops reassuring once the run overruns. An overrun should read as one", () => {
    const phrase = pacePhrase(400, 210);
    expect(phrase).toContain("Longer than");
    expect(phrase).not.toContain("bar holds");
  });

  it("switches exactly at the typical duration, not before", () => {
    expect(pacePhrase(210, 210)).toContain("bar holds");
    expect(pacePhrase(211, 210)).toContain("Longer than");
  });

  it("always names a concrete expectation, so 'is it stuck' has an answer", () => {
    for (const t of [90, 199, 210, 326]) {
      expect(pacePhrase(10, t)).toMatch(/about \d+–\d+ min/);
    }
  });
});
