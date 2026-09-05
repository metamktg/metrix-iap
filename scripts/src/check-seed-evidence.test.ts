// The seed evidence carriage check, its pure half.
//
// On 2026-09-05 production read every ledger page for a run (0 errors in
// the request logs) and shipped the account with an empty ledger. The
// request logs cannot see that; only the payload can. These tests pin the
// verdicts the operator check draws from a payload.

import { describe, it, expect } from "vitest";
import { readEvidence, findings } from "./check-seed-evidence";

const account = (over: Record<string, unknown>) => ({
  id: "manual_x",
  name: "Pure Path",
  latest_analysis_run_id: "8148628c",
  reconciliation: {
    summary: { truth_source: "ad_summary_ad_id", breakdowns: [{ breakdown: "demographic" }, { breakdown: "placement" }] },
    ledger: Array.from({ length: 5 }, () => ({})),
  },
  ad_breakdowns: Array.from({ length: 3 }, () => ({})),
  variable_segment_performance: [],
  ...over,
});

describe("readEvidence", () => {
  it("reads the counts an account carries, from either accounts key", () => {
    const [a] = readEvidence({ accounts: [account({})] });
    expect(a).toEqual({
      id: "manual_x", name: "Pure Path", runId: "8148628c", summaryBreakdowns: 2,
      truthSource: "ad_summary_ad_id", ledger: 5, breakdowns: 3, segments: 0,
    });
    expect(readEvidence({ ad_accounts: [account({})] })).toHaveLength(1);
    expect(readEvidence({})).toEqual([]);
  });

  it("reads zeros, not throws, for an account with no evidence layer", () => {
    const [a] = readEvidence({ accounts: [{ id: "new", name: "New", latest_analysis_run_id: null, reconciliation: null }] });
    expect(a).toMatchObject({ runId: null, summaryBreakdowns: 0, ledger: 0, breakdowns: 0, segments: 0 });
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
