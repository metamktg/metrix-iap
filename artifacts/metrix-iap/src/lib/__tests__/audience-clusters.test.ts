import { describe, expect, it } from "vitest";
import {
  buildAudienceClusters, groupSegmentsByAge, combineSegmentTotals,
  classifyQuadrant, type ClusterableSegment,
} from "../audience-clusters";
import { deriveSegmentMetrics, type SegmentRawTotals } from "../segment-analytics";

function totals(overrides: Partial<SegmentRawTotals>): SegmentRawTotals {
  return {
    rowCount: 1,
    spend: 100,
    results: 10,
    reach: 1000,
    impressions: 2000,
    linkClicks: 200,
    clicksAll: 220,
    addsToCart: null,
    checkoutsInitiated: null,
    purchases: null,
    addsToCartValue: null,
    ...overrides,
  };
}

function seg(age: string, gender: string, t: Partial<SegmentRawTotals>): ClusterableSegment {
  const tot = totals(t);
  return { seg: { age, gender }, totals: tot, derived: deriveSegmentMetrics(tot) };
}

describe("buildAudienceClusters", () => {
  it("returns no clusters for zero segments", () => {
    expect(buildAudienceClusters([])).toEqual([]);
  });

  it("returns a single cluster for a single segment", () => {
    const entries = [seg("25-34", "male", { spend: 50, results: 5, linkClicks: 100 })];
    const clusters = buildAudienceClusters(entries);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].id).toBe("C1");
    expect(clusters[0].members).toHaveLength(1);
    expect(clusters[0].label).toBe("Men 25-34");
  });

  it("never exceeds 6 clusters and never exceeds the clusterable segment count", () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      seg(`${20 + i}-${29 + i}`, i % 2 === 0 ? "male" : "female", {
        spend: 100 + i * 10,
        results: 10 + (i % 5),
        linkClicks: 150 + i * 5,
      })
    );
    const clusters = buildAudienceClusters(entries);
    expect(clusters.length).toBeLessThanOrEqual(6);
    expect(clusters.length).toBeLessThanOrEqual(entries.length);
    const totalMembers = clusters.reduce((n, c) => n + c.members.length, 0);
    expect(totalMembers).toBe(entries.length);
  });

  it("produces fewer than 6 clusters for a thin account instead of force-splitting", () => {
    const entries = [
      seg("18-24", "male", { spend: 20, results: 2, linkClicks: 40 }),
      seg("25-34", "female", { spend: 30, results: 3, linkClicks: 60 }),
      seg("35-44", "male", { spend: 25, results: 2, linkClicks: 45 }),
    ];
    const clusters = buildAudienceClusters(entries);
    expect(clusters.length).toBeLessThan(6);
    expect(clusters.length).toBeGreaterThan(0);
  });

  it("is deterministic · identical input always produces identical clusters", () => {
    const entries = Array.from({ length: 14 }, (_, i) =>
      seg(`${20 + i}-${29 + i}`, i % 2 === 0 ? "male" : "female", {
        spend: 40 + (i * 37) % 200,
        results: 3 + (i * 11) % 20,
        linkClicks: 80 + (i * 23) % 150,
      })
    );
    const a = buildAudienceClusters(entries);
    const b = buildAudienceClusters(entries);
    expect(a.map((c) => c.members.map((m) => `${m.seg.age}|${m.seg.gender}`).sort())).toEqual(
      b.map((c) => c.members.map((m) => `${m.seg.age}|${m.seg.gender}`).sort())
    );
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a.map((c) => c.label)).toEqual(b.map((c) => c.label));
  });

  it("excludes segments with no results (null CPA) from clustering rather than guessing", () => {
    const entries = [
      seg("25-34", "male", { spend: 50, results: 5, linkClicks: 100 }),
      seg("35-44", "female", { spend: 40, results: 0, linkClicks: 80 }), // CPA null
    ];
    const clusters = buildAudienceClusters(entries);
    const allMembers = clusters.flatMap((c) => c.members);
    expect(allMembers).toHaveLength(1);
    expect(allMembers[0].seg.age).toBe("25-34");
  });

  it("labels a multi-member cluster from its top-spend member segments", () => {
    const entries = [
      seg("25-34", "male", { spend: 500, results: 50, linkClicks: 1000 }),
      seg("25-34", "female", { spend: 10, results: 1, linkClicks: 20 }),
    ];
    const clusters = buildAudienceClusters(entries);
    // With only 2 clusterable segments, target cluster count is 1 — both land together.
    expect(clusters).toHaveLength(1);
    expect(clusters[0].label).toBe("Men 25-34 + Women 25-34");
  });

  it("assigns cluster ids C1..Cn ordered by descending cluster spend", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      seg(`${20 + i}-${25 + i}`, i % 2 === 0 ? "male" : "female", {
        spend: (i + 1) * 50,
        results: 5 + i,
        linkClicks: 100 + i * 10,
      })
    );
    const clusters = buildAudienceClusters(entries);
    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i - 1].totals.spend ?? 0).toBeGreaterThanOrEqual(clusters[i].totals.spend ?? 0);
    }
    expect(clusters.map((c) => c.id)).toEqual(clusters.map((_, i) => `C${i + 1}`));
  });
});

describe("groupSegmentsByAge", () => {
  it("combines genders within the same age bracket", () => {
    const entries = [
      seg("25-34", "male", { spend: 50, results: 5, linkClicks: 100 }),
      seg("25-34", "female", { spend: 30, results: 3, linkClicks: 60 }),
      seg("35-44", "male", { spend: 20, results: 2, linkClicks: 40 }),
    ];
    const groups = groupSegmentsByAge(entries);
    expect(groups).toHaveLength(2);
    const g2534 = groups.find((g) => g.id === "25-34")!;
    expect(g2534.members).toHaveLength(2);
    expect(g2534.totals.spend).toBe(80);
    expect(g2534.totals.results).toBe(8);
  });

  it("returns no groups for zero segments", () => {
    expect(groupSegmentsByAge([])).toEqual([]);
  });
});

describe("combineSegmentTotals", () => {
  it("sums fields present on every member", () => {
    const combined = combineSegmentTotals([totals({ spend: 10 }), totals({ spend: 20 })]);
    expect(combined.spend).toBe(30);
  });

  it("propagates null when any member lacks the field", () => {
    const combined = combineSegmentTotals([totals({ spend: 10 }), totals({ spend: null })]);
    expect(combined.spend).toBeNull();
  });
});

describe("classifyQuadrant", () => {
  it("classifies low cost + high conversions as scale", () => {
    expect(classifyQuadrant(10, 500, 15, 300)).toBe("scale");
  });
  it("classifies high cost + high conversions as optimize", () => {
    expect(classifyQuadrant(20, 500, 15, 300)).toBe("optimize");
  });
  it("classifies low cost + low conversions as explore", () => {
    expect(classifyQuadrant(10, 100, 15, 300)).toBe("explore");
  });
  it("classifies high cost + low conversions as avoid", () => {
    expect(classifyQuadrant(20, 100, 15, 300)).toBe("avoid");
  });
});
