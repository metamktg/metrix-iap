// ─── Per-objective Cost-Per-X metric derivation ────────────────────────
// Covers buildMetricCatalog's real "cost:<event>" entries: one per real
// bottom-line-totals event key the account actually reports, never a
// fixed/hardcoded list — see replit.md's ecommerce-hardcoding gotcha.

import { describe, it, expect } from "vitest";
import { buildMetricCatalog, resultCostMetricId, resultMetricId, type MetricSource } from "../metricsCatalog";

function sourceWith(resultEvents: MetricSource["resultEvents"]): MetricSource {
  return {
    spend: resultEvents.reduce((s, e) => s + e.spend, 0),
    impressions: 1_000_000,
    reach: 400_000,
    clicksAll: 30_000,
    linkClicks: 20_000,
    linkCtrPct: 2,
    resultEvents,
    isMultiEvent: resultEvents.length > 1,
  };
}

describe("buildMetricCatalog · per-objective cost metrics", () => {
  it("adds a real Cost-per-X entry for each real event, computed as spend ÷ results", () => {
    const catalog = buildMetricCatalog(
      sourceWith([{ key: "Website purchases", label: "Purchases", results: 640, spend: 1280 }])
    );
    const costEntry = catalog.find((m) => m.id === resultCostMetricId("Website purchases"));
    expect(costEntry).toBeDefined();
    expect(costEntry!.label).toBe("Cost per purchase");
    expect(costEntry!.value).toBe(2);
    expect(costEntry!.formatted).toBe("$2.00");
    expect(costEntry!.isResultEvent).toBe(true);
    expect(costEntry!.eventKey).toBe("Website purchases");
  });

  it("derives one honestly-labeled Cost-per-X metric per real event key. Never a fixed list", () => {
    const catalog = buildMetricCatalog(
      sourceWith([
        { key: "Mobile app installs", label: "Installs", results: 100, spend: 500 },
        { key: "Website trials started", label: "Trials", results: 50, spend: 250 },
        { key: "Website registrations completed", label: "Registrations", results: 200, spend: 400 },
        { key: "onb_initiate_checkout", label: "Checkouts", results: 30, spend: 150 },
      ])
    );
    const costIds = catalog.filter((m) => m.id.startsWith("cost:")).map((m) => m.id);
    expect(costIds).toEqual([
      resultCostMetricId("Mobile app installs"),
      resultCostMetricId("Website trials started"),
      resultCostMetricId("Website registrations completed"),
      resultCostMetricId("onb_initiate_checkout"),
    ]);
    expect(catalog.find((m) => m.id === resultCostMetricId("Mobile app installs"))!.label).toBe("Cost per install");
    expect(catalog.find((m) => m.id === resultCostMetricId("Website trials started"))!.label).toBe("Cost per trial");
    expect(catalog.find((m) => m.id === resultCostMetricId("Website registrations completed"))!.label).toBe(
      "Cost per registration"
    );
    expect(catalog.find((m) => m.id === resultCostMetricId("onb_initiate_checkout"))!.label).toBe("Cost per checkout");
  });

  it("omits the Cost-per-X entry entirely when results is 0. Never divides by zero", () => {
    const catalog = buildMetricCatalog(
      sourceWith([{ key: "Website purchases", label: "Purchases", results: 0, spend: 500 }])
    );
    expect(catalog.some((m) => m.id === resultCostMetricId("Website purchases"))).toBe(false);
    // The raw result-count entry still shows (honest zero), only the cost ratio is hidden.
    expect(catalog.some((m) => m.id === resultMetricId("Website purchases"))).toBe(true);
  });

  it("produces a genuinely per-account metric list. Different accounts get different Cost-per-X entries", () => {
    const accountA = buildMetricCatalog(
      sourceWith([{ key: "Website purchases", label: "Purchases", results: 640, spend: 1280 }])
    );
    const accountB = buildMetricCatalog(
      sourceWith([{ key: "Website registrations completed", label: "Registrations", results: 300, spend: 900 }])
    );
    const costIdsA = accountA.filter((m) => m.id.startsWith("cost:")).map((m) => m.id);
    const costIdsB = accountB.filter((m) => m.id.startsWith("cost:")).map((m) => m.id);
    expect(costIdsA).toEqual([resultCostMetricId("Website purchases")]);
    expect(costIdsB).toEqual([resultCostMetricId("Website registrations completed")]);
    expect(costIdsA).not.toEqual(costIdsB);
  });

  it("computes an independent Cost-per-X for each event in a multi-event account (no cross-event blending)", () => {
    const catalog = buildMetricCatalog(
      sourceWith([
        { key: "Website purchases", label: "Purchases", results: 640, spend: 1280 },
        { key: "onb_initiate_checkout", label: "Checkouts", results: 100, spend: 50 },
      ])
    );
    expect(catalog.find((m) => m.id === resultCostMetricId("Website purchases"))!.value).toBe(2);
    expect(catalog.find((m) => m.id === resultCostMetricId("onb_initiate_checkout"))!.value).toBe(0.5);
  });
});
