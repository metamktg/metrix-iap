// ─── Funnel and Map: the rules that keep them from fabricating ────────
//
// Both views exist to place numbers the product already has. The ways they
// can lie are specific and few, so those are what is pinned here.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FunnelChart } from "../FunnelChart";
import { HeatMatrix, type HeatCell } from "../HeatMatrix";
import { ViewSwitcher } from "@/components/data-module/ViewSwitcher";

afterEach(cleanup);

const money = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString();

const STAGES = [
  { key: "impr", label: "Impressions", value: 1_000_000 },
  { key: "link", label: "Link clicks", value: 20_000 },
  { key: "atc", label: "Adds to cart", value: 4_000 },
  { key: "checkout", label: "Checkouts", value: null },
  { key: "purchase", label: "Purchases", value: 1_000 },
];

describe("FunnelChart — a missing stage is not a zero", () => {
  it("says how many stages the export did not carry", () => {
    render(<FunnelChart stages={STAGES} format={count} />);
    expect(screen.getByText(/1 stage not carried by this export/)).toBeTruthy();
  });

  it("describes the gap as unmeasured, not as a count", () => {
    render(<FunnelChart stages={STAGES} format={count} />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("Checkouts not measured");
    expect(label).not.toContain("Checkouts 0");
  });

  it("computes step conversion across a gap rather than dividing by nothing", () => {
    render(<FunnelChart stages={STAGES} format={count} />);
    // Purchases 1,000 over Adds to cart 4,000 — the last MEASURED stage — is
    // 25%. Treating the gap as zero would divide by zero; treating it as the
    // previous value would report 100%.
    expect(screen.getByText("25%")).toBeTruthy();
  });

  it("anchors share-of-top on the first MEASURED stage", () => {
    const leadingGap = [{ key: "a", label: "Reach", value: null }, ...STAGES];
    render(<FunnelChart stages={leadingGap} format={count} />);
    // Impressions is now the first measured stage, so it is the 100% anchor.
    expect(screen.getAllByText("100% of top").length).toBe(1);
  });
});

describe("FunnelChart — a stage above the one before it is reported, not clamped", () => {
  it("flags an over-100% step instead of capping it", () => {
    render(
      <FunnelChart
        format={count}
        stages={[
          { key: "click", label: "Link clicks", value: 1_000 },
          { key: "atc", label: "Adds to cart", value: 1_400 },
        ]}
      />,
    );
    // 140% is a real attribution artefact. Hiding it behind a tidy 100% bar
    // would erase a data-quality fact.
    expect(screen.getByText("140%")).toBeTruthy();
  });
});

describe("FunnelChart — the two bases", () => {
  it("states which basis the bar lengths use", () => {
    render(<FunnelChart stages={STAGES} format={count} />);
    expect(screen.getByText(/share of the previous stage/)).toBeTruthy();
  });

  it("switches basis without changing the numbers inside the bars", async () => {
    const u = userEvent.setup();
    render(<FunnelChart stages={STAGES} format={count} />);
    const before = screen.getByText("20,000");
    await u.click(screen.getByRole("button", { name: "vs top of funnel" }));
    expect(screen.getByText(/share of the top of the funnel/)).toBeTruthy();
    expect(screen.getByText("20,000")).toBe(before);
  });

  it("shows an empty state when no stage was measured at all", () => {
    render(
      <FunnelChart
        format={count}
        emptyLabel="No funnel yet"
        stages={[{ key: "a", label: "Impressions", value: null }]}
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("No funnel yet");
  });
});

const CELLS: HeatCell[] = [
  { row: "25–34", col: "Female", value: 12 },
  { row: "25–34", col: "Male", value: 30 },
  { row: "35–44", col: "Female", value: 20 },
  { row: "35–44", col: "Male", value: null },
];

const map = (extra: Partial<React.ComponentProps<typeof HeatMatrix>> = {}) => (
  <HeatMatrix
    rows={["25–34", "35–44"]}
    cols={["Female", "Male"]}
    cells={CELLS}
    scale="verdict"
    lowerIsBetter
    goal={20}
    format={money}
    measureLabel="Cost per result"
    rowHeaderLabel="Age"
    onSelect={() => {}}
    {...extra}
  />
);

describe("HeatMatrix — an unmeasured cell is not a low one", () => {
  it("announces the gap as unmeasured", () => {
    render(map());
    expect(screen.getByRole("gridcell", { name: /35–44, Male: Cost per result not measured/ })).toBeTruthy();
  });

  it("gives a gap no value text and no fill", () => {
    const { container } = render(map());
    const gap = screen.getByRole("gridcell", { name: /not measured/ }) as HTMLElement;
    expect(within(gap).getByText("—")).toBeTruthy();
    // Hatched, not filled — the two must not be the same square.
    expect(gap.style.backgroundImage).toContain("repeating-linear-gradient");
    expect(gap.style.background).toBe("");
    expect(container).toBeTruthy();
  });

  it("keeps the gap out of the value announcements for measured cells", () => {
    render(map());
    expect(screen.getByRole("gridcell", { name: /25–34, Female: Cost per result \$12\.00/ })).toBeTruthy();
  });
});

describe("HeatMatrix — severity stays in order", () => {
  it("paints a worse value at least as intensely as a less bad one", () => {
    render(map());
    const worse = screen.getByRole("gridcell", { name: /Male: Cost per result \$30\.00/ }) as HTMLElement;
    const better = screen.getByRole("gridcell", { name: /Female: Cost per result \$12\.00/ }) as HTMLElement;
    // Different sides of the goal must not land on the same fill.
    expect(worse.style.background).not.toBe(better.style.background);
    expect(worse.style.background).toContain("danger");
    expect(better.style.background).toContain("success");
  });

  it("uses the magnitude ramp when the measure has no good end", () => {
    render(map({ scale: "magnitude", goal: null, lowerIsBetter: false, measureLabel: "Spend" }));
    const cell = screen.getByRole("gridcell", { name: /Male: Spend \$30\.00/ }) as HTMLElement;
    expect(cell.style.background).not.toContain("danger");
    expect(cell.style.background).not.toContain("success");
  });
});

describe("HeatMatrix — the grid is operable", () => {
  it("exposes one tab stop and moves focus with the arrow keys", async () => {
    const u = userEvent.setup();
    render(map());
    const cells = screen.getAllByRole("gridcell");
    const tabbable = cells.filter((c) => c.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    tabbable[0]!.focus();
    await u.keyboard("{ArrowRight}");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/25–34, Male/);
    await u.keyboard("{ArrowDown}");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/35–44, Male/);
  });

  it("does not walk off the edge of the grid", async () => {
    const u = userEvent.setup();
    render(map());
    (screen.getAllByRole("gridcell").find((c) => c.getAttribute("tabindex") === "0") as HTMLElement).focus();
    await u.keyboard("{ArrowUp}{ArrowUp}{ArrowLeft}{ArrowLeft}");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/25–34, Female/);
  });

  it("opens the cell on Enter", async () => {
    const u = userEvent.setup();
    let picked: HeatCell | null = null;
    render(map({ onSelect: (c) => { picked = c; } }));
    (screen.getAllByRole("gridcell").find((c) => c.getAttribute("tabindex") === "0") as HTMLElement).focus();
    await u.keyboard("{Enter}");
    expect(picked).not.toBeNull();
    expect(picked!.row).toBe("25–34");
  });

  it("names the goal it is judging against", () => {
    render(map());
    expect(screen.getByText(/Goal \$20\.00/)).toBeTruthy();
  });
});

