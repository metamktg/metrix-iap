// ─── IntegrationsView · account-scoping regression tests ──────────────
// Asserts that the Integrations page renders the per-account config panel
// (AdAccountIntegrationsPanel) when an ad account is scoped, and the full
// agency overview when in manager mode.
//
// Also guards MetaLiveConnection: it must never appear when an ad account is
// scoped, and in manager view it must always render its gated "Coming soon"
// state — live Meta OAuth connect/disconnect controls are gated UI, not
// reactive to the underlying (real, untouched) connection status.

import { withUnconfiguredAccount, UNCONFIGURED_ID } from "@/test-fixtures/unconfigured";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = withUnconfiguredAccount(JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Stub the live Meta connection query using vi.fn() so individual tests can
// override the returned connection state without re-mocking the whole module.
// (`useGetMetaConnection` still drives IntegrationsView's hasLiveConnection
// check for showing/hiding the manual-import section — the underlying query
// and backend are untouched. MetaLiveConnection itself no longer reads it —
// its gated "Coming soon" state is static.)
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetMetaConnection: vi.fn(() => ({ data: { connected: false }, isLoading: false })),
    // ManualImportDialog hooks
    useStageManualImport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useListManualImports: vi.fn(() => ({ data: { imports: [] }, isLoading: false, refetch: vi.fn() })),
    useUpdateManualImportAdNames: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useDeleteManualImport: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  };
});

import { useGetMetaConnection } from "@workspace/api-client-react";
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
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.mocked(useGetMetaConnection).mockReturnValue({
    data: { connected: false },
    isLoading: false,
  } as ReturnType<typeof useGetMetaConnection>);
});

// ── ad_account mode ──────────────────────────────────────────────────────────

describe("ad_account scoped", () => {
  it("shows the per-account config panel with the account name", () => {
    // "bookster" maps to the "Bookster" ad account in the seed fixture.
    select("ad_account", "bookster");
    const { container } = renderView();
    // The panel must show the account's name.
    expect(container.textContent).toContain("Bookster");
    // The old "Agency view only" dead-end notice must no longer appear.
    expect(container.textContent).not.toContain("Agency view only");
  });

  it("does not render the agency-level ad account list", () => {
    select("ad_account", "bookster");
    const { container } = renderView();
    // The "Ad account configurations" section card is only in agency view.
    expect(container.textContent).not.toContain("Ad account configurations");
  });

  it("does not render the agency Manual imports section card", () => {
    select("ad_account", "bookster");
    const { container } = renderView();
    // The agency-level SectionCard titled "Manual imports" must not appear.
    // (The per-account panel has a "Manual import" button, which is intentional.)
    expect(container.textContent).not.toContain("Manual imports");
  });

  it("shows the platform badge for the scoped ad account", () => {
    // "bookster" has platform "Meta Ads" in the seed fixture.
    select("ad_account", "bookster");
    const { container } = renderView();
    // The platform label must appear as the sub-line beneath the account name.
    expect(container.textContent).toContain("Meta Ads");
  });

  it("badges a configured account by its source kind, never as connected to anything it is not", () => {
    // "bookster" has status "configured" and an imported source: the chip
    // reads "Imported" (audit round 5: it read "Connected", and the status
    // row printed the raw source_status).
    select("ad_account", "bookster");
    const { container } = renderView();
    expect(container.textContent).toContain("Imported");
    expect(container.textContent).toContain("Imported package · analysis data on file");
    expect(container.textContent).not.toContain("imported_from_iap_loop_package");
    expect(container.textContent).not.toMatch(/\bConnected\b/);
  });

  it("shows the 'Not connected' chip for an unconfigured account", () => {
    // Synthesized: the fixture is refreshed from the live demo DB and no
    // longer guarantees ANY unconfigured account exists (the id this test
    // used to name is gone entirely). The state, not the account, is what
    // is under test.
    select("ad_account", UNCONFIGURED_ID);
    const { container } = renderView();
    expect(container.textContent).toContain("Not connected");
    expect(container.textContent).not.toContain('"Connected"');
  });

  it("opens the ManualImportDialog when the Manual import button is clicked", () => {
    select("ad_account", "bookster");
    renderView();
    // The Manual import button must be present in the panel.
    const btn = screen.getByTestId("button-manual-import-integrations");
    expect(btn).toBeTruthy();
    // Clicking it must open the dialog — the dialog title "Add Manual Import"
    // must become visible in the document.
    fireEvent.click(btn);
    expect(document.body.textContent).toContain("Add Manual Import");
  });

  it('renders an "Agency-wide integration settings" crosslink that calls selectManager', () => {
    select("ad_account", "bookster");
    renderView();
    // The crosslink must be present.
    const link = screen.getByRole("button", { name: /Agency-wide integration settings/i });
    expect(link).toBeTruthy();
    // Clicking it must flip the selection back to manager mode so the full
    // agency view becomes visible.
    fireEvent.click(link);
    expect(document.body.textContent).not.toContain("Agency view only");
    expect(document.body.textContent).toContain("Ad account configurations");
  });

  it("clicking the agency-wide link removes the ?account= URL param", () => {
    // Navigate with the account param set, simulating how the crosslink
    // from Listen/Alerts/Signals lands users on the integrations page.
    window.history.replaceState({}, "", "/app/settings/integrations?account=bookster");
    select("ad_account", "bookster");
    renderView();

    // Verify the param is initially present.
    expect(new URLSearchParams(window.location.search).get("account")).toBe("bookster");

    const link = screen.getByRole("button", { name: /Agency-wide integration settings/i });
    fireEvent.click(link);

    // After selectManager the context writes null back to the URL param,
    // which should result in the ?account= param being absent.
    expect(new URLSearchParams(window.location.search).get("account")).toBeNull();
  });

  it("hides MetaLiveConnection connect controls even when Meta is not connected", () => {
    vi.mocked(useGetMetaConnection).mockReturnValue({
      data: { connected: false },
      isLoading: false,
    } as ReturnType<typeof useGetMetaConnection>);
    select("ad_account", "bookster");
    const { container } = renderView();
    // The connect button must never appear in ad-account scope.
    expect(container.querySelector('[data-testid="button-connect-meta-live"]')).toBeNull();
    expect(container.textContent).not.toContain("Live Meta connection");
  });

  it("hides MetaLiveConnection disconnect controls even when Meta is connected", () => {
    // connected: true — the ConnectedPanel (with Disconnect button) would
    // normally render in manager view. It must stay hidden in ad-account scope.
    vi.mocked(useGetMetaConnection).mockReturnValue({
      data: {
        connected: true,
        account: {
          ad_account_id: "act_123",
          account_name: "Pilot Account",
          token_status: "active",
          currency: "USD",
          timezone: "America/New_York",
          connected_at: "2026-01-01T00:00:00Z",
        },
        reports: [],
        pending_selection: false,
        pilot_mode: true,
      },
      isLoading: false,
    } as ReturnType<typeof useGetMetaConnection>);
    select("ad_account", "bookster");
    const { container } = renderView();
    // The per-account panel must be shown…
    expect(container.textContent).toContain("Bookster");
    // …and neither the connect nor the disconnect button from
    // MetaLiveConnection must be present anywhere in the rendered output.
    expect(container.querySelector('[data-testid="button-connect-meta-live"]')).toBeNull();
    expect(container.querySelector('[data-testid="button-disconnect-meta"]')).toBeNull();
  });
});

