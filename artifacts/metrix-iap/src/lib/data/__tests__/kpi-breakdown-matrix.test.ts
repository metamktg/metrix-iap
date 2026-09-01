// ─── KPI breakdown matrix: every account × dimension × metric ─────────
//
// The drill-down modal lets a user pick any metric against any breakdown
// dimension, so the combinations multiply and no click-through covers them
// all. The logic behind it is pure, so it can be driven exhaustively over
// the real fixture instead.
//
// What this asserts is the honesty contract the modal's own header states:
// "Blended ratios are always summed-numerator ÷ summed-denominator and
// unavailable values render 'n/a' — never zero." A NaN, an Infinity, or a
// fabricated 0 where the answer is genuinely unknown are each a defect,
// and none of them are visible from a single screenshot.

import { describe, expect, it } from "vitest";

import seedBundle from "../../../test-fixtures/metrix_seed_bundle.json";
import { STATIC_METRIC_IDS } from "../metricsCatalog";
import type { AdAccount, AnalysisData } from "../seedTypes";
import {
  listBreakdownDimensions,
  dimensionMetricRestriction,
  buildAccountBreakdown,
  buildManagerBreakdown,
  formatBreakdownValue,
  metricValueFromTotals,
  accountTotalsForMetric,
  sortBreakdownRows,
} from "../kpiBreakdown";

const accounts = (seedBundle as { ad_accounts?: AdAccount[] }).ad_accounts ?? [];

/** Every metric a tile can show, including the per-account result events. */
function metricIdsFor(account: AdAccount): string[] {
  const base = [...STATIC_METRIC_IDS];
  const events = Object.keys(
    (account.iap?.campaign_summary?.bottom_line_totals ?? {}) as Record<
      string,
      unknown
    >,
  ).map((e) => `result:${e}`);
  return [...base, ...events];
}

interface Combination {
  account: string;
  dimension: string;
  metric: string;
}

/** Walk every account × dimension × metric the UI can actually reach. */
function eachCombination(
  visit: (c: Combination, analysis: AnalysisData) => void,
): number {
  let n = 0;
  for (const account of accounts) {
    const analysis = account.iap?.analysis as AnalysisData | undefined;
    if (!analysis) continue;
    for (const dim of listBreakdownDimensions(analysis)) {
      for (const metric of metricIdsFor(account)) {
        if (dimensionMetricRestriction(dim.id, metric) != null) continue;
        visit(
          { account: String(account.id), dimension: dim.id, metric },
          analysis,
        );
        n += 1;
      }
    }
  }
  return n;
}

