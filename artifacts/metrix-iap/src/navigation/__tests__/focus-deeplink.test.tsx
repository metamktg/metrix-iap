// ─── Focus deep-link coverage ──────────────────────────────────────────
// inpage-nav-targets.test.tsx proves every hardcoded `/app/...?focus=<id>`
// target resolves to a real page, but it deliberately strips the query
// string. This test covers the other half of the contract: rendering the
// target views at a URL with a real `?focus=<id>` from the seed bundle
// and asserting the focused item is actually selected (its drill-down
// drawer opens on arrival). A rename of the `focus` param, or a change in
// how IapLibraryView / CreativeBriefBuilderView / HypothesisQueueView consume it,
// fails here instead of silently breaking every "Open in ..." cross-link.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, within } from "@testing-library/react";

vi.mock("@/contexts/MetrixDataContext", async () => {
  const { seed } = await import("./seed");
  return {
    useMetrixSeed: () => seed,
    useMetrixIsRefetching: () => false,
    // AppShell mounts SeedRefreshFailedBanner, which reads this.
    useMetrixFreshness: () => ({ isRefetching: false, refreshFailed: false, retry: () => {} }),
    MetrixDataProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

import { renderAt, seedAccountSession } from "./harness";
import { seed } from "./seed";

// ─── Real focus ids from the seed bundle ───────────────────────────────
// The harness scopes the session to the "bookster" ad account, so pick
// focusable items from that account's IAP data. Using the first entry of
// each collection keeps the test valid even if seed content changes.

const bookster = seed.ad_accounts.find(
  (a: { id: string }) => a.id === "bookster"
);

const cell = bookster?.iap?.analysis?.performance_by_cell?.[0];
const hypothesis = bookster?.iap?.strategy?.active_hypotheses?.[0];
const brief = bookster?.iap?.brief_builder?.draft_briefs?.[0];
const signal = bookster?.listen?.signal_cards?.[0];

// ─── Drawer helpers ────────────────────────────────────────────────────
// InfoDrawer renders in-tree (no portal) with a close button labelled
// "Close"; its header (kicker + title) is the close button's parent row.

function drawerHeader(container: HTMLElement): HTMLElement | null {
  const closeBtn = container.querySelector('button[aria-label="Close"]');
  return (closeBtn?.parentElement as HTMLElement | null) ?? null;
}

beforeEach(() => {
  cleanup();
  seedAccountSession();
});

describe("seed sanity", () => {
  it("has focusable items in the bookster seed data", () => {
    expect(cell?.cell_id).toBeTruthy();
    expect(hypothesis?.id).toBeTruthy();
    expect(brief?.id).toBeTruthy();
    expect(signal?.id).toBeTruthy();
  });
});

describe("IAP Library ?focus=<cell_id>", () => {
  it("opens the drill-down drawer on the focused cell", async () => {
    const { container } = await renderAt(
      `/app/analysis/library?focus=${cell.cell_id}`
    );
    const header = drawerHeader(container);
    expect(header).not.toBeNull();
    within(header!).getByText(`Creative cell · ${cell.cell_id}`);
    within(header!).getByText(cell.book2_concept_name);
  });

  it("does not open a drawer without a focus param", async () => {
    const { container } = await renderAt("/app/analysis/library");
    expect(drawerHeader(container)).toBeNull();
  });

  it("does not open a drawer for an unknown focus id", async () => {
    const { container } = await renderAt(
      "/app/analysis/library?focus=__no_such_cell__"
    );
    expect(drawerHeader(container)).toBeNull();
  });
});

describe("Creative Brief Builder ?focus=<brief id>", () => {
  // Brief Builder is the canvas master-detail screen: the brief list is
  // always on the left and ?focus selects which brief's workspace shows
  // on the right — no drawer/close button to find, so these assert on
  // the page content directly.
  it("renders the focused brief's own workspace", async () => {
    const { container } = await renderAt(`/app/creative/builder?focus=${brief.id}`);
    expect(container.textContent).toContain(brief.asset_type);
    expect(container.textContent).toContain(brief.human_direction);
  });

  it("selects the first brief without a focus param (canvas default)", async () => {
    const { container } = await renderAt("/app/creative/builder");
    const detail = container.querySelector('[data-testid="brief-detail"]');
    expect(detail).not.toBeNull();
    expect(container.querySelector('[data-testid="brief-list"]')).not.toBeNull();
  });

  it("falls back to the first brief for an unknown focus id", async () => {
    const { container } = await renderAt(
      "/app/creative/builder?focus=__no_such_brief__"
    );
    expect(container.querySelector('[data-testid="brief-detail"]')).not.toBeNull();
  });
});

describe("Hypothesis Queue ?focus=<hypothesis id>", () => {
  it("opens the drill-down drawer on the focused hypothesis", async () => {
    const { container } = await renderAt(
      `/app/strategy/hypotheses?focus=${hypothesis.id}`
    );
    const header = drawerHeader(container);
    expect(header).not.toBeNull();
    within(header!).getByText(`Hypothesis · ${hypothesis.id}`);
    within(header!).getByText(hypothesis.label);
  });

  it("does not open a drawer without a focus param", async () => {
    const { container } = await renderAt("/app/strategy/hypotheses");
    expect(drawerHeader(container)).toBeNull();
  });

  it("does not open a drawer for an unknown focus id", async () => {
    const { container } = await renderAt(
      "/app/strategy/hypotheses?focus=__no_such_hypothesis__"
    );
    expect(drawerHeader(container)).toBeNull();
  });
});

describe("Listen Signal ?focus=<signal id>", () => {
  it("opens the drill-down drawer on the focused signal", async () => {
    const { container } = await renderAt(`/app/listen/signal?focus=${signal.id}`);
    const header = drawerHeader(container);
    expect(header).not.toBeNull();
    within(header!).getByText("Signal");
    within(header!).getByText(signal.title);
  });

  it("does not open a drawer without a focus param", async () => {
    const { container } = await renderAt("/app/listen/signal");
    expect(drawerHeader(container)).toBeNull();
  });

  it("does not open a drawer for an unknown focus id", async () => {
    const { container } = await renderAt(
      "/app/listen/signal?focus=__no_such_signal__"
    );
    expect(drawerHeader(container)).toBeNull();
  });
});

// ─── Producer/consumer param-name lock ─────────────────────────────────
// Cross-links are built with `?focus=` literals while views read the param
// via useFocusParam(). If either side renames the param, the positive
// drawer tests above fail; this test additionally pins the *other* name a
// refactor might introduce from being silently consumed.

describe("focus param name", () => {
  it("ignores a differently-named query param", async () => {
    const { container } = await renderAt(
      `/app/analysis/library?highlight=${cell.cell_id}`
    );
    expect(drawerHeader(container)).toBeNull();
  });
});
