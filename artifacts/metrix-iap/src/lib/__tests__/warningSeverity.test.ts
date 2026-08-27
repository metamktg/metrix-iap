// Shared warning-severity classifier — the staging popup and the
// run-history panel must agree on what counts as routine.

import { describe, expect, it } from "vitest";
import { splitWarningsBySeverity, isInformationalWarning, hasReducedConfidence } from "../warningSeverity";

describe("splitWarningsBySeverity", () => {
  it("classifies current-format lines", () => {
    const { attention, notices } = splitWarningsBySeverity([
      '12 column(s) arrived under known alternate or spreadsheet-altered names and were matched automatically (e.g. "CPM _x_" → "CPM (x)") — no action needed; the full mapping is in the column report below.',
      "Note: optional breakdown columns not present in this export (treated as blank): Campaign ID.",
      '⚠ "Ad ID" could not be read reliably from this file: 500 of 500 row(s) stored it in scientific notation…',
      'Column "Ad set ID" mapped from "Ad set data" with moderate confidence (50%) — please verify this is correct.',
      "[Coverage] Demographic rows carry $802.16 of spend (2.9% of the $28,129.5 daily-attributable total)…",
      "[Re-run] Replaced 3195 previously ingested row(s)…",
    ]);
    expect(notices.length).toBe(2);
    expect(attention.length).toBe(4);
  });

  it("classifies pre-fold stored-run lines the same way (runs persist warnings verbatim)", () => {
    expect(isInformationalWarning('[Demographics "f.csv"] Metric column "CPM (cost per 1,000 impressions)" auto-matched from "CPM _cost per 1_000 impressions_" (via slug match).')).toBe(true);
    expect(isInformationalWarning('[Ad Summary "f.csv"] Column "Day" was auto-matched from "Reporting starts" (via alias match). Renaming it to "Day" in your export will improve reliability.')).toBe(true);
    expect(isInformationalWarning('[Ad Summary "f.csv"] The following breakdown columns are missing and will be treated as blank: Campaign ID, Campaign name.')).toBe(true);
    expect(isInformationalWarning('[Ad Summary "f.csv"] Note: supplementary metric columns not found (will be null): Views.')).toBe(true);
  });

  it("keeps every decision-bearing line as attention", () => {
    for (const w of [
      '[Demographics "f.csv"] Metric column "Amount spent ({ACCOUNT_CURRENCY})" mapped from "Amount spent _USD_" with moderate confidence (67%) — please verify this is correct.',
      '[Demographics "f.csv"] The "Day" column used M/D/YYYY dates (typically a spreadsheet round-trip artifact) — 500 row(s) were normalized to YYYY-MM-DD.',
      '[Placements "f.xlsx"] Column "Ad ID" appears more than once in the header row — only the first occurrence is used.',
      "[Result type] 2377 ad/day row(s) had no result type in any export…",
      "[Duplicate data] 500 row(s) in Demographics \"f.csv\" are exact duplicates…",
      "Reconciliation check failed: Demographics rows carry $200 of spend…",
    ]) {
      expect(isInformationalWarning(w)).toBe(false);
    }
  });

  it("drops blank lines", () => {
    const { attention, notices } = splitWarningsBySeverity(["", "  ", "⚠ real"]);
    expect(attention).toEqual(["⚠ real"]);
    expect(notices).toEqual([]);
  });
});

describe("currency-suffix resolution is a notice, not an attention line", () => {
  // Currency-suffix resolution is deterministic (some Meta export types append
  // the account currency to every monetary column). New runs fold it into the
  // "matched automatically" summary, but runs stored before the creative-
  // metadata cascade joined the fold can carry a per-column line for it — and
  // a deterministic rename must never render as something to act on.
  it("classifies a per-column currency match as informational", () => {
    expect(
      isInformationalWarning(
        'Creative metadata column "Ad creative link caption" auto-matched from "Ad creative link caption (USD)" (via currency match).',
      ),
    ).toBe(true);
  });

  it("still treats moderate-confidence inference as attention", () => {
    const { attention, notices } = splitWarningsBySeverity([
      'Metric column "CPM" auto-matched from "CPM x" (via currency match).',
      'Metric column "CPM" mapped from "Cost per mille" with moderate confidence (67%) — please verify this is correct.',
    ]);
    expect(notices).toHaveLength(1);
    expect(attention).toHaveLength(1);
    expect(attention[0]).toContain("please verify");
  });
});

// ─── Reduced-confidence headline is classified, not substring-matched (E-b) ─
//
// The panel used to decide its headline inline with
// `w.includes("Reduced confidence") || w.includes("core metric")`. That is
// behaviour keyed on prose: a copy edit to the parser's message silently
// demotes "Analysis succeeded with reduced confidence" to a generic
// warning count, and the one line telling the user their efficiency
// metrics are incomplete disappears. These pin the classification against
// the producer's ACTUAL wording, so the two can't drift apart quietly.
describe("hasReducedConfidence", () => {
  // Verbatim from iapCsvParser's core-metric branch.
  const PRODUCER_LINE =
    "⚠ Reduced confidence: core metric columns are missing and will be null — " +
    "Impressions, Reach. Key analysis metrics (efficiency scores, CTR, CPM calculations) will be incomplete.";

  it("recognises the message the parser actually emits", () => {
    expect(hasReducedConfidence([PRODUCER_LINE])).toBe(true);
  });

  it("still recognises it if the headline half is reworded", () => {
    expect(hasReducedConfidence(["Note: core metric columns are missing and will be null — Reach."])).toBe(true);
  });

  it("does not fire on routine mapping notices", () => {
    expect(hasReducedConfidence([
      "Note: \"Date\" matched automatically to \"Day\" (via alias match) — no action needed.",
      "Note: supplementary metric columns not found (will be null): Frequency.",
    ])).toBe(false);
  });

  it("does not fire on an empty warning set", () => {
    expect(hasReducedConfidence([])).toBe(false);
  });
});
