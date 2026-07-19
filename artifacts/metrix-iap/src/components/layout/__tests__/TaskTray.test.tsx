// ─── TaskTray tests ───────────────────────────────────────────────────
//
// Covers three surfaces:
//   1. computeTrayCount — pure badge-count helper extracted from
//      useTaskTrayCount; tests every combination of approved-undone,
//      workflow (hypotheses / signals / pending drafts), and done items.
//   2. decisionStore — the underlying store that feeds the Approved
//      Actions section: setDecision, getAllApproved, toggleDone, undoLast.
//   3. TaskTray component — RTL rendering of the Approved Actions section
//      (grouped items, Done collapse toggle) and empty-state nudge links.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { computeTrayCount, TaskTray } from "../TaskTray";
import {
  setDecision,
  toggleDone,
  getAllApproved,
  undoLast,
  getDecision,
  isDone,
  hasLast,
  _resetForTest,
} from "@/lib/data/decisionStore";
import type { CardMeta } from "@/lib/data/decisionStore";

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

function makeMeta(overrides: Partial<CardMeta> = {}): CardMeta {
  return {
    title: "Pause underperforming ad set",
    recommendedAction: "Navigate to Ads Manager and pause the ad set.",
    actionGroup: "Budget actions",
    scopeLabel: "Bookster",
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
// In @testing-library/react v16 with vitest the automatic afterEach cleanup
// is not guaranteed to run, so we call it explicitly.

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
    expect(computeTrayCount({ approvedUndone: 0, hypotheses: [], signals: [], pendingDrafts: [] })).toBe(0);
  });

  it("counts approved-undone items", () => {
    expect(computeTrayCount({ approvedUndone: 3, hypotheses: [], signals: [], pendingDrafts: [] })).toBe(3);
  });

  it("done items are not included (caller must pre-filter)", () => {
    expect(computeTrayCount({ approvedUndone: 0, hypotheses: [], signals: [], pendingDrafts: [] })).toBe(0);
    expect(computeTrayCount({ approvedUndone: 2, hypotheses: [], signals: [], pendingDrafts: [] })).toBe(2);
  });

  it("caps hypotheses at 3 regardless of array length", () => {
    const many = Array(10).fill({});
    expect(computeTrayCount({ approvedUndone: 0, hypotheses: many, signals: [], pendingDrafts: [] })).toBe(3);
  });

  it("counts 1 and 2 hypotheses without capping", () => {
    expect(computeTrayCount({ approvedUndone: 0, hypotheses: [{}], signals: [], pendingDrafts: [] })).toBe(1);
    expect(computeTrayCount({ approvedUndone: 0, hypotheses: [{}, {}], signals: [], pendingDrafts: [] })).toBe(2);
  });

  it("caps signals at 2 regardless of array length", () => {
    const many = Array(10).fill({});
    expect(computeTrayCount({ approvedUndone: 0, hypotheses: [], signals: many, pendingDrafts: [] })).toBe(2);
  });

  it("counts 1 signal without capping", () => {
    expect(computeTrayCount({ approvedUndone: 0, hypotheses: [], signals: [{}], pendingDrafts: [] })).toBe(1);
  });

  it("sums all four sources", () => {
    // approvedUndone=1 + hyps capped@3 + signals capped@2 + drafts=4 = 10
    expect(
      computeTrayCount({
        approvedUndone: 1,
        hypotheses: Array(5).fill({}),
        signals: Array(5).fill({}),
        pendingDrafts: Array(4).fill({}),
      })
    ).toBe(10);
  });

  it("caps the total at 99", () => {
    expect(
      computeTrayCount({
        approvedUndone: 90,
        hypotheses: Array(5).fill({}),
        signals: Array(5).fill({}),
        pendingDrafts: Array(50).fill({}),
      })
    ).toBe(99);
  });

  it("returns 0 when all approved items are done (approvedUndone=0)", () => {
    expect(computeTrayCount({ approvedUndone: 0, hypotheses: [], signals: [], pendingDrafts: [] })).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. decisionStore — pure store functions
// ═════════════════════════════════════════════════════════════════════

describe("decisionStore: setDecision / getDecision", () => {
  it("defaults to 'pending' for unknown keys", () => {
    expect(getDecision("acct1", "card1")).toBe("pending");
  });

  it("stores an 'approved' decision with meta", () => {
    setDecision("acct1", "card1", "approved", makeMeta());
    expect(getDecision("acct1", "card1")).toBe("approved");
  });

  it("stores a 'rejected' decision", () => {
    setDecision("acct1", "card2", "rejected");
    expect(getDecision("acct1", "card2")).toBe("rejected");
  });

  it("transitions from approved back to pending", () => {
    setDecision("acct1", "card1", "approved", makeMeta());
    setDecision("acct1", "card1", "pending");
    expect(getDecision("acct1", "card1")).toBe("pending");
  });

  it("scopes keys per account — different accounts are independent", () => {
    setDecision("acct1", "card1", "approved", makeMeta());
    setDecision("acct2", "card1", "rejected");
    expect(getDecision("acct1", "card1")).toBe("approved");
    expect(getDecision("acct2", "card1")).toBe("rejected");
  });

  it("preserves existing meta when re-approving without new meta", () => {
    const meta = makeMeta({ title: "Original title" });
    setDecision("acct1", "card1", "approved", meta);
    setDecision("acct1", "card1", "approved"); // no new meta
    const [item] = getAllApproved();
    expect(item.meta.title).toBe("Original title");
  });
});

describe("decisionStore: getAllApproved", () => {
  it("returns empty array when store is empty", () => {
    expect(getAllApproved()).toHaveLength(0);
  });

  it("returns only approved records (not pending or rejected)", () => {
    setDecision("a", "c1", "approved", makeMeta({ title: "Approved" }));
    setDecision("a", "c2", "rejected");
    setDecision("a", "c3", "pending");
    const approved = getAllApproved();
    expect(approved).toHaveLength(1);
    expect(approved[0].cardId).toBe("c1");
  });

  it("returns approved records with correct scopeId and cardId", () => {
    setDecision("scope-abc", "card-xyz", "approved", makeMeta());
    const [item] = getAllApproved();
    expect(item.scopeId).toBe("scope-abc");
    expect(item.cardId).toBe("card-xyz");
  });

  it("approved records without meta are excluded (meta required for tray display)", () => {
    setDecision("a", "c1", "approved");
    const approved = getAllApproved();
    expect(approved).toHaveLength(0);
  });

  it("returns done flag correctly for toggled items", () => {
    setDecision("a", "c1", "approved", makeMeta());
    expect(getAllApproved()[0].done).toBe(false);
    toggleDone("a", "c1");
    expect(getAllApproved()[0].done).toBe(true);
  });
});

describe("decisionStore: toggleDone", () => {
  it("marks an approved item as done", () => {
    setDecision("a", "c1", "approved", makeMeta());
    toggleDone("a", "c1");
    expect(isDone("a", "c1")).toBe(true);
  });

  it("toggles done back to false", () => {
    setDecision("a", "c1", "approved", makeMeta());
    toggleDone("a", "c1");
    toggleDone("a", "c1");
    expect(isDone("a", "c1")).toBe(false);
  });

  it("is a no-op on a non-existent key", () => {
    toggleDone("a", "does-not-exist");
    expect(isDone("a", "does-not-exist")).toBe(false);
  });

  it("undone and done items are separately countable via getAllApproved", () => {
    setDecision("a", "c1", "approved", makeMeta({ title: "Undone" }));
    setDecision("a", "c2", "approved", makeMeta({ title: "Done" }));
    toggleDone("a", "c2");
    const all = getAllApproved();
    const undone = all.filter((i) => !i.done);
    const done = all.filter((i) => i.done);
    expect(undone).toHaveLength(1);
    expect(undone[0].meta.title).toBe("Undone");
    expect(done).toHaveLength(1);
    expect(done[0].meta.title).toBe("Done");
  });
});

describe("decisionStore: undoLast", () => {
  it("reverts the last setDecision call", () => {
    setDecision("a", "c1", "approved", makeMeta());
    expect(getDecision("a", "c1")).toBe("approved");
    undoLast();
    expect(getDecision("a", "c1")).toBe("pending");
  });

  it("hasLast is true after a decision, false after undo", () => {
    setDecision("a", "c1", "approved", makeMeta());
    expect(hasLast()).toBe(true);
    undoLast();
    expect(hasLast()).toBe(false);
  });

  it("is a no-op when there is nothing to undo", () => {
    expect(() => undoLast()).not.toThrow();
    expect(getAllApproved()).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. TaskTray component — rendering
// ═════════════════════════════════════════════════════════════════════

// Helper: find the Approved Actions section container
function getApprovedSection(): HTMLElement {
  const heading = screen
    .getAllByText("Approved Actions")
    .find((el) => el.tagName === "SPAN");
  return heading!.closest(".px-4") as HTMLElement;
}

describe("TaskTray: empty-state nudge links navigate to the correct routes", () => {
  it("Approved Actions nudge navigates to /app/listen/recommendations", () => {
    renderTray();
    const section = getApprovedSection();
    // The nudge button label differs from the bottom nav-link label ("Recommendations")
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

describe("TaskTray: Approved Actions section", () => {
  it("shows 'Approve a recommendation to start' when store is empty", () => {
    renderTray();
    const section = getApprovedSection();
    expect(within(section).getByText(/approve a recommendation to start/i)).toBeTruthy();
  });

  it("renders an approved item by title", () => {
    setDecision("acct1", "card1", "approved", makeMeta({ title: "Increase budget by 20%" }));
    renderTray();
    const section = getApprovedSection();
    expect(within(section).getByText("Increase budget by 20%")).toBeTruthy();
  });

  it("renders multiple approved items", () => {
    setDecision("acct1", "card1", "approved", makeMeta({ title: "First action" }));
    setDecision("acct1", "card2", "approved", makeMeta({ title: "Second action" }));
    renderTray();
    const section = getApprovedSection();
    expect(within(section).getByText("First action")).toBeTruthy();
    expect(within(section).getByText("Second action")).toBeTruthy();
  });

  it("groups items under GROUP_ORDER labels", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ actionGroup: "Budget actions", title: "Budget item" }));
    setDecision("acct1", "c2", "approved", makeMeta({ actionGroup: "Creative actions", title: "Creative item" }));
    renderTray();
    const section = getApprovedSection();
    // "Budget actions" / "Creative actions" appear both as the group header <p> AND
    // as the actionGroup badge <span> on each card. Verify the <p> heading exists.
    const budgetEls = within(section).getAllByText("Budget actions");
    expect(budgetEls.some((el) => el.tagName === "P")).toBe(true);
    const creativeEls = within(section).getAllByText("Creative actions");
    expect(creativeEls.some((el) => el.tagName === "P")).toBe(true);
    expect(within(section).getByText("Budget item")).toBeTruthy();
    expect(within(section).getByText("Creative item")).toBeTruthy();
  });

  it("renders ungrouped items without a group header for unrecognised actionGroup", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ actionGroup: "Custom group", title: "Custom item" }));
    renderTray();
    const section = getApprovedSection();
    expect(within(section).getByText("Custom item")).toBeTruthy();
    // "Custom group" is not in GROUP_ORDER so no <p> group heading should be rendered.
    // It may still appear as the actionGroup badge <span> on the card itself.
    const els = within(section).queryAllByText("Custom group");
    const hasGroupHeader = els.some((el) => el.tagName === "P");
    expect(hasGroupHeader).toBe(false);
  });

  it("does not show a Done toggle when no items are done", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Active item" }));
    renderTray();
    const section = getApprovedSection();
    expect(within(section).queryByText(/done \(/i)).toBeNull();
  });

  it("shows a Done toggle when at least one item is marked done", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Completed item" }));
    toggleDone("acct1", "c1");
    renderTray();
    const section = getApprovedSection();
    expect(within(section).getByText(/done \(1\)/i)).toBeTruthy();
  });

  it("done item is hidden behind the Done toggle until expanded", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Done task" }));
    toggleDone("acct1", "c1");
    renderTray();
    const section = getApprovedSection();
    // Before expand: "Done task" is not in the DOM (conditional render)
    expect(within(section).queryByText("Done task")).toBeNull();
    // Clicking the toggle shows it
    fireEvent.click(within(section).getByText(/done \(1\)/i));
    expect(within(section).getByText("Done task")).toBeTruthy();
  });

  it("Done toggle expands then collapses the done list on successive clicks", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Done entry" }));
    toggleDone("acct1", "c1");
    renderTray();
    const section = getApprovedSection();
    const toggle = within(section).getByText(/done \(1\)/i);

    // Expand
    fireEvent.click(toggle);
    expect(within(section).getByText("Done entry")).toBeTruthy();

    // Collapse
    fireEvent.click(toggle);
    expect(within(section).queryByText("Done entry")).toBeNull();
  });

  it("approved undone item has a 'Mark done' accessible button", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Todo" }));
    renderTray();
    const section = getApprovedSection();
    // getAllByRole because there could be multiple pending items in theory, but here only one
    const btn = within(section).getAllByRole("button", { name: /mark done/i });
    expect(btn.length).toBeGreaterThan(0);
  });

  it("approved done item has a 'Mark not done' accessible button when expanded", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Finished" }));
    toggleDone("acct1", "c1");
    renderTray();
    const section = getApprovedSection();
    // Expand the done list first
    fireEvent.click(within(section).getByText(/done \(1\)/i));
    const btn = within(section).getAllByRole("button", { name: /mark not done/i });
    expect(btn.length).toBeGreaterThan(0);
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

  it("shows a badge when there are approved-undone items", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Pending item" }));
    renderTray();
    const badge = document.querySelector(".tabular-nums");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe("1");
  });

  it("badge count does not include done items", () => {
    setDecision("a", "c1", "approved", makeMeta({ title: "Active" }));
    setDecision("a", "c2", "approved", makeMeta({ title: "Completed" }));
    toggleDone("a", "c2"); // only 1 undone
    renderTray();
    const badge = document.querySelector(".tabular-nums");
    expect(badge!.textContent).toBe("1");
  });

  it("badge caps display at 9", () => {
    for (let i = 0; i < 10; i++) {
      setDecision("a", `c${i}`, "approved", makeMeta({ title: `Item ${i}` }));
    }
    renderTray();
    const badge = document.querySelector(".tabular-nums");
    // Math.min(10, 9) = 9
    expect(badge!.textContent).toBe("9");
  });
});

describe("TaskTray: header summary", () => {
  it("shows 'All caught up' when totalItems is 0", () => {
    renderTray();
    expect(screen.getByText("All caught up")).toBeTruthy();
  });

  it("shows singular 'action pending' for a single item", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Single task" }));
    renderTray();
    expect(screen.getByText("1 action pending")).toBeTruthy();
  });

  it("shows plural 'actions pending' for multiple items", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Task 1" }));
    setDecision("acct1", "c2", "approved", makeMeta({ title: "Task 2" }));
    renderTray();
    expect(screen.getByText("2 actions pending")).toBeTruthy();
  });

  it("does not count done approved items in the header total", () => {
    setDecision("acct1", "c1", "approved", makeMeta({ title: "Active" }));
    setDecision("acct1", "c2", "approved", makeMeta({ title: "Done" }));
    toggleDone("acct1", "c2");
    renderTray();
    // Only 1 undone → "1 action pending"
    expect(screen.getByText("1 action pending")).toBeTruthy();
  });
});
