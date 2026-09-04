// ─── KpiStat explains its dashes (C3) ─────────────────────────────────
//
// KpiStat took only label + value:string and had no disclosure slot at
// all, so every "—" on the Audience group and ranked-segment rows was
// structurally unexplainable — indistinguishable from a metric the page
// simply failed to compute. The reasons come from the segment metric
// catalog (the same strings the drill-down modal shows), and the render
// half is a dotted underline + title rather than a tooltip: these stats
// also sit inside button-cards, where a nested interactive element is
// forbidden by the disclosure rulebook.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { KpiStat } from "../analysis/rankSort";

afterEach(cleanup);

describe("KpiStat", () => {
  it("marks an absent value with a reason a reader can reach", () => {
    const { container } = render(
      <KpiStat label="CPA" value="–" unavailableReason="no results in this segment" />,
    );
    const value = container.querySelector("[data-unavailable-reason]") as HTMLElement | null;
    expect(value).not.toBeNull();
    expect(value!.getAttribute("title")).toBe("CPA: no results in this segment");
    expect(value!.className).toContain("border-dotted");
  });

  it("treats the honest n/a vocabulary the same as the dash", () => {
    const { container } = render(
      <KpiStat label="Spend" value="n/a" unavailableReason="spend" />,
    );
    expect(container.querySelector("[data-unavailable-reason]")).not.toBeNull();
  });

  it("never annotates a real measured value", () => {
    const { container } = render(
      <KpiStat label="CPA" value="$12.40" unavailableReason="no results in this segment" />,
    );
    expect(container.querySelector("[data-unavailable-reason]")).toBeNull();
    expect(within(container).getByText("$12.40").className).not.toContain("border-dotted");
  });

  it("leaves a dash bare when the caller genuinely has no reason to give", () => {
    const { container } = render(<KpiStat label="CPA" value="–" />);
    expect(container.querySelector("[data-unavailable-reason]")).toBeNull();
  });

  it("renders no interactive element, so it is legal inside a button-card", () => {
    const { container } = render(
      <KpiStat label="CTR" value="–" unavailableReason="no impressions in this segment" />,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
