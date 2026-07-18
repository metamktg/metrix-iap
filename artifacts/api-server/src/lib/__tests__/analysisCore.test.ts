import { describe, expect, it } from "vitest";
import {
  buildAnalysisCore,
  extractVariableStack,
  matrixCellOf,
  conceptCodeOf,
  humanizeCode,
  type AnalysisCoreInput,
} from "../analysisCore";
import type { IapCsvRow } from "../iapCsvParser";

function demoRow(opts: {
  adName: string;
  date: string;
  gender: string;
  age: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  results: number;
  resultType?: string;
}): IapCsvRow {
  return {
    breakdowns: {
      Date: opts.date,
      "Campaign name": "Prospecting",
      "Ad name": opts.adName,
      Gender: opts.gender,
      Age: opts.age,
    },
    base: {
      amount_spent: opts.spend,
      impressions: opts.impressions,
      clicks_all: opts.linkClicks + 5,
      link_clicks: opts.linkClicks,
      results: opts.results,
      result_type: opts.resultType ?? "Website purchases",
    },
    extra: {},
  };
}

function placementRow(opts: {
  adName: string;
  date: string;
  device: string;
  platform: string;
  placement: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  results: number;
  resultType?: string;
}): IapCsvRow {
  return {
    breakdowns: {
      Date: opts.date,
      "Campaign name": "Prospecting",
      "Ad name": opts.adName,
      "Impression device": opts.device,
      Platform: opts.platform,
      Placement: opts.placement,
    },
    base: {
      amount_spent: opts.spend,
      impressions: opts.impressions,
      clicks_all: opts.linkClicks + 5,
      link_clicks: opts.linkClicks,
      results: opts.results,
      result_type: opts.resultType ?? "Website purchases",
    },
    extra: {},
  };
}

describe("matrixCellOf", () => {
  it("extracts the leading MST cell code", () => {
    expect(matrixCellOf("C1A_CN_ICP_BusyParents_FW_PAS_001")).toBe("C1A");
    expect(matrixCellOf("C12D_something")).toBe("C12D");
  });

  it("returns null for names with no leading cell code", () => {
    expect(matrixCellOf("Summer_Sale_v2")).toBeNull();
    expect(matrixCellOf("Campaign1_ad")).toBeNull();
  });
});

describe("extractVariableStack", () => {
  it("extracts codes for each recognized prefix", () => {
    const stack = extractVariableStack("CN_Testimonial_FW_PAS_TN_Emotional_HK_Problem_001");
    expect(stack.get("concept")).toEqual(["CN_Testimonial"]);
    expect(stack.get("framework")).toEqual(["FW_PAS"]);
    expect(stack.get("tone")).toEqual(["TN_Emotional"]);
    expect(stack.get("hook")).toEqual(["HK_Problem"]);
  });

  it("handles the CN_ICP_ and CN_Design_ two-segment codes", () => {
    const stack = extractVariableStack("C1A_CN_ICP_BusyParents_CN_Design_UGC_FW_PAS_001");
    expect(stack.get("concept")).toEqual(["CN_ICP_BusyParents", "CN_Design_UGC"]);
    expect(stack.get("framework")).toEqual(["FW_PAS"]);
  });

  it("returns an empty map for conventional names with no codes", () => {
    const stack = extractVariableStack("Summer_Sale_Video_v2");
    expect(stack.size).toBe(0);
  });
});

describe("conceptCodeOf / humanizeCode", () => {
  it("prefers a non-ICP/Design concept code", () => {
    const stack = extractVariableStack("CN_ICP_BusyParents_CN_ProductDemo_FW_PAS");
    expect(conceptCodeOf(stack)).toBe("CN_ProductDemo");
  });

  it("falls back to the first concept code when only ICP/Design exist", () => {
    const stack = extractVariableStack("CN_ICP_BusyParents_FW_PAS");
    expect(conceptCodeOf(stack)).toBe("CN_ICP_BusyParents");
  });

  it("humanizes codes into readable labels", () => {
    expect(humanizeCode("CN_ProductDemo")).toBe("Product Demo");
    expect(humanizeCode("CN_ICP_BusyParents")).toBe("ICP Busy Parents");
  });
});

