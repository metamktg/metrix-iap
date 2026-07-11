// rankBarPct + sortByRankMetric: the best value on the active metric must
// always get the longest bar, for both descending (volume/rate) and
// ascending (cost) metrics. Guards the CPA/CPM bar-inversion bug.

import { describe, it, expect } from "vitest";
import { rankBarPct, sortByRankMetric, type RankMetric } from "../analysis/rankSort";

describe("rankBarPct", () => {
  it("desc metrics: proportional to max — biggest value gets 100%", () => {
    const values = [10, 40, 20, null];
    expect(rankBarPct(40, values, "desc")).toBe(100);
    expect(rankBarPct(20, values, "desc")).toBe(50);
    expect(rankBarPct(10, values, "desc")).toBe(25);
  });

  it("asc cost metrics: cheapest value gets 100%, pricier gets shorter", () => {
    const values = [55.28, 48.34, 57.5, null];
    const best = rankBarPct(48.34, values, "asc");
    const mid = rankBarPct(55.28, values, "asc");
    const worst = rankBarPct(57.5, values, "asc");
    expect(best).toBe(100);
    expect(mid).toBeLessThan(best);
    expect(worst).toBeLessThan(mid);
  });

  it("null values render no bar", () => {
    expect(rankBarPct(null, [1, 2], "desc")).toBe(0);
    expect(rankBarPct(null, [1, 2], "asc")).toBe(0);
  });

  it("zero/negative cost values render no bar (cannot be 'cheapest')", () => {
    expect(rankBarPct(0, [0, 10], "asc")).toBe(0);
  });

  it("all-zero desc values render no bars", () => {
    expect(rankBarPct(0, [0, 0], "desc")).toBe(0);
  });

  it("non-null bars keep a visible floor", () => {
    expect(rankBarPct(1, [1, 1000], "desc")).toBeGreaterThanOrEqual(3);
    expect(rankBarPct(1000, [1, 1000], "asc")).toBeGreaterThanOrEqual(3);
  });
});

describe("sortByRankMetric", () => {
  type Row = { v: number | null };
  const metric = (direction: "asc" | "desc"): RankMetric<Row> => ({
    id: "m",
    label: "M",
    direction,
    value: (r) => r.v,
    format: (v) => String(v),
  });

  it("asc puts lowest first, nulls last", () => {
    const rows: Row[] = [{ v: 3 }, { v: null }, { v: 1 }, { v: 2 }];
    expect(sortByRankMetric(rows, metric("asc")).map((r) => r.v)).toEqual([1, 2, 3, null]);
  });

  it("desc puts highest first, nulls last", () => {
    const rows: Row[] = [{ v: 3 }, { v: null }, { v: 1 }, { v: 2 }];
    expect(sortByRankMetric(rows, metric("desc")).map((r) => r.v)).toEqual([3, 2, 1, null]);
  });
});
