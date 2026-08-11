// ─── Strategy/brief evidence-pack row selection ───────────────────────
// buildStrategyEvidence caps how many performance rows reach the LLM (30
// cells, 60 variables). Those tables carry one row per subject × Result
// type, and raw Results counts are NOT comparable across event types —
// shallow events (app installs, content views, registrations) outnumber
// deep ones (checkouts, purchases) by orders of magnitude.
//
// A flat "sort by Results, slice(cap)" therefore fills the pack with the
// shallowest event and can silently drop the deepest — the one closest to
// revenue — so the strategy LLM reasons about the wrong layer of the funnel
// and never sees it happened. These tests pin the round-robin behaviour that
// prevents that.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { topRowsPerResultType } from "../evidenceSelection";

type Row = Record<string, unknown>;

/** Mirrors the real Bookster bundle's shape: one dominant shallow event plus three deep ones. */
function bundle(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 54; i++) {
    rows.push({ cell_id: `INSTALL_${i}`, "Result type": "Mobile app installs", Results: 500 - i });
  }
  for (let i = 0; i < 4; i++) {
    rows.push({ cell_id: `TRIAL_${i}`, "Result type": "Website trials started", Results: 4 - i });
  }
  for (let i = 0; i < 4; i++) {
    rows.push({ cell_id: `REG_${i}`, "Result type": "Website registrations completed", Results: 80 - i });
  }
  for (let i = 0; i < 5; i++) {
    rows.push({ cell_id: `CHECKOUT_${i}`, "Result type": "onb_initiate_checkout", Results: 2 - i });
  }
  return rows;
}

const typesIn = (rows: Row[]) => new Set(rows.map((r) => String(r["Result type"])));

describe("topRowsPerResultType", () => {
  it("keeps every result type represented when the cap forces truncation", () => {
    const selected = topRowsPerResultType(bundle(), 30);
    expect(selected).toHaveLength(30);
    // The exact failure this replaces: a flat sort+slice dropped both of these.
    expect(typesIn(selected)).toContain("onb_initiate_checkout");
    expect(typesIn(selected)).toContain("Website trials started");
    expect(typesIn(selected).size).toBe(4);
  });

  it("still ranks strongest-first within each result type", () => {
    const selected = topRowsPerResultType(bundle(), 30);
    const installs = selected.filter((r) => r["Result type"] === "Mobile app installs");
    const values = installs.map((r) => Number(r["Results"]));
    expect(values).toEqual([...values].sort((a, b) => b - a));
    // The single best row of the dominant type is never cut.
    expect(values[0]).toBe(500);
  });

  it("never exceeds the cap", () => {
    for (const cap of [1, 4, 7, 30, 60]) {
      expect(topRowsPerResultType(bundle(), cap).length).toBeLessThanOrEqual(cap);
    }
  });

  it("returns every row, ranked, when the set already fits under the cap", () => {
    const rows = bundle();
    const selected = topRowsPerResultType(rows, 500);
    expect(selected).toHaveLength(rows.length);
    const values = selected.map((r) => Number(r["Results"]));
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("groups rows with a missing Result type instead of dropping them", () => {
    const rows: Row[] = [
      ...Array.from({ length: 40 }, (_, i) => ({ "Result type": "Purchases", Results: 100 - i })),
      { cell_id: "UNTYPED", Results: 1 },
    ];
    const selected = topRowsPerResultType(rows, 30);
    expect(selected.some((r) => r["cell_id"] === "UNTYPED")).toBe(true);
  });

  it("handles an empty set", () => {
    expect(topRowsPerResultType([], 30)).toEqual([]);
  });
});

// Grounded against the real Bookster bundle rather than only synthetic rows:
// this is the exact dataset whose flat top-30 dropped the two deepest events
// and represented 61% of spend.
describe("topRowsPerResultType against the real Bookster bundle", () => {
  const bundlePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../../scripts/data/metrix/normalized_data_bundle.json",
  );
  const rows: Row[] = JSON.parse(fs.readFileSync(bundlePath, "utf-8")).copy_performance.map(
    (r: Record<string, unknown>) => ({ ...r, "Result type": r["result_type"], Results: r["results"] }),
  );
  const spendOf = (rs: Row[]) => rs.reduce((s, r) => s + Number(r["spend"] ?? 0), 0);

  it("the real bundle actually exercises the truncation path", () => {
    expect(rows.length).toBeGreaterThan(30);
    expect(typesIn(rows).size).toBe(4);
  });

  it("a flat sort+slice DOES drop the deepest events — the defect this replaces", () => {
    const flat = [...rows].sort((a, b) => Number(b["Results"]) - Number(a["Results"])).slice(0, 30);
    expect(typesIn(flat)).not.toContain("onb_initiate_checkout");
    expect(typesIn(flat)).not.toContain("Website trials started");
  });

  it("keeps all four real event types and materially more spend", () => {
    const selected = topRowsPerResultType(rows, 30);
    expect(selected).toHaveLength(30);
    expect(typesIn(selected).size).toBe(4);
    const flat = [...rows].sort((a, b) => Number(b["Results"]) - Number(a["Results"])).slice(0, 30);
    expect(spendOf(selected)).toBeGreaterThan(spendOf(flat));
  });
});
