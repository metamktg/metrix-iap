// ─── Derived recommendations ──────────────────────────────────────────
// The recommendation surfaces read one array that no account has ever had
// written to it. This module fills it from the rows that do exist, and the
// whole value of that depends on the numbers being real — so these tests
// recompute them from the fixture rather than restating what the module
// produced.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveRecommendations, toDeckCards } from "../recommendations";
import { scopeToRun } from "@/lib/run-supersede";
import type { AdAccount } from "../seedTypes";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);
const accounts = seed.ad_accounts as AdAccount[];
const bookster = accounts.find((a) => a.id === "bookster")!;

describe("deriveRecommendations", () => {
  it("fills the empty schema: an account with a playbook and no optimization loop still gets cards", () => {
    expect(bookster.iap?.optimization_loop).toBeFalsy();
    const recs = deriveRecommendations(bookster);
    expect(recs.length).toBeGreaterThan(0);
    // Every card is checkable: it names the JSON it came from and where the
    // evidence lives. A recommendation you cannot check is an opinion.
    for (const r of recs) {
      expect(r.source, `${r.id} has no source`).toBeTruthy();
      expect(r.href, `${r.id} has no evidence link`).toBeTruthy();
      expect(r.title.trim().length).toBeGreaterThan(0);
      expect(r.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  it("leads with the money being lost, not with the wins", () => {
    const recs = deriveRecommendations(bookster);
    const firstDerived = recs.find((r) => r.derived)!;
    expect(firstDerived.id.startsWith("derived:avoid")).toBe(true);
    const avoidIdx = recs.findIndex((r) => r.id.startsWith("derived:avoid"));
    const scaleIdx = recs.findIndex((r) => r.id.startsWith("derived:scale"));
    const testIdx = recs.findIndex((r) => r.id.startsWith("derived:test"));
    expect(avoidIdx).toBeLessThan(scaleIdx);
    expect(scaleIdx).toBeLessThan(testIdx);
  });

  it("carries the account's own measured numbers, recomputed here from the rollup", () => {
    const recs = deriveRecommendations(bookster);
    const analysis = bookster.iap!.analysis;
    const rollup = scopeToRun(analysis.concept_rollup ?? [], analysis.latest_analysis_run_id ?? null);

    // "BOOK0 Concept C2 (esp. Row B)" → the BOOK0 C2 rollup rows.
    const scale = recs.find((r) => r.id === "derived:scale:0")!;
    expect(scale.title).toContain("C2");
    const rows = rollup.filter((r) => r.book === "BOOK0" && r.concept === "C2");
    expect(rows.length).toBeGreaterThan(0);
    const spend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
    const results = rows.reduce((s, r) => s + (r.results ?? 0), 0);
    expect(results).toBeGreaterThan(0);
    const cpa = spend / results;
    // The card states cost per result, formatted to the platform's precision.
    expect(scale.metric).not.toBeNull();
    expect(scale.metric!.label).toBe("Cost per result");
    expect(scale.metric!.value).toBe(`$${cpa.toFixed(2)}`);
    expect(scale.rationale).toContain("per result");
  });

  it("never invents a number: a reference the rollup cannot match says so and carries none", () => {
    const recs = deriveRecommendations(bookster);
    // The validate lane names audience work ("Male 55-64 …"), which no
    // concept rollup row measures.
    const validate = recs.filter((r) => r.id.startsWith("derived:validate"));
    expect(validate.length).toBeGreaterThan(0);
    for (const v of validate) {
      expect(v.metric).toBeNull();
      expect(v.confidence).toBe("unvalidated");
    }
    // And a scale/avoid entry with no matching row states the absence in
    // words rather than showing $0.
    const unmatched = recs.filter((r) => r.derived && r.metric == null && r.rationale.includes("carry no measurement"));
    for (const u of unmatched) expect(u.rationale).not.toMatch(/\$0(\.00)?\b/);
  });

  it("reports spend that produced nothing, with the diagnosis the engine recorded", () => {
    const recs = deriveRecommendations(bookster);
    const investigate = recs.filter((r) => r.id.startsWith("derived:investigate"));
    expect(investigate.length).toBeGreaterThan(0);
    const patterns = (bookster.iap!.intelligence as { failure_patterns: { wasted_spend?: number; campaign?: string }[] })
      .failure_patterns;
    const worst = patterns.find((p) => (p.wasted_spend ?? 0) > 0)!;
    const card = investigate.find((r) => r.title.includes(worst.campaign!))!;
    expect(card.metric!.label).toBe("Spend, no result");
    expect(card.metric!.value).toContain("$");
    expect(card.href).toBe("/app/analysis/findings");
  });

  it("does not state the same campaign twice when a failure pattern already covers it", () => {
    const recs = deriveRecommendations(bookster);
    const campaigns = recs
      .filter((r) => r.id.startsWith("derived:investigate") || r.id.startsWith("derived:data"))
      .map((r) => r.title);
    expect(new Set(campaigns).size).toBe(campaigns.length);
  });

  it("lets a generated card win: the loop's own output leads and is not marked derived", () => {
    const withLoop = {
      ...bookster,
      iap: {
        ...bookster.iap!,
        optimization_loop: {
          recommendation_cards: [
            {
              id: "REC_001",
              title: "Generated card",
              rationale: "From the loop",
              recommended_action: "Do the thing",
              impact: "high",
              confidence: "high",
              scope: "creative",
            },
          ],
        },
      },
    } as unknown as AdAccount;
    const recs = deriveRecommendations(withLoop);
    expect(recs[0]!.id).toBe("REC_001");
    expect(recs[0]!.derived).toBe(false);
    expect(recs.some((r) => r.derived)).toBe(true);
  });

  it("is pure — same account in, identical cards out", () => {
    expect(deriveRecommendations(bookster)).toEqual(deriveRecommendations(bookster));
  });

  it("returns nothing for an account with no IAP payload, rather than a placeholder", () => {
    expect(deriveRecommendations(null)).toEqual([]);
    expect(deriveRecommendations({ id: "x", name: "x" } as unknown as AdAccount)).toEqual([]);
  });

  it("every configured account in the fixture produces at least one checkable card", () => {
    for (const a of accounts) {
      if (!a.iap?.strategy && !a.iap?.intelligence) continue;
      const recs = deriveRecommendations(a);
      for (const r of recs) expect(r.source, `${a.id}/${r.id}`).toBeTruthy();
    }
  });

  it("hands the deck exactly the shape it already consumes", () => {
    const cards = toDeckCards(deriveRecommendations(bookster));
    for (const c of cards) {
      expect(Object.keys(c).sort()).toEqual(
        ["actionGroup", "confidence", "id", "impact", "rationale", "recommendedAction", "scope", "title"].sort(),
      );
    }
  });
});