describe("KPI breakdown matrix (every account × dimension × metric)", () => {
  it("reaches a non-trivial number of combinations", () => {
    const n = eachCombination(() => {});
    // Guard the guard: if the fixture ever stops producing dimensions, this
    // whole suite would pass vacuously.
    expect(n).toBeGreaterThan(50);
  });

  it("never produces NaN or Infinity in any cell", () => {
    const bad: string[] = [];
    eachCombination((c, analysis) => {
      for (const row of buildAccountBreakdown(analysis, c.dimension, c.metric)) {
        if (row.value === null) continue;
        if (!Number.isFinite(row.value)) {
          bad.push(
            `${c.account} · ${c.dimension} · ${c.metric} · "${row.label}" → ${row.value}`,
          );
        }
      }
    });
    expect(bad, `Non-finite breakdown values:\n${bad.join("\n")}`).toEqual([]);
  });

  it("formats every value as a real string, never 'NaN' or 'undefined'", () => {
    const bad: string[] = [];
    eachCombination((c, analysis) => {
      for (const row of buildAccountBreakdown(analysis, c.dimension, c.metric)) {
        const text = formatBreakdownValue(c.metric, row.value);
        if (
          text === "" ||
          /NaN|undefined|null|Infinity/i.test(text)
        ) {
          bad.push(
            `${c.account} · ${c.dimension} · ${c.metric} · "${row.label}" → ${JSON.stringify(text)}`,
          );
        }
      }
    });
    expect(bad, `Malformed rendered values:\n${bad.join("\n")}`).toEqual([]);
  });

  it("renders an unavailable value as 'n/a', never as zero", () => {
    // The rule that matters most: a null must not become 0 on the way to the
    // screen, because 0 is a measurement and null is the absence of one.
    expect(formatBreakdownValue("cpa_blended", null)).toBe("n/a");
    expect(formatBreakdownValue("spend", null)).toBe("n/a");
    expect(formatBreakdownValue("result:purchase", null)).toBe("n/a");
    // And a real zero still renders as a number, not as "n/a".
    expect(formatBreakdownValue("spend", 0)).not.toBe("n/a");
  });

  it("derives ratio metrics from summed numerator ÷ summed denominator", () => {
    // Not an average of per-row ratios — that is the classic wrong answer,
    // and it only shows up when row sizes differ.
    const totals = {
      spend: 100,
      impressions: 10_000,
      linkClicks: 200,
      clicksAll: 400,
      results: 50,
      reach: 5_000,
      resultsByEvent: {},
    };
    expect(metricValueFromTotals("cpc", totals)).toBeCloseTo(100 / 200, 10);
    expect(metricValueFromTotals("cpm", totals)).toBeCloseTo(
      (100 / 10_000) * 1000,
      10,
    );
    expect(metricValueFromTotals("link_ctr", totals)).toBeCloseTo(
      (200 / 10_000) * 100,
      10,
    );
    expect(metricValueFromTotals("cpa_blended", totals)).toBeCloseTo(
      100 / 50,
      10,
    );
  });

  it("returns null, not zero, when a ratio's denominator is zero", () => {
    const empty = {
      spend: 10,
      impressions: 0,
      linkClicks: 0,
      clicksAll: 0,
      results: 0,
      reach: 0,
      resultsByEvent: {},
    };
    for (const id of ["cpc", "cpm", "link_ctr", "ctr_all", "cpa_blended", "cvr"]) {
      expect(
        metricValueFromTotals(id, empty),
        `${id} must be null when its denominator is 0, not a fabricated number`,
      ).toBeNull();
    }
  });

  it("sorts without dropping or duplicating rows, and puts nulls last", () => {
    const bad: string[] = [];
    eachCombination((c, analysis) => {
      const rows = buildAccountBreakdown(analysis, c.dimension, c.metric);
      if (rows.length < 2) return;
      for (const dir of ["asc", "desc"] as const) {
        const sorted = sortBreakdownRows(rows, dir);
        if (sorted.length !== rows.length) {
          bad.push(`${c.account}·${c.dimension}·${c.metric} ${dir}: length changed`);
          continue;
        }
        const before = rows.map((r) => r.label).sort().join("|");
        const after = sorted.map((r) => r.label).sort().join("|");
        if (before !== after) {
          bad.push(`${c.account}·${c.dimension}·${c.metric} ${dir}: row set changed`);
        }
        // A null value has no rank; it must not be treated as the best score.
        const firstNull = sorted.findIndex((r) => r.value === null);
        if (firstNull !== -1) {
          const afterNull = sorted.slice(firstNull);
          if (afterNull.some((r) => r.value !== null)) {
            bad.push(
              `${c.account}·${c.dimension}·${c.metric} ${dir}: a measured row sorts after an unmeasured one`,
            );
          }
        }
      }
    });
    expect(bad, `Sorting defects:\n${bad.join("\n")}`).toEqual([]);
  });

  it("gives every breakdown row a non-empty label", () => {
    const bad: string[] = [];
    eachCombination((c, analysis) => {
      for (const row of buildAccountBreakdown(analysis, c.dimension, c.metric)) {
        if (!row.label || !String(row.label).trim()) {
          bad.push(`${c.account} · ${c.dimension} · ${c.metric} → empty label`);
        }
      }
    });
    expect(bad, `Unlabelled rows:\n${bad.join("\n")}`).toEqual([]);
  });

  it("keeps the manager roll-up finite and labelled for every metric", () => {
    const bad: string[] = [];
    for (const metric of STATIC_METRIC_IDS) {
      for (const row of buildManagerBreakdown(accounts, metric)) {
        if (row.value !== null && !Number.isFinite(row.value)) {
          bad.push(`manager · ${metric} · "${row.label}" → ${row.value}`);
        }
        if (!row.label || !String(row.label).trim()) {
          bad.push(`manager · ${metric} → empty label`);
        }
      }
    }
    expect(bad, `Manager roll-up defects:\n${bad.join("\n")}`).toEqual([]);
  });

  it("keeps per-account totals finite for every metric", () => {
    const bad: string[] = [];
    for (const account of accounts) {
      for (const metric of metricIdsFor(account)) {
        const totals = accountTotalsForMetric(account, metric);
        for (const [k, v] of Object.entries(totals)) {
          if (typeof v === "number" && !Number.isFinite(v)) {
            bad.push(`${account.id} · ${metric} · totals.${k} → ${v}`);
          }
        }
        const value = metricValueFromTotals(metric, totals);
        if (value !== null && !Number.isFinite(value)) {
          bad.push(`${account.id} · ${metric} → ${value}`);
        }
      }
    }
    expect(bad, `Account total defects:\n${bad.join("\n")}`).toEqual([]);
  });

  it("states a reason whenever a dimension refuses a metric", () => {
    // The tracking-basis rule is a real restriction; it must explain itself
    // rather than silently rendering an empty chart.
    const unexplained: string[] = [];
    for (const account of accounts) {
      const analysis = account.iap?.analysis as AnalysisData | undefined;
      if (!analysis) continue;
      for (const dim of listBreakdownDimensions(analysis)) {
        for (const metric of metricIdsFor(account)) {
          const reason = dimensionMetricRestriction(dim.id, metric);
          if (reason === null) continue;
          if (!reason.trim() || reason.length < 20) {
            unexplained.push(`${dim.id} × ${metric} → ${JSON.stringify(reason)}`);
          }
          // A refused combination must also return no rows, so the UI cannot
          // show a chart and a restriction notice at the same time.
          const rows = buildAccountBreakdown(analysis, dim.id, metric);
          if (rows.length > 0) {
            unexplained.push(
              `${dim.id} × ${metric} is restricted but still returned ${rows.length} row(s)`,
            );
          }
        }
      }
    }
    expect(
      unexplained,
      `Restrictions without a usable reason:\n${unexplained.join("\n")}`,
    ).toEqual([]);
  });

  it("never shows a raw internal identifier in the dimension picker", () => {
    // A dropdown is user-facing copy. A snake_case identifier reaching it —
    // "raw_token variables" was the live case — reads as a leak, and worse,
    // labels ad-name fragments as if they were strategic variables.
    const bad: string[] = [];
    for (const account of accounts) {
      const analysis = account.iap?.analysis as AnalysisData | undefined;
      if (!analysis) continue;
      for (const dim of listBreakdownDimensions(analysis)) {
        if (/_/.test(dim.label)) {
          bad.push(`${account.id} · ${dim.id} → ${JSON.stringify(dim.label)}`);
        }
        if (!dim.label.trim()) {
          bad.push(`${account.id} · ${dim.id} → empty label`);
        }
      }
    }
    expect(
      bad,
      `Dimension labels leaking an identifier:\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("calls raw ad-name tokens what they are, not a variable family", () => {
    const belt = accounts.find((a) => a.id === "manual_gXU2GXOGunDq");
    expect(belt, "fixture no longer carries the manual-import account").toBeTruthy();
    const dims = listBreakdownDimensions(belt!.iap?.analysis as AnalysisData);
    const token = dims.find((d) => d.id === "var:raw_token");
    expect(token, "the raw_token dimension should still be offered").toBeTruthy();
    expect(token!.label).toBe("Ad-name token");
  });
});

describe("an ad-name token has no impressions to show", () => {
  // The Impressions breakdown for var:raw_token rendered a column of "0"
  // against tokens that had really spent thousands. analysisEngine writes
  // Reach/Impressions/Clicks(all) as literal 0 for these rows "so numeric
  // consumers don't receive undefined" — a token is a substring shared by many
  // ads and has no impression count of its own — and the client rendered those
  // zeros as a measurement.

  function tokenAccount() {
    for (const account of accounts) {
      const analysis = account.iap?.analysis;
      const rows = (analysis?.v3_variable_performance ?? []).filter(
        (r: any) => r.variable_family === "raw_token",
      );
      if (rows.length > 0) return { id: account.id, analysis: analysis as any, rows };
    }
    return null;
  }

  it("the fixture carries the shape this guards against", () => {
    const acct = tokenAccount();
    expect(acct, "no account in the fixture has raw_token rows").not.toBeNull();
    // Spend is real, impressions are all zero — that is the whole defect.
    expect(acct!.rows.some((r: any) => (r["Amount spent (USD)"] ?? 0) > 0)).toBe(true);
    expect(acct!.rows.every((r: any) => (r.Impressions ?? 0) === 0)).toBe(true);
  });

  it("says impressions are not attributable rather than showing zeros", () => {
    const reason = dimensionMetricRestriction("var:raw_token", "impressions");
    expect(reason ?? "").toMatch(/no impressions, reach or clicks of its own/i);
    const acct = tokenAccount()!;
    expect(buildAccountBreakdown(acct.analysis, "var:raw_token", "impressions")).toEqual([]);
  });

  it("still shows the metrics a token CAN carry", () => {
    const acct = tokenAccount()!;
    for (const metric of ["spend", "link_clicks"]) {
      expect(dimensionMetricRestriction("var:raw_token", metric)).toBeNull();
      const rows = buildAccountBreakdown(acct.analysis, "var:raw_token", metric);
      expect(rows.length, `${metric} lost its rows`).toBeGreaterThan(0);
      expect(rows.some((r) => (r.value ?? 0) > 0), `${metric} is all zero`).toBe(true);
    }
  });

  it("blocks every metric that divides by impressions", () => {
    for (const metric of ["reach", "clicks_all", "ctr_all", "link_ctr", "cpm"]) {
      expect(dimensionMetricRestriction("var:raw_token", metric), metric).toBeTruthy();
    }
  });
});
