// The seed evidence carriage check, its pure half.
//
// On 2026-09-05 production read every ledger page for a run (0 errors in
// the request logs) and shipped the account with an empty ledger. The
// request logs cannot see that; only the payload can. These tests pin the
// verdicts the operator check draws from a payload.

import { describe, it, expect } from "vitest";
import { readEvidence, findings, shapeRecognised } from "./check-seed-evidence";

// The evidence layer sits under account.iap.analysis (seedTypes.ts
// AnalysisData), the block the client reads through getAnalysisData().
const account = (over: Record<string, unknown>) => ({
  id: "manual_x",
  name: "Pure Path",
  iap: {
    analysis: {
      latest_analysis_run_id: "8148628c",
      reconciliation: {
        summary: { truth_source: "ad_summary_ad_id", breakdowns: [{ breakdown: "demographic" }, { breakdown: "placement" }] },
        ledger: Array.from({ length: 5 }, () => ({})),
      },
      ad_breakdowns: Array.from({ length: 3 }, () => ({})),
      variable_segment_performance: [],
      ...over,
    },
  },
});

describe("readEvidence", () => {
  it("reads the counts an account carries, from either accounts key", () => {
    const [a] = readEvidence({ accounts: [account({})] });
    expect(a).toEqual({
      id: "manual_x", name: "Pure Path", hasAnalysis: true, runId: "8148628c", summaryBreakdowns: 2,
      truthSource: "ad_summary_ad_id", ledger: 5, breakdowns: 3, segments: 0,
    });
    expect(readEvidence({ ad_accounts: [account({})] })).toHaveLength(1);
    expect(readEvidence({})).toEqual([]);
  });

  it("reads zeros, not throws, for an account with no evidence layer", () => {
    const [a] = readEvidence({ accounts: [{ id: "new", name: "New", iap: { analysis: { latest_analysis_run_id: null, reconciliation: null } } }] });
    expect(a).toMatchObject({ hasAnalysis: true, runId: null, summaryBreakdowns: 0, ledger: 0, breakdowns: 0, segments: 0 });
  });

  it("reads nothing off the account's top level: the layer lives under iap.analysis", () => {
    // The first run of this check read the top level, printed "no run" for
    // every account and exited 0 on a seed carrying 162k ledger rows.
    const topLevel = { id: "manual_x", name: "Pure Path", latest_analysis_run_id: "8148628c", reconciliation: { summary: { breakdowns: [{}] }, ledger: [{}] }, ad_breakdowns: [{}] };
    const [a] = readEvidence({ ad_accounts: [topLevel] });
    expect(a).toMatchObject({ hasAnalysis: false, runId: null, ledger: 0, breakdowns: 0 });
  });
});

describe("shapeRecognised", () => {
  it("is false when no account carries iap.analysis, so the run exits 2 instead of passing vacuously", () => {
    const topLevelOnly = [{ id: "a", name: "A", latest_analysis_run_id: "x", reconciliation: { summary: { breakdowns: [{}] }, ledger: [] } }];
    expect(shapeRecognised(readEvidence({ ad_accounts: topLevelOnly }))).toBe(false);
    expect(shapeRecognised(readEvidence({}))).toBe(false);
  });

  it("is true as soon as one account carries the analysis block, even an empty one", () => {
    expect(shapeRecognised(readEvidence({ ad_accounts: [{ id: "n", name: "N" }, { id: "a", name: "A", iap: { analysis: {} } }] }))).toBe(true);
    expect(shapeRecognised(readEvidence({ accounts: [account({})] }))).toBe(true);
  });
});

describe("findings", () => {
  it("is silent when a reconciled account carries its ledger and breakdowns", () => {
    expect(findings(readEvidence({ accounts: [account({})] }))).toEqual([]);
  });

  it("names the account whose summary says rows were written but the seed carries none", () => {
    // The 2026-09-05 shape: summary present, breakdowns present, ledger empty.
    const out = findings(readEvidence({ accounts: [account({ reconciliation: { summary: { truth_source: "ad_summary_ad_id", breakdowns: [{}] }, ledger: [] } })] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/manual_x.*0 ledger rows/);
  });

  it("names a missing breakdown layer too, and both when both are gone", () => {
    const out = findings(readEvidence({ accounts: [account({ ad_breakdowns: [], reconciliation: { summary: { breakdowns: [{}] }, ledger: [] } })] }));
    expect(out).toHaveLength(2);
    expect(out.join("\n")).toMatch(/0 ad-grain breakdown rows/);
  });

  it("does not judge an account with no run, or a run that reconciled nothing", () => {
    const noRun = account({ latest_analysis_run_id: null, reconciliation: null, ad_breakdowns: [] });
    const nothingReconciled = account({ reconciliation: { summary: { breakdowns: [] }, ledger: [] }, ad_breakdowns: [] });
    expect(findings(readEvidence({ accounts: [noRun, nothingReconciled] }))).toEqual([]);
  });

  it("never judges segments: an account without a variable library has none", () => {
    expect(findings(readEvidence({ accounts: [account({ variable_segment_performance: [] })] }))).toEqual([]);
  });
});
