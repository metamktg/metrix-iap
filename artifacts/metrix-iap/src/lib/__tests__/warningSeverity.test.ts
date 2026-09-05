// Shared warning-severity classifier — the staging popup and the
// run-history panel must agree on what counts as routine.

import { describe, expect, it } from "vitest";
import { splitWarningsBySeverity, isInformationalWarning, hasReducedConfidence } from "../warningSeverity";

describe("splitWarningsBySeverity", () => {
  it("classifies current-format lines", () => {
    const { attention, notices } = splitWarningsBySeverity([
      '12 column(s) arrived under known alternate or spreadsheet-altered names and were matched automatically (e.g. "CPM _x_" → "CPM (x)"). No action needed; the full mapping is in the column report below.',
      "Note: optional breakdown columns not present in this export (treated as blank): Campaign ID.",
      '⚠ "Ad ID" could not be read reliably from this file: 500 of 500 row(s) stored it in scientific notation…',
      'Column "Ad set ID" mapped from "Ad set data" with moderate confidence (50%). Please verify this is correct.',
      "[Coverage] Demographic rows carry $802.16 of spend (2.9% of the $28,129.5 daily-attributable total)…",
      "[Re-run] Replaced 3195 previously ingested row(s)…",
    ]);
    // Coverage is context (a notice), not a decision — three notices, three attention.
    expect(notices.length).toBe(3);
    expect(attention.length).toBe(3);
  });

  it("files a re-run that became the current analysis as a notice, and the old replaced-rows line as attention", () => {
    // Sweep slice 2: nothing is replaced during a run any more; the line
    // says what stayed and what went, and asks nothing of the reader.
    expect(isInformationalWarning("[Re-run] This run is now the account's current analysis. The previous run (2026-08-04 to 2026-09-02) is kept as the one before it. Evidence rows are kept for every run.")).toBe(true);
    expect(isInformationalWarning("[Re-run] Replaced 3195 previously ingested row(s) from an earlier analysis run in the 2026-08-04 – 2026-09-02 window.")).toBe(false);
  });

  it("classifies pre-fold stored-run lines the same way (runs persist warnings verbatim)", () => {
    expect(isInformationalWarning('[Demographics "f.csv"] Metric column "CPM (cost per 1,000 impressions)" auto-matched from "CPM _cost per 1_000 impressions_" (via slug match).')).toBe(true);
    expect(isInformationalWarning('[Ad Summary "f.csv"] Column "Day" was auto-matched from "Reporting starts" (via alias match). Renaming it to "Day" in your export will improve reliability.')).toBe(true);
    expect(isInformationalWarning('[Ad Summary "f.csv"] The following breakdown columns are missing and will be treated as blank: Campaign ID, Campaign name.')).toBe(true);
    expect(isInformationalWarning('[Ad Summary "f.csv"] Note: supplementary metric columns not found (will be null): Views.')).toBe(true);
  });

  it("keeps every decision-bearing line as attention", () => {
    for (const w of [
      '[Demographics "f.csv"] Metric column "Amount spent ({ACCOUNT_CURRENCY})" mapped from "Amount spent _USD_" with moderate confidence (67%). Please verify this is correct.',
      '[Demographics "f.csv"] The "Day" column used M/D/YYYY dates (typically a spreadsheet round-trip artifact). 500 row(s) were normalized to YYYY-MM-DD.',
      '[Placements "f.xlsx"] Column "Ad ID" appears more than once in the header row. Only the first occurrence is used.',
      "[Result type] 2377 ad/day row(s) had no result type in any export…",
      "[Duplicate data] 500 row(s) in Demographics \"f.csv\" are exact duplicates…",
      "Reconciliation check failed: Demographics rows carry $200 of spend…",
      "[Coverage] Reconciliation check failed: Device/Placement rows carry $200 of spend, 200% of the $100 daily-attributable total for this window.",
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

  it("files a Note:-prefixed moderate-confidence line (an OPTIONAL column) as a notice", () => {
    // The parser prefixes "Note:" when the moderately-matched column is a
    // non-required breakdown or a non-core metric — a wrong guess there
    // cannot corrupt spend or results, so it is context, not a decision.
    // The required/core form (no prefix) stays attention, asserted below.
    const { attention, notices } = splitWarningsBySeverity([
      'Note: Metric column "Post saves" mapped from "Post saves count" with moderate confidence (67%). Optional column, verify if you rely on it.',
      'Metric column "Link clicks" mapped from "Link clicks count" with moderate confidence (67%). Please verify this is correct.',
    ]);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("Post saves");
    expect(attention).toHaveLength(1);
    expect(attention[0]).toContain("Link clicks");
  });

  it("still treats moderate-confidence inference as attention", () => {
    const { attention, notices } = splitWarningsBySeverity([
      'Metric column "CPM" auto-matched from "CPM x" (via currency match).',
      'Metric column "CPM" mapped from "Cost per mille" with moderate confidence (67%). Please verify this is correct.',
    ]);
    expect(notices).toHaveLength(1);
    expect(attention).toHaveLength(1);
    expect(attention[0]).toContain("Please verify");
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
    "⚠ Reduced confidence: core metric columns are missing and will be null, " +
    "Impressions, Reach. Key analysis metrics (efficiency scores, CTR, CPM calculations) will be incomplete.";

  it("recognises the message the parser actually emits", () => {
    expect(hasReducedConfidence([PRODUCER_LINE])).toBe(true);
  });

  it("still recognises it if the headline half is reworded", () => {
    expect(hasReducedConfidence(["Note: core metric columns are missing and will be null, Reach."])).toBe(true);
  });

  it("does not fire on routine mapping notices", () => {
    expect(hasReducedConfidence([
      "Note: \"Date\" matched automatically to \"Day\" (via alias match) · no action needed.",
      "Note: supplementary metric columns not found (will be null): Frequency.",
    ])).toBe(false);
  });

  it("does not fire on an empty warning set", () => {
    expect(hasReducedConfidence([])).toBe(false);
  });
});

describe("whole-period and overlap lines (2026-09-04)", () => {
  it("files a whole-period note, a resolved overlap and a superseded-control note as notices; a same-depth overlap and a truth disagreement stay attention", () => {
    const { attention, notices } = splitWarningsBySeverity([
      '[Whole-period] Placements "IAP-devi-YUSIF-28D.csv": every row carries the report window start as its date, so this is a whole-period export covering 2026-08-06 to 2026-09-02, not a daily export. Its $1,340,876.12 feeds the Placements breakdowns and the reconciliation ledger at period grain; it never adds to the daily ad rows.',
      '[Overlap] Placements "IAP-PLACEPLAT-YUSIF-28D.csv" and "IAP-devi-YUSIF-28D.csv" both cover 1,718 ad(s) over the same days. "IAP-devi-YUSIF-28D.csv" carries the finer breakdown (Platform · Placement · Impression device), so its rows are used and "IAP-PLACEPLAT-YUSIF-28D.csv"\'s 3,436 row(s) ($1,340,876.12) are not counted again.',
      '[Overlap] Ad Summary "IAP-AGE-GEN-YUSIF-30D (1).xlsx" and "IAP-day-spend-YUSIF-30D-copy.csv" both cover 1,494 ad(s). "IAP-day-spend-YUSIF-30D-copy.csv" carries them by day and "IAP-AGE-GEN-YUSIF-30D (1).xlsx" as one period, so the daily rows are used and "IAP-AGE-GEN-YUSIF-30D (1).xlsx"\'s 1,494 row(s) ($1,400,000) are not counted again.',
      "[Truth] 48,104 row(s) of the daily Ad Summary (per Ad ID) appear in more than one staged file for the same ad and day; the later-staged file's rows are the control, never both.",
      '[Overlap] Ad Summary "IAP-DAY-AD-ID-YUSIF-28d.csv" and "IAP-day-spend-YUSIF-30D-copy.csv" both cover 1,718 ad(s) over the same days. "IAP-day-spend-YUSIF-30D-copy.csv" was staged later, so its rows are used and "IAP-DAY-AD-ID-YUSIF-28d.csv"\'s 48,104 row(s) ($1,338,041) are not counted again. If both are the same export, remove one of them.',
      "[Truth] amount_spent: selected control reports 1,437,538, the daily Ad Summary (per Ad ID) reports 1,338,041 (6.9% apart). The selected source is used; the disagreement is recorded, not averaged.",
    ]);
    expect(notices).toHaveLength(4);
    expect(attention).toHaveLength(2);
    expect(attention[0]).toMatch(/remove one of them/);
    expect(attention[1]).toMatch(/apart/);
  });
});
