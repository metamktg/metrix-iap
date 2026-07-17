// ─── MetricTile × fmtMetric formatting regression tests ───────────────
//
// Guards the rendered MetricTile path end-to-end:
//   fmtMetric(kind, n) → MetricTile value prop → DOM text node
//
// If fmtMetric ever drops a "%" suffix, switches decimal count, or loses
// the currency symbol, these tests catch it at the rendered output level —
// not just in the isolated normalize unit tests.
//
// Kinds covered: usd_unit (CPA/CPC), pct (CTR/CVR), count (impressions).
// usd_total (spend) included for completeness.
// The null / undefined sentinel (em dash) is also asserted.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { MetricTile } from "../shared";
import { fmtMetric } from "@/lib/normalize";

afterEach(cleanup);

function renderTile(label: string, value: string) {
  const { container } = render(<MetricTile label={label} value={value} />);
  return container;
}

describe("MetricTile — fmtMetric usd_unit (CPA / CPC)", () => {
  it("renders $7.09 for a sub-$1,000 unit cost", () => {
    const value = fmtMetric("usd_unit", 7.09);
    expect(value).toBe("$7.09");
    const container = renderTile("CPA", value);
    expect(within(container).getByText("$7.09")).toBeTruthy();
  });

  it("renders $999.99 for a value just under the $1,000 threshold", () => {
    const value = fmtMetric("usd_unit", 999.994);
    expect(value).toBe("$999.99");
    const container = renderTile("CPC", value);
    expect(within(container).getByText("$999.99")).toBeTruthy();
  });

  it("renders $1,400 (0 dp) for a value above $1,000", () => {
    const value = fmtMetric("usd_unit", 1400);
    expect(value).toBe("$1,400");
    const container = renderTile("CPA", value);
    expect(within(container).getByText("$1,400")).toBeTruthy();
  });
});

describe("MetricTile — fmtMetric usd_total (spend)", () => {
  it("renders $2,963 (always 0 dp) for a spend value", () => {
    const value = fmtMetric("usd_total", 2963.4);
    expect(value).toBe("$2,963");
    const container = renderTile("Spend", value);
    expect(within(container).getByText("$2,963")).toBeTruthy();
  });

  it("renders $13 (rounds up) for a fractional spend value", () => {
    const value = fmtMetric("usd_total", 12.75);
    expect(value).toBe("$13");
    const container = renderTile("Spend", value);
    expect(within(container).getByText("$13")).toBeTruthy();
  });
});

describe("MetricTile — fmtMetric pct (CTR / CVR)", () => {
  it("renders 15.1% (1 dp) for a rate at/above 10%", () => {
    const value = fmtMetric("pct", 15.06);
    expect(value).toBe("15.1%");
    const container = renderTile("CTR", value);
    expect(within(container).getByText("15.1%")).toBeTruthy();
  });

  it("renders 5.68% (2 dp) for a rate below 10%", () => {
    const value = fmtMetric("pct", 5.678);
    expect(value).toBe("5.68%");
    const container = renderTile("CVR", value);
    expect(within(container).getByText("5.68%")).toBeTruthy();
  });

  it("renders bare 0% (no decimals) for an exact zero rate", () => {
    const value = fmtMetric("pct", 0);
    expect(value).toBe("0%");
    const container = renderTile("CTR", value);
    expect(within(container).getByText("0%")).toBeTruthy();
  });
});

describe("MetricTile — fmtMetric count (impressions / results)", () => {
  it("renders 12,437 (rounded with thousands separator)", () => {
    const value = fmtMetric("count", 12437.4);
    expect(value).toBe("12,437");
    const container = renderTile("Impressions", value);
    expect(within(container).getByText("12,437")).toBeTruthy();
  });
});

describe("MetricTile — null / undefined sentinel", () => {
  it("renders an em dash when the value is null", () => {
    const value = fmtMetric("usd_unit", null);
    expect(value).toBe("—");
    const container = renderTile("CPA", value);
    expect(within(container).getByText("—")).toBeTruthy();
  });

  it("renders an em dash when the value is undefined", () => {
    const value = fmtMetric("pct", undefined);
    expect(value).toBe("—");
    const container = renderTile("CTR", value);
    expect(within(container).getByText("—")).toBeTruthy();
  });
});
