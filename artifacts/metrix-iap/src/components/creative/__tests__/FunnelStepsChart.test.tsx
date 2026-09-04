// ─── FunnelStepsChart & buildFunnelSteps tests ───────────────────────
// The chain is BUILT FROM THE ACCOUNT'S OBSERVED RESULT EVENTS (G8): the
// delivery steps come first for every account, then one step per
// conversion event, ordered by funnel stage through the taxonomy. Nothing
// here assumes cart → checkout → purchase for a lead-gen or awareness
// account.
//
// Covers:
//   · delivery steps always present, first
//   · chain from events, in stage order, counts from the cell's own rows
//   · legacy funnel columns fill a step that counts the same event
//   · a step the account carries but the cell did not measure is null
//   · no conversion events → delivery only, and describeFunnelChain names
//     what the account did run
//   · no account context → the row's own measured chain, nothing invented
//   · rendering: "No data" for null steps, rate labels between measured steps

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FunnelStepsChart, buildFunnelSteps, describeFunnelChain } from "../FunnelStepsChart";

afterEach(cleanup);

const ECOM_EVENTS = ["Website purchases", "onb_initiate_checkout", "Adds to cart", "Link clicks"];

describe("buildFunnelSteps · chain from observed events", () => {
  it("starts with the delivery steps and follows with the conversion chain in funnel-stage order", () => {
    const steps = buildFunnelSteps(
      { Impressions: 10000, "Link clicks": 200, "Result type": "Website purchases", Results: 10 },
      {
        events: ECOM_EVENTS,
        rowsByEvent: [
          { "Result type": "Website purchases", Results: 10 },
          { "Result type": "onb_initiate_checkout", Results: 15 },
          { "Result type": "Adds to cart", Results: 30 },
        ],
      },
    );
    expect(steps.map((s) => s.label)).toEqual(["Impressions", "Link Clicks", "Adds to cart", "Checkouts initiated", "Purchases"]);
    expect(steps.map((s) => s.kind)).toEqual(["delivery", "delivery", "conversion", "conversion", "conversion"]);
    expect(steps.map((s) => s.value)).toEqual([10000, 200, 30, 15, 10]);
    // A traffic event is not part of the conversion chain.
    expect(steps.some((s) => s.label === "Link clicks")).toBe(false);
  });

  it("builds a lead-gen chain with no cart or checkout step at all", () => {
    const steps = buildFunnelSteps(
      { Impressions: 5000, "Link clicks": 100, "Result type": "Leads (form)", Results: 8 },
      { events: ["Leads (form)", "Landing page views"], rowsByEvent: [{ "Result type": "Leads (form)", Results: 8 }] },
    );
    expect(steps.map((s) => s.label)).toEqual(["Impressions", "Link Clicks", "Leads"]);
    expect(steps[2]!.value).toBe(8);
    expect(steps[2]!.resultType).toBe("Leads (form)");
  });

  it("fills a step from the legacy funnel column that counts the same event when the cell has no row for it", () => {
    const steps = buildFunnelSteps(
      { Impressions: 10000, "Link clicks": 200, "Result type": "Website purchases", Results: 10, adds_to_cart: 30, checkouts_initiated: 15 },
      { events: ECOM_EVENTS, rowsByEvent: [{ "Result type": "Website purchases", Results: 10 }] },
    );
    expect(steps.map((s) => s.value)).toEqual([10000, 200, 30, 15, 10]);
  });

  it("leaves a step null (never 0) when the account carries the event but this cell did not measure it", () => {
    const steps = buildFunnelSteps(
      { Impressions: 10000, "Link clicks": 200, "Result type": "Website purchases", Results: 10 },
      { events: ECOM_EVENTS, rowsByEvent: [{ "Result type": "Website purchases", Results: 10 }] },
    );
    expect(steps.find((s) => s.label === "Adds to cart")!.value).toBeNull();
    expect(steps.find((s) => s.label === "Checkouts initiated")!.value).toBeNull();
    expect(steps.find((s) => s.label === "Purchases")!.value).toBe(10);
  });

  it("shows delivery steps only for an awareness account, and describeFunnelChain names what it ran", () => {
    const events = ["ThruPlays", "Link clicks"];
    const steps = buildFunnelSteps({ Impressions: 30803, "Link clicks": 463, "Result type": "ThruPlays", Results: 900 }, { events });
    expect(steps.map((s) => s.label)).toEqual(["Impressions", "Link Clicks"]);
    const { chain, other } = describeFunnelChain(events);
    expect(chain).toEqual([]);
    expect(other.map((c) => c.label)).toEqual(["ThruPlays", "Link clicks"]);
  });

  it("orders the chain by stage regardless of the order the events arrive in", () => {
    const { chain } = describeFunnelChain(["Website purchases", "Adds to cart", "Payment info added", "onb_initiate_checkout", "Leads (form)"]);
    expect(chain.map((c) => c.key)).toEqual(["add_to_cart", "initiate_checkout", "add_payment_info", "purchase", "lead"]);
  });

  it("keeps one step per raw result type and ignores blanks", () => {
    const { chain } = describeFunnelChain(["Website purchases", "Website purchases", "", "  "]);
    expect(chain.map((c) => c.raw)).toEqual(["Website purchases"]);
  });
});