describe("buildAnalysisCore", () => {
  const baseInput: AnalysisCoreInput = {
    accountId: "acct_1",
    accountName: "Test Account",
    dateStart: "2026-06-01",
    dateEnd: "2026-06-02",
    sourceFiles: ["demo.csv", "placement.csv"],
    demoRows: [
      demoRow({ adName: "CN_ProductDemo_FW_PAS_001", date: "2026-06-01", gender: "female", age: "25-34", spend: 400, impressions: 8000, linkClicks: 200, results: 20 }),
      demoRow({ adName: "CN_ProductDemo_FW_PAS_001", date: "2026-06-02", gender: "male", age: "35-44", spend: 300, impressions: 6000, linkClicks: 150, results: 10 }),
      demoRow({ adName: "CN_Comparison_FW_BAB_002", date: "2026-06-01", gender: "female", age: "25-34", spend: 200, impressions: 4000, linkClicks: 80, results: 0 }),
    ],
    placementRows: [
      placementRow({ adName: "CN_ProductDemo_FW_PAS_001", date: "2026-06-01", device: "iphone", platform: "facebook", placement: "feed", spend: 400, impressions: 8000, linkClicks: 200, results: 20 }),
      placementRow({ adName: "CN_ProductDemo_FW_PAS_001", date: "2026-06-02", device: "android_smartphone", platform: "instagram", placement: "story", spend: 300, impressions: 6000, linkClicks: 150, results: 10 }),
      placementRow({ adName: "CN_Comparison_FW_BAB_002", date: "2026-06-01", device: "iphone", platform: "facebook", placement: "feed", spend: 200, impressions: 4000, linkClicks: 80, results: 0 }),
    ],
  };

  it("builds library_cell_performance rows with the fixture-shaped payload", () => {
    const core = buildAnalysisCore(baseInput);
    expect(core.libraryCellRows.length).toBe(2);
    const winner = core.libraryCellRows.find((r) => r.cell_id === "CN_ProductDemo_FW_PAS_001");
    expect(winner).toBeDefined();
    expect(winner!.payload["Amount spent (USD)"]).toBe(700);
    expect(winner!.payload["Results"]).toBe(30);
    expect(winner!.payload["Reach"]).toBeNull();
    expect(winner!.payload["framework_variable"]).toBe("FW_PAS");
    expect(winner!.payload["concept_variable"]).toBe("CN_ProductDemo");
  });

  it("extracts variable_performance rows only for codes actually present", () => {
    const core = buildAnalysisCore(baseInput);
    const families = new Set(core.variableRows.map((r) => r.variable_family));
    expect(families.has("concept")).toBe(true);
    expect(families.has("framework")).toBe(true);
    const pasRow = core.variableRows.find((r) => r.variable_id === "FW_PAS");
    expect(pasRow!.payload["Results"]).toBe(30);
  });

  it("tiers the winning concept above the failing one", () => {
    const core = buildAnalysisCore(baseInput);
    const winner = core.conceptIntelligenceRows.find((r) => r.concept_code === "CN_ProductDemo");
    const loser = core.conceptIntelligenceRows.find((r) => r.concept_code === "CN_Comparison");
    expect(winner!.performance_tier).toBe("1 - Scale Winners");
    expect(loser!.performance_tier).toBe("4 - Eliminate");
    expect(winner!.confidence_level).not.toBe("insufficient");
  });

  it("flags the zero-result, real-spend cell as a failure pattern", () => {
    const core = buildAnalysisCore(baseInput);
    expect(core.failurePatternRows.length).toBe(1);
    expect(core.failurePatternRows[0]!.payload.cell_id).toBe("CN_Comparison_FW_BAB_002");
    expect(core.failurePatternRows[0]!.engagement_present).toBe(true);
  });

  it("selects the top-performing cell as the primary control", () => {
    const core = buildAnalysisCore(baseInput);
    expect(core.coreReanalysisRead.primary_control).toBe("CN_ProductDemo_FW_PAS_001");
    expect(core.coreReanalysisRead.primary_control_read).toContain("30");
  });

  it("writes ACCOUNT-grain demographic_signal rows plus per-cell rows", () => {
    const core = buildAnalysisCore(baseInput);
    const accountRows = core.demographicSignalRows.filter((r) => r.cell_id === "ACCOUNT");
    expect(accountRows.length).toBeGreaterThan(0);
    const cellRows = core.demographicSignalRows.filter((r) => r.cell_id === "CN_ProductDemo_FW_PAS_001");
    expect(cellRows.length).toBeGreaterThan(0);
  });

  it("aggregates placement_signal by placement × platform, excluding non-delivery rows", () => {
    const core = buildAnalysisCore(baseInput);
    expect(core.placementSignalRows.length).toBe(2);
    const feed = core.placementSignalRows.find((r) => r.placement === "feed" && r.platform === "facebook");
    expect(feed!.payload["Amount spent (USD)"]).toBe(600);
  });

  it("produces a summary with real totals, never fabricated", () => {
    const core = buildAnalysisCore(baseInput);
    expect(core.analysisCoreSummary.executive_summary.total_spend).toBe(900);
    expect(core.analysisCoreSummary.executive_summary.total_results).toBe(30);
    expect(core.analysisCoreSummary.executive_summary.critical_alert).toContain("1 creative");
  });

  it("returns a null control when no cell clears the spend+results evidence threshold", () => {
    const thin: AnalysisCoreInput = {
      ...baseInput,
      demoRows: [demoRow({ adName: "Untested_ad", date: "2026-06-01", gender: "female", age: "25-34", spend: 10, impressions: 200, linkClicks: 5, results: 0 })],
      placementRows: [placementRow({ adName: "Untested_ad", date: "2026-06-01", device: "iphone", platform: "facebook", placement: "feed", spend: 10, impressions: 200, linkClicks: 5, results: 0 })],
    };
    const core = buildAnalysisCore(thin);
    expect(core.coreReanalysisRead.primary_control).toBe("No control established — pre-signal account");
  });
});
