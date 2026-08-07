// ─── FunnelStepsChart & buildFunnelSteps tests ───────────────────────
// Covers:
//   · buildFunnelSteps extracts impressions, link_clicks, and optional
//     downstream funnel fields from a CellPerformanceRow-shaped object
//   · FunnelStepsChart renders values for present steps
//   · Null steps render with "No data" label (not omitted)
//   · Conversion rate labels appear between steps that both have data

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FunnelStepsChart, buildFunnelSteps } from "../FunnelStepsChart";

afterEach(cleanup);

// ─── buildFunnelSteps ─────────────────────────────────────────────────

describe("buildFunnelSteps", () => {
  it("produces 5 steps in order: Impressions, Link Clicks, Adds to Cart, Checkouts, Purchases", () => {
    const steps = buildFunnelSteps({
      Impressions: 10000,
      "Link clicks": 200,
      adds_to_cart: 30,
      checkouts_initiated: 15,
      purchases: 10,
    });
    expect(steps.map((s) => s.label)).toEqual([
      "Impressions",
      "Link Clicks",
      "Adds to Cart",
      "Checkouts Initiated",
      "Purchases",
    ]);
  });

  it("carries the numeric values through", () => {
    const steps = buildFunnelSteps({
      Impressions: 5000,
      "Link clicks": 100,
      adds_to_cart: 15,
      checkouts_initiated: 8,
      purchases: 5,
    });
    expect(steps[0].value).toBe(5000);
    expect(steps[1].value).toBe(100);
    expect(steps[2].value).toBe(15);
    expect(steps[3].value).toBe(8);
    expect(steps[4].value).toBe(5);
  });

  it("sets downstream step value to null when field is absent", () => {
    const steps = buildFunnelSteps({
      Impressions: 10000,
      "Link clicks": 200,
    });
    expect(steps[2].value).toBeNull(); // adds_to_cart
    expect(steps[3].value).toBeNull(); // checkouts_initiated
    expect(steps[4].value).toBeNull(); // purchases
  });

  it("sets downstream step value to null when field is explicitly null", () => {
    const steps = buildFunnelSteps({
      Impressions: 10000,
      "Link clicks": 200,
      adds_to_cart: null,
      checkouts_initiated: null,
      purchases: null,
    });
    expect(steps[2].value).toBeNull();
    expect(steps[3].value).toBeNull();
    expect(steps[4].value).toBeNull();
  });

  it("formats impressions and link_clicks correctly", () => {
    const steps = buildFunnelSteps({
      Impressions: 30803,
      "Link clicks": 463,
      adds_to_cart: 69,
    });
    expect(steps[0].formatted).toBe("30,803");
    expect(steps[1].formatted).toBe("463");
    expect(steps[2].formatted).toBe("69");
    expect(steps[3].formatted).toBe("—"); // null
  });
});

// ─── FunnelStepsChart rendering ───────────────────────────────────────

describe("FunnelStepsChart · full funnel data", () => {
  function renderFull() {
    const steps = buildFunnelSteps({
      Impressions: 30803,
      "Link clicks": 463,
      adds_to_cart: 69,
      checkouts_initiated: 37,
      purchases: 23,
    });
    return render(<FunnelStepsChart steps={steps} />);
  }

  it("renders all 5 step labels", () => {
    renderFull();
    expect(screen.getByText("Impressions")).toBeTruthy();
    expect(screen.getByText("Link Clicks")).toBeTruthy();
    expect(screen.getByText("Adds to Cart")).toBeTruthy();
    expect(screen.getByText("Checkouts Initiated")).toBeTruthy();
    expect(screen.getByText("Purchases")).toBeTruthy();
  });

  it("renders formatted values for all present steps", () => {
    renderFull();
    expect(screen.getByText("30,803")).toBeTruthy();
    expect(screen.getByText("463")).toBeTruthy();
    expect(screen.getByText("69")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    expect(screen.getByText("23")).toBeTruthy();
  });

  it("does NOT render any 'No data' labels when all steps have values", () => {
    renderFull();
    expect(screen.queryByText("No data")).toBeNull();
  });

  it("renders conversion rate labels between steps (e.g. '1.5% conversion')", () => {
    renderFull();
    // Expect at least one conversion rate label between steps
    const convLabels = screen.getAllByText(/conversion/i);
    expect(convLabels.length).toBeGreaterThan(0);
  });
});

describe("FunnelStepsChart · partial funnel (null downstream steps)", () => {
  function renderPartial() {
    const steps = buildFunnelSteps({
      Impressions: 10000,
      "Link clicks": 200,
      // no downstream data
    });
    return render(<FunnelStepsChart steps={steps} />);
  }

  it("renders all 5 step labels even when downstream steps are null", () => {
    renderPartial();
    expect(screen.getByText("Impressions")).toBeTruthy();
    expect(screen.getByText("Adds to Cart")).toBeTruthy();
    expect(screen.getByText("Purchases")).toBeTruthy();
  });

  it("renders 'No data' labels for null steps (not omitted)", () => {
    renderPartial();
    const noDataLabels = screen.getAllByText("No data");
    // 3 null steps: adds_to_cart, checkouts_initiated, purchases
    expect(noDataLabels.length).toBe(3);
  });

  it("shows a conversion rate between Impressions and Link Clicks (both have data)", () => {
    renderPartial();
    expect(screen.getAllByText(/conversion/i).length).toBeGreaterThan(0);
  });

  it("does NOT show a conversion rate between Link Clicks and Adds to Cart (no data)", () => {
    renderPartial();
    const noRateLabels = screen.queryAllByText(/— no rate/);
    expect(noRateLabels.length).toBeGreaterThan(0);
  });
});

describe("FunnelStepsChart · zero impressions edge case", () => {
  it("renders without crashing when all values are 0 or null", () => {
    const steps = buildFunnelSteps({
      Impressions: 0,
      "Link clicks": 0,
    });
    expect(() => render(<FunnelStepsChart steps={steps} />)).not.toThrow();
  });
});