describe("buildFunnelSteps · no account context", () => {
  it("uses only what the row measured: its own conversion result type plus present legacy columns", () => {
    const steps = buildFunnelSteps({ Impressions: 30803, "Link clicks": 463, "Result type": "Website purchases", Results: 23, adds_to_cart: 69 });
    expect(steps.map((s) => s.label)).toEqual(["Impressions", "Link Clicks", "Adds to cart", "Purchases"]);
    expect(steps.map((s) => s.value)).toEqual([30803, 463, 69, 23]);
    expect(steps[2]!.formatted).toBe("69");
    expect(steps[0]!.formatted).toBe("30,803");
  });

  it("invents no chain when the row carries no conversion event and no funnel column", () => {
    const steps = buildFunnelSteps({ Impressions: 10000, "Link clicks": 200 });
    expect(steps.map((s) => s.label)).toEqual(["Impressions", "Link Clicks"]);
  });

  it("treats an explicitly null legacy column as a present-but-unmeasured step", () => {
    const steps = buildFunnelSteps({ Impressions: 10000, "Link clicks": 200, checkouts_initiated: null });
    expect(steps.map((s) => s.label)).toEqual(["Impressions", "Link Clicks", "Checkouts initiated"]);
    expect(steps[2]!.value).toBeNull();
    expect(steps[2]!.formatted).toBe("–");
  });
});

// ─── FunnelStepsChart rendering ───────────────────────────────────────

describe("FunnelStepsChart · full funnel data", () => {
  function renderFull() {
    const steps = buildFunnelSteps(
      { Impressions: 30803, "Link clicks": 463, "Result type": "Website purchases", Results: 23, adds_to_cart: 69, checkouts_initiated: 37 },
      { events: ECOM_EVENTS, rowsByEvent: [{ "Result type": "Website purchases", Results: 23 }] },
    );
    return render(<FunnelStepsChart steps={steps} />);
  }

  it("renders every step label", () => {
    renderFull();
    for (const label of ["Impressions", "Link Clicks", "Adds to cart", "Checkouts initiated", "Purchases"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("renders formatted values for all present steps", () => {
    renderFull();
    for (const v of ["30,803", "463", "69", "37", "23"]) expect(screen.getByText(v)).toBeTruthy();
  });

  it("does NOT render any 'No data' labels when all steps have values", () => {
    renderFull();
    expect(screen.queryByText("No data")).toBeNull();
  });

  it("renders a rate label between adjacent measured steps", () => {
    renderFull();
    expect(screen.getAllByText(/conversion/i).length).toBeGreaterThan(0);
  });
});

describe("FunnelStepsChart · partial chain (unmeasured steps)", () => {
  function renderPartial() {
    const steps = buildFunnelSteps(
      { Impressions: 10000, "Link clicks": 200, "Result type": "Website purchases", Results: 10 },
      { events: ECOM_EVENTS, rowsByEvent: [{ "Result type": "Website purchases", Results: 10 }] },
    );
    return render(<FunnelStepsChart steps={steps} />);
  }

  it("renders every step the account carries, even the ones this cell did not measure", () => {
    renderPartial();
    expect(screen.getByText("Adds to cart")).toBeTruthy();
    expect(screen.getByText("Checkouts initiated")).toBeTruthy();
    expect(screen.getByText("Purchases")).toBeTruthy();
  });

  it("renders 'No data' for the unmeasured steps (not omitted)", () => {
    renderPartial();
    expect(screen.getAllByText("No data").length).toBe(2);
  });

  it("shows a rate between Impressions and Link Clicks, and ', no rate' where a side is unmeasured", () => {
    renderPartial();
    expect(screen.getAllByText(/conversion/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/, no rate/).length).toBeGreaterThan(0);
  });
});

describe("FunnelStepsChart · zero impressions edge case", () => {
  it("renders without crashing when all values are 0 or null", () => {
    const steps = buildFunnelSteps({ Impressions: 0, "Link clicks": 0 }, { events: ["Website purchases"] });
    expect(() => render(<FunnelStepsChart steps={steps} />)).not.toThrow();
  });
});
