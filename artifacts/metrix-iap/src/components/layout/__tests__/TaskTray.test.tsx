// ─── TaskTray tests ───────────────────────────────────────────────────
//
// Covers four surfaces:
//   1. computeTrayCount — pure badge-count helper extracted from
//      useTaskTrayCount; combinations of open tray items, workflow items
//      (hypotheses / signals / pending drafts), and caps.
//   2. trayStore — the durable store that feeds the "My Tray" section:
//      addToTray, removeFromTray, setTrayItemStatus, history queries.
//   3. TaskTray component — RTL rendering of the My Tray section (items,
//      complete/archive actions, History collapse) and empty-state nudges.
//   4. Drag-to-resize + width persistence.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { computeTrayCount, TaskTray } from "../TaskTray";
import {
  addToTray,
  removeFromTray,
  setTrayItemStatus,
  isInTray,
  getTrayItem,
  getOpenTrayItems,
  getTrayHistory,
  _resetForTest,
  type TrayItemInput,
} from "@/lib/data/trayStore";

// ── Mock wouter ───────────────────────────────────────────────────────
// Replaces navigate with a spy so tests can assert the exact route
// pushed when the user clicks a nudge link or nav link.

const mockNavigate = vi.fn();

vi.mock("wouter", () => ({
  Router: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocation: () => ["/", mockNavigate] as [string, typeof mockNavigate],
}));

// ── Mock AccountContext ───────────────────────────────────────────────
// Provides a manager-mode account (selectedAccountType !== "ad_account")
// so the analysis section never renders — avoiding api-client-react stubs.

const mockUseAccount = vi.fn();

vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => mockUseAccount(),
  useScopedAdAccountId: () => null,
}));

// ── Mock TaskTrayContext ──────────────────────────────────────────────
// Default: open=true so the full tray body renders.

const mockUseTaskTray = vi.fn();

