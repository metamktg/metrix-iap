// ─── MetricTable: the three rules the hand-rolled tables kept breaking ─

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The repo wires vitest without RTL auto-cleanup, so every file unmounts its
// own renders — otherwise the second test in a file queries two DOMs.
afterEach(cleanup);
import { MetricTable, type MetricColumn } from "../MetricTable";

interface Row { id: string; name: string; spend: number | null; cpa: number | null; ctr: number | null }

const ROWS: Row[] = [
  { id: "a", name: "Alpha creative", spend: 900,  cpa: 12.5, ctr: 1.8 },
  { id: "b", name: "Bravo creative", spend: 400,  cpa: null, ctr: 2.4 },
  { id: "c", name: "Charlie creative", spend: 1500, cpa: 4.1, ctr: null },
  { id: "d", name: "Delta creative", spend: 0,    cpa: 30.0, ctr: 0.2 },
];

const COLS: MetricColumn<Row>[] = [
  { key: "spend", label: "Spend", value: (r) => r.spend, format: (n) => `$${n.toFixed(0)}`, locked: true },
  { key: "cpa", label: "CPA", value: (r) => r.cpa, format: (n) => `$${n.toFixed(2)}`, defaultDirection: "asc" },
  { key: "ctr", label: "CTR", value: (r) => r.ctr, format: (n) => `${n.toFixed(1)}%`, optional: true },
];

const table = () => ({ rows: screen.getAllByRole("row").slice(1) });
const names = () => table().rows.map((r) => within(r).getAllByRole("cell")[0]!.textContent!.trim());
const render_ = () =>
  render(<MetricTable rows={ROWS} rowKey={(r) => r.id} label={(r) => r.name} columns={COLS} />);

describe("MetricTable — a null is not a zero", () => {
  it("renders an unmeasured cell as a dash, never as 0", () => {
    render_();
    const bravo = table().rows.find((r) => within(r).queryByText("Bravo creative"))!;
    const cells = within(bravo).getAllByRole("cell");
    // Spend 400 is real; CPA is unmeasured.
    expect(cells[1]!.textContent).toContain("$400");
    expect(cells[2]!.textContent!.trim()).toBe("—");
    expect(cells[2]!.textContent).not.toContain("0");
  });

  it("still renders a real zero as a zero — the two are different facts", () => {
    render_();
    const delta = table().rows.find((r) => within(r).queryByText("Delta creative"))!;
    expect(within(delta).getAllByRole("cell")[1]!.textContent).toContain("$0");
  });
});

describe("MetricTable — sorting", () => {
  it("sorts descending on first click of a normal metric", async () => {
    const u = userEvent.setup();
    render_();
    await u.click(screen.getByRole("button", { name: /Spend/ }));
    expect(names()).toEqual(["Charlie creative", "Alpha creative", "Bravo creative", "Delta creative"]);
  });

  it("sorts a cost metric ascending first, because lower is better", async () => {
    const u = userEvent.setup();
    render_();
    await u.click(screen.getByRole("button", { name: /CPA/ }));
    // 4.1, 12.5, 30.0, then the unmeasured one.
    expect(names().slice(0, 3)).toEqual(["Charlie creative", "Alpha creative", "Delta creative"]);
  });

  it("puts unmeasured rows last in BOTH directions", async () => {
    const u = userEvent.setup();
    render_();
    const cpa = screen.getByRole("button", { name: /CPA/ });
    await u.click(cpa);
    expect(names().at(-1)).toBe("Bravo creative");
    await u.click(cpa);   // flip to descending
    expect(names().at(-1)).toBe("Bravo creative");
  });

  it("announces sort state on the header cell", async () => {
    const u = userEvent.setup();
    render_();
    const header = screen.getByRole("columnheader", { name: /Spend/ });
    expect(header.getAttribute("aria-sort")).toBe("none");
    await u.click(within(header).getByRole("button"));
    expect(header.getAttribute("aria-sort")).toBe("descending");
  });
});

describe("MetricTable — filtering", () => {
  it("narrows to matching rows and says so when nothing matches", async () => {
    const u = userEvent.setup();
    render_();
    const box = screen.getByRole("textbox", { name: /Filter rows/ });
    await u.type(box, "brav");
    expect(names()).toEqual(["Bravo creative"]);
    await u.clear(box);
    await u.type(box, "zzz");
    expect(screen.getByText(/No rows match "zzz"/).textContent).toContain("zzz");
  });

  it("clears from the keyboard-reachable clear button", async () => {
    const u = userEvent.setup();
    render_();
    await u.type(screen.getByRole("textbox", { name: /Filter rows/ }), "alpha");
    expect(names()).toHaveLength(1);
    await u.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(names()).toHaveLength(4);
  });
});

describe("MetricTable — the reader picks the metrics", () => {
  it("hides optional columns until they are chosen", async () => {
    const u = userEvent.setup();
    render_();
    expect(screen.queryByRole("columnheader", { name: /CTR/ })).toBeNull();
    await u.click(screen.getByRole("button", { name: /Metrics/ }));
    await u.click(screen.getByRole("checkbox", { name: "CTR" }));
    expect(screen.getByRole("columnheader", { name: /CTR/ }).textContent).toContain("CTR");
  });

  it("cannot remove a locked column", async () => {
    const u = userEvent.setup();
    render_();
    await u.click(screen.getByRole("button", { name: /Metrics/ }));
    expect((screen.getByRole("checkbox", { name: "Spend" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("reports how many metrics are showing", async () => {
    const u = userEvent.setup();
    render_();
    const btn = screen.getByRole("button", { name: /Metrics/ });
    expect(btn.textContent).toContain("2");
    await u.click(btn);
    await u.click(screen.getByRole("checkbox", { name: "CTR" }));
    expect(screen.getByRole("button", { name: /Metrics/ }).textContent).toContain("3");
  });
});

describe("MetricTable — long lists", () => {
  const many: Row[] = Array.from({ length: 30 }, (_, i) => ({
    id: `r${i}`, name: `Row ${i}`, spend: 100 - i, cpa: i, ctr: 1,
  }));

  it("collapses past the initial window and offers the full count", async () => {
    const u = userEvent.setup();
    render(<MetricTable rows={many} rowKey={(r) => r.id} label={(r) => r.name} columns={COLS} initialVisible={5} />);
    expect(names()).toHaveLength(5);
    await u.click(screen.getByRole("button", { name: /Show all 30 rows/ }));
    expect(names()).toHaveLength(30);
  });
});