// ── manager mode ─────────────────────────────────────────────────────────────

describe("manager (agency) view", () => {
  it("shows the Ad account configurations section", () => {
    select("manager", null);
    const { container } = renderView();
    expect(container.textContent).toContain("Ad account configurations");
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
    expect(container.textContent).toContain("Ad account configurations");
    expect(container.textContent).not.toContain("Agency view only");
  });

  it("shows the Agency OAuth connection label", () => {
    select("manager", null);
    const { container } = renderView();
    expect(container.textContent).toContain("Agency OAuth connection");
  });

  it("shows the gated 'Coming soon' state when Meta is not connected", () => {
    vi.mocked(useGetMetaConnection).mockReturnValue({
      data: { connected: false },
      isLoading: false,
    } as ReturnType<typeof useGetMetaConnection>);
    select("manager", null);
    const { container } = renderView();
    // Live Meta OAuth is gated — no working connect control, just an honest
    // "Coming soon" state pointing at manual import.
    expect(container.textContent).toContain("Coming soon");
    expect(container.textContent).toMatch(/manual csv import/i);
    expect(container.querySelector('[data-testid="button-connect-meta-live"]')).toBeNull();
  });

  it("still shows the gated 'Coming soon' state even when the underlying connection reports connected: true", () => {
    // MetaLiveConnection's gate is static UI, not reactive — even if a pilot
    // connection genuinely exists server-side (backend untouched), the page
    // never renders live connect/disconnect controls.
    vi.mocked(useGetMetaConnection).mockReturnValue({
      data: {
        connected: true,
        account: {
          ad_account_id: "act_123",
          account_name: "Pilot Account",
          token_status: "active",
          currency: "USD",
          timezone: "America/New_York",
          connected_at: "2026-01-01T00:00:00Z",
        },
        reports: [],
        pending_selection: false,
        pilot_mode: true,
      },
      isLoading: false,
    } as ReturnType<typeof useGetMetaConnection>);
    select("manager", null);
    const { container } = renderView();
    expect(container.textContent).toContain("Coming soon");
    expect(container.querySelector('[data-testid="button-connect-meta-live"]')).toBeNull();
    expect(container.querySelector('[data-testid="button-disconnect-meta"]')).toBeNull();
    expect(container.querySelector('[data-testid="button-run-reports"]')).toBeNull();
  });
});

// ── manager view · the source is the source ──────────────────────────────────
// The agency list printed the raw source_status ("manual_reports",
// "imported_from_iap_loop_package") beside a CONNECTED badge on accounts
// that were never connected to anything (audit round 5, 2026-09-05).

describe("manager view · account sources", () => {
  it("names each account's source and badges it by kind, never with the raw status or a false Connected", () => {
    select("manager", null);
    const { container } = renderView();
    expect(container.textContent).toContain("Manual reports · analysis data on file");
    expect(container.textContent).toContain("Imported package · analysis data on file");
    expect(container.textContent).not.toContain("manual_reports");
    expect(container.textContent).not.toContain("imported_from_iap_loop_package");
    // The chips: a manual account is "Manual", an imported one "Imported".
    const chips = Array.from(container.querySelectorAll("span")).map((el) => el.textContent?.trim());
    expect(chips).toContain("Manual");
    expect(chips).toContain("Imported");
    // Only a live Meta connection reads as connected; the fixture has none.
    expect(chips).not.toContain("Connected");
  });
});
