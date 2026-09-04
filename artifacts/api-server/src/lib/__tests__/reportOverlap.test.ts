// The overlap rule between staged files of one class (reportOverlap.ts),
// on the shapes the Pure Path account staged on 2026-09-04: a Platform ×
// Placement pivot beside a Platform × Placement × Impression device pivot
// of the same 28 days, two Gender × Age pivots of the same period, a
// 28-day and a 30-day daily Ad Summary. Every case asserts what is kept,
// what is not, and why, so the run's warning can say it.
import { describe, expect, it } from "vitest";
import { OverlapResolver, resolveClassOverlaps, type OverlapFile } from "../reportOverlap";

type Row = { ad: string; day: string | null; spend: number };
const file = (id: string, order: number, depth: number, daily: boolean, rows: Row[]): OverlapFile<Row> => ({
  source: { id, order, depth, daily },
  rows,
});
const keyOf = (row: Row) => ({ group: row.ad, day: row.day });
const spendOf = (row: Row) => row.spend;
const total = (rows: readonly Row[] | undefined) => (rows ?? []).reduce((s, r) => s + r.spend, 0);

describe("resolveClassOverlaps", () => {
  it("the finer breakdown wins the ads both files carry; the coarser file keeps the ads the finer one lacks", () => {
    const coarse = file("placeplat", 0, 2, false, [
      { ad: "X", day: null, spend: 100 },
      { ad: "Y", day: null, spend: 100 },
      { ad: "Z", day: null, spend: 100 },
    ]);
    const fine = file("device", 1, 3, false, [
      { ad: "X", day: null, spend: 50 },
      { ad: "X", day: null, spend: 50 },
      { ad: "Y", day: null, spend: 100 },
    ]);
    const { kept, superseded } = resolveClassOverlaps([coarse, fine], keyOf, spendOf);
    expect(kept.get("placeplat")).toEqual([{ ad: "Z", day: null, spend: 100 }]);
    expect(total(kept.get("device"))).toBe(200);
    expect(total(kept.get("placeplat")) + total(kept.get("device"))).toBe(300); // never 500
    expect(superseded).toEqual([{ loser: "placeplat", winner: "device", reason: "finer_breakdown", rows: 2, spend: 200, groups: 2 }]);
  });

  it("on equal depth the later-staged file wins", () => {
    const first = file("demo-a", 0, 2, false, [{ ad: "X", day: null, spend: 100 }]);
    const second = file("demo-b", 1, 2, false, [{ ad: "X", day: null, spend: 120 }]);
    const { kept, superseded } = resolveClassOverlaps([first, second], keyOf, spendOf);
    expect(kept.get("demo-a")).toEqual([]);
    expect(total(kept.get("demo-b"))).toBe(120);
    expect(superseded[0]).toMatchObject({ loser: "demo-a", winner: "demo-b", reason: "later_staged", rows: 1, spend: 100 });
  });

  it("a daily file beats a whole-period file for the ads it carries, whatever the depth or order", () => {
    const period = file("whole", 1, 3, false, [
      { ad: "X", day: null, spend: 1000 },
      { ad: "Y", day: null, spend: 500 },
    ]);
    const daily = file("daily", 0, 0, true, [
      { ad: "X", day: "2026-08-01", spend: 30 },
      { ad: "X", day: "2026-08-02", spend: 40 },
    ]);
    const { kept, superseded } = resolveClassOverlaps([daily, period], keyOf, spendOf);
    expect(kept.get("whole")).toEqual([{ ad: "Y", day: null, spend: 500 }]);
    expect(total(kept.get("daily"))).toBe(70);
    expect(superseded).toEqual([{ loser: "whole", winner: "daily", reason: "daily_over_period", rows: 1, spend: 1000, groups: 1 }]);
  });

  it("overlapping daily files: the later file wins the shared days and the earlier keeps its own", () => {
    const d28 = file("28d", 0, 0, true, [
      { ad: "X", day: "2026-08-06", spend: 10 },
      { ad: "X", day: "2026-08-07", spend: 10 },
    ]);
    const d30 = file("30d", 1, 0, true, [
      { ad: "X", day: "2026-08-04", spend: 12 },
      { ad: "X", day: "2026-08-06", spend: 12 },
      { ad: "X", day: "2026-08-07", spend: 12 },
    ]);
    const { kept, superseded } = resolveClassOverlaps([d28, d30], keyOf, spendOf);
    expect(kept.get("28d")).toEqual([]);
    expect(total(kept.get("30d"))).toBe(36);
    expect(superseded).toEqual([{ loser: "28d", winner: "30d", reason: "later_staged", rows: 2, spend: 20, groups: 1 }]);

    const disjointTail = file("tail", 1, 0, true, [{ ad: "X", day: "2026-08-08", spend: 5 }]);
    const union = resolveClassOverlaps([d28, disjointTail], keyOf, spendOf);
    expect(union.superseded).toEqual([]);
    expect(total(union.kept.get("28d")) + total(union.kept.get("tail"))).toBe(25);
  });

  it("disjoint files lose nothing", () => {
    const a = file("a", 0, 2, false, [{ ad: "X", day: null, spend: 1 }]);
    const b = file("b", 1, 2, false, [{ ad: "Y", day: null, spend: 2 }]);
    const { kept, superseded } = resolveClassOverlaps([a, b], keyOf, spendOf);
    expect(superseded).toEqual([]);
    expect(kept.get("a")).toHaveLength(1);
    expect(kept.get("b")).toHaveLength(1);
  });

  it("a single file, or none, resolves to itself", () => {
    const a = file("a", 0, 2, false, [{ ad: "X", day: null, spend: 1 }]);
    expect(resolveClassOverlaps([a], keyOf, spendOf).kept.get("a")).toHaveLength(1);
    expect(resolveClassOverlaps<Row>([], keyOf, spendOf).kept.size).toBe(0);
  });
});

describe("OverlapResolver", () => {
  it("ranks daily over whole-period, then depth, then staging order, and names the reason in that order", () => {
    const whole = { id: "w", order: 5, depth: 9, daily: false };
    const daily = { id: "d", order: 0, depth: 0, daily: true };
    const deeper = { id: "e", order: 0, depth: 3, daily: false };
    const later = { id: "l", order: 6, depth: 9, daily: false };
    expect(OverlapResolver.reason(whole, daily)).toBe("daily_over_period");
    expect(OverlapResolver.reason(daily, deeper)).toBe("finer_breakdown");
    expect(OverlapResolver.reason(whole, later)).toBe("later_staged");

    const r = new OverlapResolver();
    r.register(whole, { group: "X", day: null });
    r.register(daily, { group: "X", day: "2026-08-01" });
    expect(r.winner({ group: "X", day: null })?.id).toBe("d");
    expect(r.winner({ group: "X", day: "2026-08-01" })?.id).toBe("d");
    expect(r.winner({ group: "Y", day: null })).toBeNull();
  });
});
