// ─── The lower funnel is staged from the account's own result events ─────
// It used to be three hardcoded ecommerce columns (adds_to_cart,
// checkouts_initiated, purchases), so a lead-gen account with 4,323 leads
// and an app account with 486 installs showed EMPTY intent and conversion
// bands (audit round 5, 2026-09-05). The demographic rows carry a Result
// type per row: an intermediate conversion event is an intent stage, a
// terminal one a conversion stage, the export's own columns keep winning
// for the event they name, and a row that carries neither is the gap it
// always was.

import { describe, it, expect } from "vitest";
import { buildFunnelStages, describeLowerFunnel } from "../EngagementFunnelView";
import type { DemographicRow } from "@/lib/data/seedTypes";

function row(over: Partial<DemographicRow> = {}): DemographicRow {
  return {
    cell_id: "ACCOUNT",
    "Ad name": "All ads",
    Age: "25-34",
    Gender: "female",
    "Amount spent (USD)": 100,
    Reach: 900,
    Impressions: 1000,
    Results: 10,
    "Clicks (all)": 80,
    "Link clicks": 40,
    CPA_result: 10,
    CTR_link_pct: 4,
    Result_per_link_click_pct: 25,
    ...over,
  };
}

const ids = (rows: DemographicRow[]) => buildFunnelStages(rows).map((s) => s.id);
const stage = (rows: DemographicRow[], id: string) => buildFunnelStages(rows).find((s) => s.id === id)!;

describe("buildFunnelStages · result events", () => {
  it("a lead-gen export stages its leads as the conversion band, read from the rows' Result type", () => {
    const rows = [row({ "Result type": "Leads (form)", Results: 30 }), row({ "Result type": "Leads (form)", Results: 12 })];
    expect(ids(rows)).toEqual(["impressions", "clicks_all", "link_clicks", "lead"]);
    const lead = stage(rows, "lead");
    expect(lead.label).toBe("Leads");
    expect(lead.zone).toBe("conversion");
    expect(lead.value).toBe(42);
    expect(lead.basis).toBe("result_type");
    // 42 leads over 80 link clicks.
    expect(lead.pctOfPrev).toBeCloseTo(52.5, 3);
    // No phantom cart / checkout / purchase slots on an export that never tracked them.
    expect(ids(rows)).not.toContain("purchases");
  });

  it("an intermediate event is an intent stage, in purchase-path order, and a terminal event follows it", () => {
    const rows = [
      row({ "Result type": "Website checkouts initiated", Results: 20 }),
      row({ "Result type": "Website adds to cart", Results: 50 }),
      row({ "Result type": "Website purchases", Results: 5 }),
      row({ "Result type": "Mobile app installs", Results: 8 }),
    ];
    expect(ids(rows)).toEqual(["impressions", "clicks_all", "link_clicks", "add_to_cart", "initiate_checkout", "app_install", "purchase"]);
    expect(stage(rows, "add_to_cart").zone).toBe("intent");
    expect(stage(rows, "initiate_checkout").zone).toBe("intent");
    // The intent chain steps: checkout over cart.
    expect(stage(rows, "initiate_checkout").pctOfPrev).toBeCloseTo(40, 3);
  });

  it("terminal events are alternatives: each is measured against the last stage before the conversion band, never its neighbour", () => {
    const rows = [
      row({ "Result type": "Website adds to cart", Results: 50 }),
      row({ "Result type": "Website purchases", Results: 5 }),
      row({ "Result type": "Leads (form)", Results: 25 }),
    ];
    // Both against the 50 adds to cart, and ordered by volume.
    expect(ids(rows).slice(-2)).toEqual(["lead", "purchase"]);
    expect(stage(rows, "lead").pctOfPrev).toBeCloseTo(50, 3);
    expect(stage(rows, "purchase").pctOfPrev).toBeCloseTo(10, 3);
  });

  it("the export's own column wins for the event it names; the rows fill in the events it lacks", () => {
    const rows = [
      row({ "Result type": "Website purchases", Results: 9, purchases: 4, adds_to_cart: 122 }),
      row({ "Result type": "Leads (form)", Results: 3, purchases: 0, adds_to_cart: 10 }),
    ];
    const s = buildFunnelStages(rows);
    // The classic slots stay (checkout as a gap), the purchase count is the column's, not the rows'.
    expect(s.map((x) => x.id)).toEqual(["impressions", "clicks_all", "link_clicks", "atc", "checkout", "purchases", "lead"]);
    expect(stage(rows, "purchases").value).toBe(4);
    expect(stage(rows, "purchases").basis).toBe("column");
    expect(stage(rows, "checkout").value).toBeNull();
    expect(stage(rows, "lead").value).toBe(3);
    expect(stage(rows, "lead").basis).toBe("result_type");
  });

  it("a consideration or awareness event never becomes a lower-funnel stage", () => {
    const rows = [row({ "Result type": "Link clicks", Results: 40 }), row({ "Result type": "ThruPlays", Results: 500 })];
    expect(ids(rows)).toEqual(["impressions", "clicks_all", "link_clicks", "atc", "checkout", "purchases"]);
    expect(stage(rows, "purchases").value).toBeNull();
  });

  it("rows without a Result type and without the columns keep the three classic gaps", () => {
    const rows = [row(), row()];
    expect(ids(rows)).toEqual(["impressions", "clicks_all", "link_clicks", "atc", "checkout", "purchases"]);
    expect(buildFunnelStages(rows).slice(3).every((s) => s.value === null)).toBe(true);
  });
});

describe("describeLowerFunnel", () => {
  it("names what the export lacked when nothing sits below link clicks", () => {
    const note = describeLowerFunnel(buildFunnelStages([row()]))!;
    expect(note).toMatch(/No result event below link clicks/);
    expect(note).toMatch(/no Result type row naming a conversion/);
    expect(note).not.toMatch(/ecommerce|cohort|objective/i);
  });

  it("names the missing intermediate step when only terminal events exist", () => {
    const note = describeLowerFunnel(buildFunnelStages([row({ "Result type": "Leads (form)", Results: 3 })]))!;
    expect(note).toBe("No intermediate event between link clicks and leads: the export names no cart or checkout step for these ads.");
  });

  it("is silent when both bands carry data", () => {
    const rows = [row({ "Result type": "Website adds to cart", Results: 5 }), row({ "Result type": "Website purchases", Results: 1 })];
    expect(describeLowerFunnel(buildFunnelStages(rows))).toBeNull();
  });
});
