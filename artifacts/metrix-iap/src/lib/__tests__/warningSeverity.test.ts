// Shared warning-severity classifier — the staging popup and the
// run-history panel must agree on what counts as routine.

import { describe, expect, it } from "vitest";
import { splitWarningsBySeverity, isInformationalWarning } from "../warningSeverity";

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
