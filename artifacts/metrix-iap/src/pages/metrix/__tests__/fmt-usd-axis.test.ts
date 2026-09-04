// The axis tick formatter: "$0k $0k $0k $1k $1k" is not an axis.
import { describe, it, expect } from "vitest";
import { fmtUSDAxis } from "../shared";

describe("fmtUSDAxis", () => {
  it("reads whole dollars under a thousand", () => {
    expect(fmtUSDAxis(0)).toBe("$0");
    expect(fmtUSDAxis(250)).toBe("$250");
    expect(fmtUSDAxis(999.6)).toBe("$1,000");
  });
  it("reads thousands with one decimal only where it carries information", () => {
    expect(fmtUSDAxis(1000)).toBe("$1k");
    expect(fmtUSDAxis(1250)).toBe("$1.3k");
    expect(fmtUSDAxis(8000)).toBe("$8k");
  });
  it("reads whole thousands and then millions", () => {
    expect(fmtUSDAxis(48_200)).toBe("$48k");
    expect(fmtUSDAxis(1_437_538)).toBe("$1.4M");
    expect(fmtUSDAxis(2_000_000)).toBe("$2M");
  });
  it("never collapses distinct ticks under $5k onto one label", () => {
    const ticks = [0, 250, 500, 750, 1000, 1250].map(fmtUSDAxis);
    expect(new Set(ticks).size).toBe(ticks.length);
  });
});
