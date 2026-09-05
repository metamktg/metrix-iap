// ─── useCreativeEvidence through an ad's own name ───────────────────────
// The Library's ad-level tiles carry conceptCode "AD" (every ad without a
// cell code shares it). The dialog looked cell "AD" up, found no ad, and
// said "No mapped ads" and "No demographic data" for an ad whose run had
// written 20 per-ad demographic rows. The hook takes the ad names the card
// stands for as the identity's second path.

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const account = {
  id: "acct",
  ads: [
    { ad_name: "(car detail) hook 1", cell: null, meta_ad_id: "111", meta_ad_ids: ["111", "112"] },
    { ad_name: "Other", cell: "C2B", meta_ad_id: "999", meta_ad_ids: ["999"] },
  ],
  creative_assets: [],
  variable_evidence: [],
  iap: {
    analysis: {
      demographic_registration_signal: [],
      ad_breakdowns: [
        { breakdown: "demographic", ad_identity_kind: "ad_id", ad_identity: "111", spend: 10, results: 1, evidence_state: "observed_reconciled", coverage_pct: 100 },
        { breakdown: "demographic", ad_identity_kind: "ad_id", ad_identity: "112", spend: 5, results: 0, evidence_state: "observed_reconciled", coverage_pct: 100 },
        { breakdown: "placement", ad_identity_kind: "ad_id", ad_identity: "111", spend: 15, results: 1, evidence_state: "observed_reconciled", coverage_pct: 100 },
        { breakdown: "demographic", ad_identity_kind: "ad_id", ad_identity: "999", spend: 99, results: 9, evidence_state: "observed_reconciled", coverage_pct: 100 },
      ],
      reconciliation: { ledger: [] },
    },
  },
  mst: { local_book2_library: [] },
};

vi.mock("@/contexts/MetrixDataContext", () => ({ useMetrixSeed: () => ({ ad_accounts: [account] }) }));
vi.mock("@/contexts/AccountContext", () => ({ useScopedAdAccountId: () => "acct" }));

import { useCreativeEvidence } from "../useCreativeEvidence";

describe("useCreativeEvidence", () => {
  it("an ad-level card resolves its evidence through its own name, then its Meta ad ids", () => {
    const { result } = renderHook(() => useCreativeEvidence("AD", ["(car detail) hook 1"]));
    expect(result.current.identity.via).toBe("mapped_names");
    expect(result.current.identity.adIds.sort()).toEqual(["111", "112"]);
    expect(result.current.demographic).toHaveLength(2);
    expect(result.current.placement).toHaveLength(1);
    expect(result.current.layerPresent).toBe(true);
  });

  it("without the names, the shared AD code resolves to nothing, as before", () => {
    const { result } = renderHook(() => useCreativeEvidence("AD"));
    expect(result.current.identity.via).toBe("none");
    expect(result.current.demographic).toHaveLength(0);
  });

  it("a cell code still wins over the names when the cell has ads", () => {
    const { result } = renderHook(() => useCreativeEvidence("C2B", ["(car detail) hook 1"]));
    expect(result.current.identity.via).toBe("cell");
    expect(result.current.identity.adIds).toEqual(["999"]);
  });
});
