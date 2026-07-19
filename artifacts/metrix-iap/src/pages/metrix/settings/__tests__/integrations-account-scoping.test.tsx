// ─── IntegrationsView · account-scoping regression tests ──────────────
// Asserts that the Integrations page correctly hides ad-account connection
// panels when an ad account is scoped and shows them only in manager/agency
// view. Prevents silent regressions from context changes that swap
// selectedAccountType values.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Stub the live Meta connection query so the panel gating logic is
// deterministic — no live connection, so the full panel set is in scope
// when manager view is active.
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetMetaConnection: () => ({ data: { connected: false }, isLoading: false }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { IntegrationsView } from "../IntegrationsView";

const SESSION_KEY = "metrix_active_account_v1";

function select(type: "manager" | "ad_account", adAccountId: string | null) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type, adAccountId }));
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <IntegrationsView />
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

// ── ad_account mode ──────────────────────────────────────────────────────────

describe("ad_account scoped", () => {
  it('shows the "Agency view only" notice', () => {
    select("ad_account", "bookster");
    const { container } = renderView();
    expect(container.textContent).toContain("Agency view only");
  });

  it("does not render the Meta ad accounts list", () => {
    select("ad_account", "bookster");
    const { container } = renderView();
    expect(container.textContent).not.toContain("Meta ad accounts");
  });

  it("does not render the Manual imports section", () => {
    select("ad_account", "bookster");
    const { container } = renderView();
    expect(container.textContent).not.toContain("Manual imports");
  });

  it('renders a "Switch to agency view" button that calls selectManager', () => {
    select("ad_account", "bookster");
    renderView();
    const btn = screen.getByRole("button", { name: /Switch to agency view/i });
    expect(btn).toBeTruthy();
    // Clicking must flip the selection back to manager mode; the button's
    // onClick is wired directly to selectManager from AccountContext.
    fireEvent.click(btn);
    // After switching, the agency-view notice must disappear and the full
    // integrations list must appear.
    expect(document.body.textContent).not.toContain("Agency view only");
    expect(document.body.textContent).toContain("Meta ad accounts");
  });
});

// ── manager mode ─────────────────────────────────────────────────────────────

describe("manager (agency) view", () => {
  it("shows the Meta ad accounts section", () => {
    select("manager", null);
    const { container } = renderView();
    expect(container.textContent).toContain("Meta ad accounts");
  });

  it("shows the Manual imports section", () => {
    select("manager", null);
    const { container } = renderView();
    expect(container.textContent).toContain("Manual imports");
  });

  it('does not show the "Agency view only" notice', () => {
    select("manager", null);
    const { container } = renderView();
    expect(container.textContent).not.toContain("Agency view only");
  });

  it("shows the integrations list even when a previous ad account id is retained", () => {
    // selectManager keeps the last adAccountId in storage; the integrations
    // panel must still render in manager mode regardless.
    select("manager", "bookster");
    const { container } = renderView();
    expect(container.textContent).toContain("Meta ad accounts");
    expect(container.textContent).not.toContain("Agency view only");
  });
});