vi.mock("@/contexts/TaskTrayContext", () => ({
  useTaskTray: () => mockUseTaskTray(),
  TaskTrayProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Helpers ───────────────────────────────────────────────────────────

function baseAccountCtx(overrides: Partial<ReturnType<typeof mockUseAccount>> = {}) {
  return {
    manager: {
      id: "mgr",
      name: "Test Agency",
      type: "agency",
      overview_mode: "manager",
      configured_ad_accounts: 0,
      unconfigured_ad_accounts: 0,
      bottom_line_totals: {},
      recommendation_cards: [],
    },
    adAccounts: [],
    selectedAccountType: "manager" as const,
    activeManagerAccountId: "mgr",
    activeAdAccountId: null,
    activeAdAccount: null,
    selectManager: vi.fn(),
    selectAdAccount: vi.fn(),
    setActiveAdAccountId: vi.fn(),
    ...overrides,
  };
}

function openTrayCtx() {
  return { open: true, toggle: vi.fn(), close: vi.fn() };
}

function closedTrayCtx() {
  return { open: false, toggle: vi.fn(), close: vi.fn() };
}

function makeItem(overrides: Partial<TrayItemInput> = {}): TrayItemInput {
  return {
    id: "card1",
    kind: "recommendation",
    title: "Pause underperforming ad set",
    sub: "Navigate to Ads Manager and pause the ad set.",
    href: "/app/listen/recommendations",
    ...overrides,
  };
}

function renderTray() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TaskTray />
    </QueryClientProvider>
  );
}

// Reset state and mocks before every test; RTL cleanup after every test.

beforeEach(() => {
  _resetForTest();
  mockNavigate.mockReset();
  mockUseAccount.mockReturnValue(baseAccountCtx());
  mockUseTaskTray.mockReturnValue(openTrayCtx());
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// ═════════════════════════════════════════════════════════════════════
// 1. computeTrayCount — pure badge math
// ═════════════════════════════════════════════════════════════════════

describe("computeTrayCount", () => {
  it("returns 0 when all inputs are empty", () => {
    expect(computeTrayCount({ openTrayItems: 0, hypotheses: [], signals: [], pendingDrafts: [] })).toBe(0);
  });

  it("counts open tray items", () => {
    expect(computeTrayCount({ openTrayItems: 3, hypotheses: [], signals: [], pendingDrafts: [] })).toBe(3);
  });

  it("caps hypotheses at 3 regardless of array length", () => {
    const many = Array(10).fill({});
    expect(computeTrayCount({ openTrayItems: 0, hypotheses: many, signals: [], pendingDrafts: [] })).toBe(3);
  });

  it("counts 1 and 2 hypotheses without capping", () => {
    expect(computeTrayCount({ openTrayItems: 0, hypotheses: [{}], signals: [], pendingDrafts: [] })).toBe(1);
    expect(computeTrayCount({ openTrayItems: 0, hypotheses: [{}, {}], signals: [], pendingDrafts: [] })).toBe(2);
  });

  it("caps signals at 2 regardless of array length", () => {
    const many = Array(10).fill({});
    expect(computeTrayCount({ openTrayItems: 0, hypotheses: [], signals: many, pendingDrafts: [] })).toBe(2);
  });

  it("counts 1 signal without capping", () => {
    expect(computeTrayCount({ openTrayItems: 0, hypotheses: [], signals: [{}], pendingDrafts: [] })).toBe(1);
  });

  it("sums all four sources", () => {
    // openTrayItems=1 + hyps capped@3 + signals capped@2 + drafts=4 = 10
    expect(
      computeTrayCount({
        openTrayItems: 1,
        hypotheses: Array(5).fill({}),
        signals: Array(5).fill({}),
        pendingDrafts: Array(4).fill({}),
      })
    ).toBe(10);
  });

  it("caps the total at 99", () => {
    expect(
      computeTrayCount({
        openTrayItems: 90,
        hypotheses: Array(5).fill({}),
        signals: Array(5).fill({}),
        pendingDrafts: Array(50).fill({}),
      })
    ).toBe(99);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. trayStore — pure store functions
// ═════════════════════════════════════════════════════════════════════

describe("trayStore: addToTray / removeFromTray / isInTray", () => {
  it("adds an item as open", () => {
    addToTray("acct1", makeItem());
    expect(isInTray("acct1", "card1")).toBe(true);
    expect(getTrayItem("acct1", "card1")?.status).toBe("open");
  });

  it("scopes items per account", () => {
    addToTray("acct1", makeItem());
    expect(isInTray("acct2", "card1")).toBe(false);
  });

  it("removeFromTray deletes the record entirely (undo of accidental add)", () => {
    addToTray("acct1", makeItem());
    removeFromTray("acct1", "card1");
    expect(getTrayItem("acct1", "card1")).toBeUndefined();
  });

  it("re-adding a completed item re-opens it", () => {
    addToTray("acct1", makeItem());
    setTrayItemStatus("acct1", "card1", "done");
    addToTray("acct1", makeItem());
    expect(getTrayItem("acct1", "card1")?.status).toBe("open");
  });
});

describe("trayStore: setTrayItemStatus / history", () => {
  it("marks an item done — it leaves the open list but stays in history", () => {
    addToTray("a", makeItem({ id: "c1", title: "Task one" }));
    setTrayItemStatus("a", "c1", "done");
    expect(getOpenTrayItems("a")).toHaveLength(0);
    const hist = getTrayHistory("a");
    expect(hist).toHaveLength(1);
    expect(hist[0].status).toBe("done");
  });

  it("archives an item — never deleted, kept in history", () => {
    addToTray("a", makeItem({ id: "c1" }));
    setTrayItemStatus("a", "c1", "archived");
    expect(getTrayHistory("a")[0].status).toBe("archived");
  });

  it("re-opening a done item moves it back out of history", () => {
    addToTray("a", makeItem({ id: "c1" }));
    setTrayItemStatus("a", "c1", "done");
    setTrayItemStatus("a", "c1", "open");
    expect(getOpenTrayItems("a")).toHaveLength(1);
    expect(getTrayHistory("a")).toHaveLength(0);
  });

  it("is a no-op on a non-existent key", () => {
    expect(() => setTrayItemStatus("a", "nope", "done")).not.toThrow();
  });

  it("getOpenTrayItems without a scope returns items across scopes", () => {
    addToTray("a", makeItem({ id: "c1" }));
    addToTray("b", makeItem({ id: "c2" }));
    expect(getOpenTrayItems()).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. TaskTray component — rendering
// ═════════════════════════════════════════════════════════════════════

// Helper: find the My Tray section container
function getTraySection(): HTMLElement {
  const heading = screen
    .getAllByText("My Tray")
    .find((el) => el.tagName === "SPAN");
  return heading!.closest(".px-4") as HTMLElement;
}

describe("TaskTray: empty-state nudge links navigate to the correct routes", () => {
  it("My Tray nudge navigates to /app/listen/recommendations", () => {
    renderTray();
    const section = getTraySection();
    const nudge = within(section).getByRole("button", { name: /go to recommendations/i });
    fireEvent.click(nudge);
    expect(mockNavigate).toHaveBeenCalledWith("/app/listen/recommendations");
  });

  it("Ready to Brief nudge navigates to /app/strategy/hypotheses", () => {
    renderTray();
    const heading = screen.getAllByText("Ready to Brief").find((el) => el.tagName === "SPAN")!;
    const section = heading.closest(".px-4") as HTMLElement;
    const nudge = within(section).getByRole("button", { name: /view hypothesis queue/i });
    fireEvent.click(nudge);
    expect(mockNavigate).toHaveBeenCalledWith("/app/strategy/hypotheses");
  });

  it("Briefs Pending nudge navigates to /app/briefs/builder", () => {
    renderTray();
    const heading = screen.getAllByText("Briefs Pending").find((el) => el.tagName === "SPAN")!;
    const section = heading.closest(".px-4") as HTMLElement;
    const nudge = within(section).getByRole("button", { name: /open brief builder/i });
    fireEvent.click(nudge);
    expect(mockNavigate).toHaveBeenCalledWith("/app/briefs/builder");
  });

  it("Top Signals nudge navigates to /app/listen/signal", () => {
    renderTray();
    const heading = screen.getAllByText("Top Signals").find((el) => el.tagName === "SPAN")!;
    const section = heading.closest(".px-4") as HTMLElement;
    const nudge = within(section).getByRole("button", { name: /view signal view/i });
    fireEvent.click(nudge);
    expect(mockNavigate).toHaveBeenCalledWith("/app/listen/signal");
  });
});

describe("TaskTray: My Tray section", () => {
  it("shows the add-to-tray hint when the store is empty", () => {
    renderTray();
    const section = getTraySection();
    expect(within(section).getByText(/nothing in your tray yet/i)).toBeTruthy();
  });

  it("renders an open tray item by title", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Increase budget by 20%" }));
    renderTray();
    const section = getTraySection();
    expect(within(section).getByText("Increase budget by 20%")).toBeTruthy();
  });

  it("renders multiple open items", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "First action" }));
    addToTray("acct1", makeItem({ id: "c2", title: "Second action" }));
    renderTray();
    const section = getTraySection();
    expect(within(section).getByText("First action")).toBeTruthy();
    expect(within(section).getByText("Second action")).toBeTruthy();
  });

  it("shows a kind chip on each item", () => {
    addToTray("acct1", makeItem({ id: "c1", kind: "hypothesis", title: "Hyp item" }));
    renderTray();
    const section = getTraySection();
    expect(within(section).getByText("Hypothesis")).toBeTruthy();
  });

  it("marking an item complete moves it into History", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Complete me" }));
    renderTray();
    const section = getTraySection();
    fireEvent.click(within(section).getByRole("button", { name: /mark complete/i }));
    // No longer listed as an open card…
    expect(within(section).queryByRole("button", { name: /mark complete/i })).toBeNull();
    // …but available behind the History toggle.
    fireEvent.click(within(section).getByText(/history \(1\)/i));
    expect(within(section).getByText("Complete me")).toBeTruthy();
    expect(within(section).getByText("Completed")).toBeTruthy();
  });

  it("archiving an item moves it into History with an Archived chip", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Archive me" }));
    renderTray();
    const section = getTraySection();
    fireEvent.click(within(section).getByRole("button", { name: /archive "archive me"/i }));
    fireEvent.click(within(section).getByText(/history \(1\)/i));
    expect(within(section).getByText("Archived")).toBeTruthy();
  });

  it("history is never deleted — both done and archived items are listed", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Done one" }));
    addToTray("acct1", makeItem({ id: "c2", title: "Archived one" }));
    setTrayItemStatus("acct1", "c1", "done");
    setTrayItemStatus("acct1", "c2", "archived");
    renderTray();
    const section = getTraySection();
    fireEvent.click(within(section).getByText(/history \(2\)/i));
    expect(within(section).getByText("Done one")).toBeTruthy();
    expect(within(section).getByText("Archived one")).toBeTruthy();
  });

  it("a history item can be moved back to the tray", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Restore me" }));
    setTrayItemStatus("acct1", "c1", "done");
    renderTray();
    const section = getTraySection();
    fireEvent.click(within(section).getByText(/history \(1\)/i));
    fireEvent.click(within(section).getByRole("button", { name: /move "restore me" back to tray/i }));
    expect(getOpenTrayItems("acct1")).toHaveLength(1);
  });

  it("open item with an href exposes an open-source button that navigates", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Linked", href: "/app/strategy/hypotheses?focus=h1" }));
    renderTray();
    const section = getTraySection();
    fireEvent.click(within(section).getByRole("button", { name: /open source of "linked"/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/app/strategy/hypotheses?focus=h1");
  });

  it("History toggle expands then collapses on successive clicks", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Done entry" }));
    setTrayItemStatus("acct1", "c1", "done");
    renderTray();
    const section = getTraySection();
    const toggle = within(section).getByText(/history \(1\)/i);
    fireEvent.click(toggle);
    expect(within(section).getByText("Done entry")).toBeTruthy();
    fireEvent.click(toggle);
    expect(within(section).queryByText("Done entry")).toBeNull();
  });

  it("does not show a History toggle when nothing is done or archived", () => {
    addToTray("acct1", makeItem({ id: "c1" }));
    renderTray();
    const section = getTraySection();
    expect(within(section).queryByText(/history \(/i)).toBeNull();
  });

  // ── The list-stack pile: the first three open items stay visible and
  // actionable; the rest stack behind a count-labelled face card. ──────

  it("piles open items past the third behind a '+N more queued' face", () => {
    for (let i = 1; i <= 5; i++) {
      addToTray("acct1", makeItem({ id: `c${i}`, title: `Action ${i}` }));
    }
    renderTray();
    const section = getTraySection();
    expect(within(section).getByText("Action 1")).toBeTruthy();
    expect(within(section).getByText("Action 3")).toBeTruthy();
    expect(within(section).queryByText("Action 4")).toBeNull();
    const face = within(section).getByText("2 more queued");
    fireEvent.click(face);
    expect(within(section).getByText("Action 4")).toBeTruthy();
    expect(within(section).getByText("Action 5")).toBeTruthy();
  });

  it("fanned-out items past the pile stay fully actionable", () => {
    for (let i = 1; i <= 4; i++) {
      addToTray("acct1", makeItem({ id: `c${i}`, title: `Action ${i}` }));
    }
    renderTray();
    const section = getTraySection();
    fireEvent.click(within(section).getByText("1 more queued"));
    fireEvent.click(within(section).getByRole("button", { name: /archive "action 4"/i }));
    expect(getOpenTrayItems("acct1")).toHaveLength(3);
  });

  it("shows no pile face for three or fewer open items", () => {
    for (let i = 1; i <= 3; i++) {
      addToTray("acct1", makeItem({ id: `c${i}`, title: `Action ${i}` }));
    }
    renderTray();
    const section = getTraySection();
    expect(within(section).queryByText(/more queued/)).toBeNull();
    expect(within(section).getByText("Action 3")).toBeTruthy();
  });
});

describe("TaskTray: minimised strip (closed state)", () => {
  beforeEach(() => {
    mockUseTaskTray.mockReturnValue(closedTrayCtx());
  });

  it("renders the expand button when closed", () => {
    renderTray();
    const btns = screen.getAllByRole("button", { name: /expand task tray/i });
    expect(btns.length).toBeGreaterThan(0);
  });

  it("shows no badge when there are no pending items", () => {
    renderTray();
    const badges = document.querySelectorAll(".tabular-nums");
    expect(badges.length).toBe(0);
  });

  it("shows a badge when there are open tray items", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Pending item" }));
    renderTray();
    const badge = document.querySelector(".tabular-nums");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe("1");
  });

  it("badge count does not include done items", () => {
    addToTray("a", makeItem({ id: "c1", title: "Active" }));
    addToTray("a", makeItem({ id: "c2", title: "Completed" }));
    setTrayItemStatus("a", "c2", "done");
    renderTray();
    const badge = document.querySelector(".tabular-nums");
    expect(badge!.textContent).toBe("1");
  });

  it("badge caps display at 9", () => {
    for (let i = 0; i < 10; i++) {
      addToTray("a", makeItem({ id: `c${i}`, title: `Item ${i}` }));
    }
    renderTray();
    const badge = document.querySelector(".tabular-nums");
    // Math.min(10, 9) = 9
    expect(badge!.textContent).toBe("9");
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. Drag-to-resize + persistence — mirrors the sidebar's slide-handle
//    clamp/snap behaviour, but for the right-docked tray.
// ═════════════════════════════════════════════════════════════════════

const WIDTH_KEY = "metrix_tray_width";

function getResizeHandle(): HTMLElement {
  return screen.getByLabelText("Task tray resize handle");
}

function drag(handle: HTMLElement, dx: number) {
  fireEvent.pointerDown(handle, { clientX: 0 });
  fireEvent.pointerMove(window, { clientX: dx });
  fireEvent.pointerUp(window);
}

describe("TaskTray: drag-to-resize", () => {
  beforeEach(() => {
    localStorage.removeItem(WIDTH_KEY);
  });

  it("renders a resize handle only while open", () => {
    renderTray();
    expect(screen.getByLabelText("Task tray resize handle")).toBeTruthy();
  });

  it("does not render a resize handle when closed", () => {
    mockUseTaskTray.mockReturnValue(closedTrayCtx());
    renderTray();
    expect(screen.queryByLabelText("Task tray resize handle")).toBeNull();
  });

  it("dragging the handle left grows the tray and persists the new width", () => {
    renderTray();
    const panel = screen.getByLabelText("Task tray resize handle").parentElement as HTMLElement;
    const startWidth = panel.style.width;
    // Handle sits on the left edge — dragging left (negative dx) grows the
    // tray toward the max width.
    drag(getResizeHandle(), -60);
    expect(panel.style.width).not.toBe(startWidth);
    const stored = localStorage.getItem(WIDTH_KEY);
    expect(stored).toBeTruthy();
    expect(Number(stored)).toBeGreaterThan(308);
  });

  it("dragging the handle right shrinks the tray toward the minimum width", () => {
    renderTray();
    drag(getResizeHandle(), 40);
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    expect(stored).toBeLessThan(308);
    expect(stored).toBeGreaterThanOrEqual(200); // never below the collapse-snap floor
  });

  it("dragging far enough toward the closed edge snaps the tray shut", () => {
    const trayCtx = openTrayCtx();
    mockUseTaskTray.mockReturnValue(trayCtx);
    renderTray();
    // Drag well past the collapse-snap threshold (default 308 - 300 = 8px, far below 200).
    drag(getResizeHandle(), 300);
    expect(trayCtx.close).toHaveBeenCalled();
  });

  it("a plain click on the handle (no drag) does not resize or close", () => {
    const trayCtx = openTrayCtx();
    mockUseTaskTray.mockReturnValue(trayCtx);
    renderTray();
    const handle = getResizeHandle();
    fireEvent.pointerDown(handle, { clientX: 0 });
    fireEvent.pointerUp(window);
    expect(trayCtx.close).not.toHaveBeenCalled();
    expect(localStorage.getItem(WIDTH_KEY)).toBeNull();
  });

  it("restores a previously persisted width on mount", () => {
    localStorage.setItem(WIDTH_KEY, "400");
    renderTray();
    const panel = screen.getByLabelText("Task tray resize handle").parentElement as HTMLElement;
    expect(panel.style.width).toBe("400px");
  });

  it("ignores a corrupt/out-of-range stored width and falls back to the default", () => {
    localStorage.setItem(WIDTH_KEY, "99999");
    renderTray();
    const panel = screen.getByLabelText("Task tray resize handle").parentElement as HTMLElement;
    expect(panel.style.width).toBe("308px");
  });
});

describe("TaskTray: closed strip uses the collapsed width", () => {
  it("renders at the fixed closed width", () => {
    mockUseTaskTray.mockReturnValue(closedTrayCtx());
    renderTray();
    const strip = document.querySelector("[data-open='false']") as HTMLElement;
    expect(strip).toBeTruthy();
    expect(strip.style.width).toBe("46px");
  });
});

describe("TaskTray: header summary", () => {
  it("shows 'All caught up' when totalItems is 0", () => {
    renderTray();
    expect(screen.getByText("All caught up")).toBeTruthy();
  });

  it("shows singular 'action pending' for a single item", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Single task" }));
    renderTray();
    expect(screen.getByText("1 action pending")).toBeTruthy();
  });

  it("shows plural 'actions pending' for multiple items", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Task 1" }));
    addToTray("acct1", makeItem({ id: "c2", title: "Task 2" }));
    renderTray();
    expect(screen.getByText("2 actions pending")).toBeTruthy();
  });

  it("does not count done items in the header total", () => {
    addToTray("acct1", makeItem({ id: "c1", title: "Active" }));
    addToTray("acct1", makeItem({ id: "c2", title: "Done" }));
    setTrayItemStatus("acct1", "c2", "done");
    renderTray();
    expect(screen.getByText("1 action pending")).toBeTruthy();
  });
});