describe("ViewSwitcher — an unsupported view is disabled WITH its reason", () => {
  it("keeps every view present so absence is never ambiguous", () => {
    render(<ViewSwitcher shape="historical_matrix_4x4" value="map" onChange={() => {}} />);
    for (const label of ["Trend", "Compare", "Breakdown", "Funnel", "Map", "Table"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
  });

  it("disables the views the shape cannot back, and explains each", () => {
    render(<ViewSwitcher shape="historical_matrix_4x4" value="map" onChange={() => {}} />);
    const trend = screen.getByRole("button", { name: /^Trend/ }) as HTMLButtonElement;
    expect(trend.disabled).toBe(true);
    expect(trend.getAttribute("title")).toMatch(/plan|time/i);
    expect(trend.textContent).toMatch(/unavailable/i);
  });

  it("leaves the supported ones enabled", () => {
    render(<ViewSwitcher shape="performance_by_cell" value="trend" onChange={() => {}} />);
    expect((screen.getByRole("button", { name: /^Trend/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /^Funnel/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not fire onChange for a disabled view", async () => {
    const u = userEvent.setup();
    let calls = 0;
    render(<ViewSwitcher shape="performance_by_cell" value="trend" onChange={() => { calls += 1; }} />);
    await u.click(screen.getByRole("button", { name: /^Funnel/ }));
    expect(calls).toBe(0);
    await u.click(screen.getByRole("button", { name: /^Compare/ }));
    expect(calls).toBe(1);
  });
});
