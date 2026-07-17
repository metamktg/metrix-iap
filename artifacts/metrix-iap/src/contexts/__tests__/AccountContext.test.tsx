// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — AccountContext navigation rules
//
// Covers the four conditional navigate() calls in AccountContext.tsx:
//   selectAdAccount — manager-at-root → navigates to /app/account
//   selectAdAccount — manager-at-other-route → no navigate
//   selectAdAccount — account-to-account → no navigate
//   selectAdAccount — same account (no-op guard) → no navigate
//   selectManager   — ad-account-at-/app/account → navigates to /
//   selectManager   — ad-account-at-other-route → no navigate
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { AccountProvider, useAccount } from "../AccountContext";
import type { MetrixSeed } from "@/lib/data/seedTypes";

// ── Minimal seed fixture ────────────────────────────────────────────────────
const MOCK_SEED: MetrixSeed = {
  schema_version: "test",
  generated_at: "2026-01-01T00:00:00Z",
  integrity_note: "",
  app_defaults: {
    initial_view: "manager",
    active_manager_account_id: "mgr-1",
    selected_ad_account_id: null,
    navigation: [],
    forbidden_ui_terms: [],
    data_isolation_rule: "",
  },
  manager_account: {
    id: "mgr-1",
    name: "Test Manager",
    type: "manager",
    overview_mode: "standard",
    configured_ad_accounts: 2,
    unconfigured_ad_accounts: 0,
    bottom_line_totals: {
      spend_usd: 0,
      impressions: 0,
      link_clicks: 0,
      link_ctr_pct: 0,
      result_totals_by_event: {},
    },
    recommendation_cards: [],
  },
  ad_accounts: [
    { id: "acct-1", name: "Account One", status: "configured", platform: "meta" },
    { id: "acct-2", name: "Account Two", status: "configured", platform: "meta" },
  ],
};

// ── Module mocks ────────────────────────────────────────────────────────────
// Mock wouter so we can control the current location and spy on navigate.
const mockNavigate = vi.fn();
let mockLocation = "/";

vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, mockNavigate],
}));

// Provide the seed without spinning up a real API.
vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => MOCK_SEED,
}));

// ── Test wrapper ────────────────────────────────────────────────────────────
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AccountProvider>{children}</AccountProvider>
);

// ── Reset between tests ─────────────────────────────────────────────────────
beforeEach(() => {
  mockLocation = "/";
  mockNavigate.mockClear();
  sessionStorage.clear();
  // writeUrlAccountParam uses window.history.replaceState, so clear any
  // ?account= param left by a previous test before the next useState init runs.
  window.history.replaceState(null, "", "/");
});

// ═══════════════════════════════════════════════════════════════════════════
// selectAdAccount rules
// ═══════════════════════════════════════════════════════════════════════════
describe("selectAdAccount navigation rules", () => {
  it("no-op guard: selecting the already-active ad account does nothing", () => {
    mockLocation = "/app/creative";
    const { result } = renderHook(() => useAccount(), { wrapper });

    act(() => {
      result.current.selectAdAccount("acct-1");
    });
    mockNavigate.mockClear();

    act(() => {
      result.current.selectAdAccount("acct-1");
    });

    expect(result.current.activeAdAccountId).toBe("acct-1");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("manager-at-root → ad account: navigates to /app/account", () => {
    mockLocation = "/";
    const { result } = renderHook(() => useAccount(), { wrapper });
    expect(result.current.selectedAccountType).toBe("manager");

    act(() => {
      result.current.selectAdAccount("acct-1");
    });

    expect(mockNavigate).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith("/app/account");
    expect(result.current.activeAdAccountId).toBe("acct-1");
  });

  it("manager-at-other-route → ad account: no navigation", () => {
    mockLocation = "/app/strategy";
    const { result } = renderHook(() => useAccount(), { wrapper });
    expect(result.current.selectedAccountType).toBe("manager");

    act(() => {
      result.current.selectAdAccount("acct-1");
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.activeAdAccountId).toBe("acct-1");
  });

  it("ad account → different ad account: no navigation", () => {
    mockLocation = "/app/creative";
    const { result } = renderHook(() => useAccount(), { wrapper });

    act(() => {
      result.current.selectAdAccount("acct-1");
    });
    mockNavigate.mockClear();

    act(() => {
      result.current.selectAdAccount("acct-2");
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.activeAdAccountId).toBe("acct-2");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// selectManager rules
// ═══════════════════════════════════════════════════════════════════════════
describe("selectManager navigation rules", () => {
  it("ad-account-at-/app/account → manager: navigates to /", () => {
    mockLocation = "/app/account";
    const { result } = renderHook(() => useAccount(), { wrapper });

    act(() => {
      result.current.selectAdAccount("acct-1");
    });
    mockNavigate.mockClear();

    act(() => {
      result.current.selectManager();
    });

    expect(mockNavigate).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith("/");
    expect(result.current.selectedAccountType).toBe("manager");
  });

  it("ad-account-at-other-route → manager: no navigation", () => {
    mockLocation = "/app/creative";
    const { result } = renderHook(() => useAccount(), { wrapper });

    act(() => {
      result.current.selectAdAccount("acct-1");
    });
    mockNavigate.mockClear();

    act(() => {
      result.current.selectManager();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.selectedAccountType).toBe("manager");
  });
});
