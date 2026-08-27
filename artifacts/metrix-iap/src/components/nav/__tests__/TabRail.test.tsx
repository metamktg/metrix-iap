// ─── TabRail: it has to behave like a tablist ─────────────────────────
//
// The four rails this replaced all rendered correctly and none of them was
// navigable. These pin the behaviour rather than the markup, because the
// markup was never the problem.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabRail } from "../TabRail";

afterEach(cleanup);

const TABS = [
  { id: "pending" as const, label: "Pending", count: 4 },
  { id: "approved" as const, label: "In Tray", count: 0 },
  { id: "dismissed" as const, label: "Dismissed", count: 2 },
];

function setup(active: "pending" | "approved" | "dismissed" = "pending") {
  const onChange = vi.fn();
  render(<TabRail tabs={TABS} active={active} onChange={onChange} label="Queue status" />);
  return { onChange };
}

describe("TabRail — it is a tablist", () => {
  it("announces itself as a tablist with a name", () => {
    setup();
    expect(screen.getByRole("tablist", { name: "Queue status" })).toBeTruthy();
  });

  it("marks the active tab selected and the others not", () => {
    setup("approved");
    expect(screen.getByRole("tab", { name: /In Tray/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Pending/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("is one tab stop, not one per tab", () => {
    setup("approved");
    const stops = screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0]!.textContent).toContain("In Tray");
  });
});

describe("TabRail — arrow keys move between tabs", () => {
  it("moves right", async () => {
    const u = userEvent.setup();
    const { onChange } = setup("pending");
    screen.getByRole("tab", { name: /Pending/ }).focus();
    await u.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("approved");
  });

  it("wraps from the last tab back to the first", async () => {
    const u = userEvent.setup();
    const { onChange } = setup("dismissed");
    screen.getByRole("tab", { name: /Dismissed/ }).focus();
    await u.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("pending");
  });

  it("jumps to the ends with Home and End", async () => {
    const u = userEvent.setup();
    const { onChange } = setup("approved");
    screen.getByRole("tab", { name: /In Tray/ }).focus();
    await u.keyboard("{End}");
    expect(onChange).toHaveBeenCalledWith("dismissed");
    await u.keyboard("{Home}");
    expect(onChange).toHaveBeenCalledWith("pending");
  });
});

describe("TabRail — counts and disabled tabs", () => {
  it("renders a zero count, which is a real answer", () => {
    setup();
    expect(screen.getByRole("tab", { name: /In Tray/ }).textContent).toContain("0");
  });

  it("renders no count chip when the tab has nothing to count", () => {
    render(
      <TabRail
        tabs={[{ id: "a" as const, label: "All" }, { id: "b" as const, label: "Some" }]}
        active="a"
        onChange={() => {}}
        label="X"
      />,
    );
    expect(screen.getByRole("tab", { name: "All" }).textContent).toBe("All");
  });

  it("keeps a disabled tab visible and says why, rather than hiding it", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TabRail
        tabs={[
          { id: "a" as const, label: "Runs" },
          { id: "b" as const, label: "Compare", disabledReason: "Needs two completed runs to compare." },
        ]}
        active="a"
        onChange={onChange}
        label="X"
      />,
    );
    const off = screen.getByRole("tab", { name: /Compare/ });
    expect(off.getAttribute("title")).toContain("two completed runs");
    await u.click(off);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("skips disabled tabs when arrowing", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TabRail
        tabs={[
          { id: "a" as const, label: "A" },
          { id: "b" as const, label: "B", disabledReason: "not yet" },
          { id: "c" as const, label: "C" },
        ]}
        active="a"
        onChange={onChange}
        label="X"
      />,
    );
    screen.getByRole("tab", { name: "A" }).focus();
    await u.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
