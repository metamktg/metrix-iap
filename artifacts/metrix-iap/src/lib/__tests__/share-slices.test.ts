// ─── Share-slice allocation ───────────────────────────────────────────
//
// The defect this guards: the donut had ten palette entries, four of which
// were aliases of an earlier entry, and indexed them with `i % length`. A
// seven-slice chart therefore painted slices 1 and 7 the same colour, and
// the legend mapped two names onto one swatch. These pin the rule that
// replaced it — a fixed number of categorical slots, never cycled, with the
// overflow folded into a neutral bucket that still says what it holds.

import { describe, it, expect } from "vitest";
import { allocateShareSlices, MIN_SHARE } from "../share-slices";

const MAX = 5;
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("allocateShareSlices · the colour budget is never exceeded", () => {
  it("never names more segments than there are categorical slots", () => {
    const data = Array.from({ length: 12 }, (_, i) => ({ name: `S${i}`, value: 100 - i }));
    const a = allocateShareSlices(data, MAX);
    expect(a.named).toHaveLength(MAX);
    // Six through twelve are in the bucket, not wearing slot 1's colour.
    expect(a.folded).toHaveLength(7);
    expect(a.other).toEqual({ name: "Other", value: 7 * 100 - (5 + 6 + 7 + 8 + 9 + 10 + 11) });
  });

  it("keeps the largest segments, not the first ones it was handed", () => {
    const data = [
      { name: "tiny", value: 10 }, { name: "huge", value: 500 },
      { name: "big", value: 300 }, { name: "mid", value: 100 },
    ];
    expect(names(allocateShareSlices(data, MAX).named)).toEqual(["huge", "big", "mid", "tiny"]);
  });

  it("shows everything when everything fits", () => {
    const data = [
      { name: "a", value: 30 }, { name: "b", value: 30 }, { name: "c", value: 40 },
    ];
    const a = allocateShareSlices(data, MAX);
    expect(a.other).toBeNull();
    expect(a.folded).toEqual([]);
    expect(a.slices).toHaveLength(3);
  });
});

describe("allocateShareSlices · thin slices", () => {
  it("folds anything under the readable-share floor", () => {
    const data = [
      { name: "dominant", value: 970 },
      { name: "sliver-a", value: 10 },
      { name: "sliver-b", value: 10 },
      { name: "sliver-c", value: 10 },
    ];
    const a = allocateShareSlices(data, MAX);
    expect(names(a.named)).toEqual(["dominant"]);
    expect(names(a.folded)).toEqual(["sliver-a", "sliver-b", "sliver-c"]);
    expect(a.other!.value).toBe(30);
    // 1% each is below the 3% floor.
    expect(10 / 1000).toBeLessThan(MIN_SHARE);
  });

  it("does not bucket a lone thin slice when a slot is free. That would cost it its name for nothing", () => {
    const data = [{ name: "dominant", value: 990 }, { name: "sliver", value: 10 }];
    const a = allocateShareSlices(data, MAX);
    expect(names(a.named)).toEqual(["dominant", "sliver"]);
    expect(a.other).toBeNull();
  });
});

describe("allocateShareSlices · nothing is destroyed by folding", () => {
  it("names every folded member so the tooltip can report them", () => {
    const data = Array.from({ length: 9 }, (_, i) => ({ name: `seg-${i}`, value: 100 - i }));
    const a = allocateShareSlices(data, MAX);
    expect(names(a.folded)).toEqual(["seg-5", "seg-6", "seg-7", "seg-8"]);
  });

  it("conserves the total across named + folded", () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ name: `s${i}`, value: (i + 1) * 3 }));
    const a = allocateShareSlices(data, MAX);
    const drawn = a.slices.reduce((n, d) => n + d.value, 0);
    expect(drawn).toBe(a.total);
    expect(drawn).toBe(data.reduce((n, d) => n + d.value, 0));
  });

  it("does not mutate the caller's array", () => {
    const data = [{ name: "a", value: 1 }, { name: "b", value: 9 }];
    const before = JSON.stringify(data);
    allocateShareSlices(data, MAX);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("allocateShareSlices · degenerate input", () => {
  it("handles an empty set", () => {
    const a = allocateShareSlices([], MAX);
    expect(a.slices).toEqual([]);
    expect(a.other).toBeNull();
    expect(a.total).toBe(0);
  });

  it("handles an all-zero set without folding everything into a zero bucket", () => {
    // Threshold is 0, so every segment clears it; the slot cap still applies.
    const data = Array.from({ length: 7 }, (_, i) => ({ name: `z${i}`, value: 0 }));
    const a = allocateShareSlices(data, MAX);
    expect(a.named).toHaveLength(MAX);
    expect(a.other!.value).toBe(0);
  });
});
