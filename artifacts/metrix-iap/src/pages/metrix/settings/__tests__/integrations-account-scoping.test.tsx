// ─── IntegrationsView · account-scoping regression tests ──────────────
// Asserts that the Integrations page renders the per-account config panel
// (AdAccountIntegrationsPanel) when an ad account is scoped, and the full
// agency overview when in manager mode.
//
// Also guards MetaLiveConnection: the live-connection banner and its
// connect/disconnect controls must never appear when an ad account is scoped,
// even when the Meta connection is active (connected: true).

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

// Stub the live Meta connection query using vi.fn() so individual tests can
// override the returned connection state without re-mocking the whole module.
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetMetaConnection: vi.fn(() => ({ data: { connected: false }, isLoading: false })),
    useListMetaAdAccounts: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
    useSelectMetaAdAccount: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
    useDisconnectMetaAccount: vi.fn((opts?: { mutation?: { onError?: (err: unknown) => void } }) => ({
      mutate: () => opts?.mutation?.onError?.(new Error("Disconnect failed")),
      isPending: false,
    })),
    useRunMetaReports: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
    useListMetaReportRows: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  };
});

import {
  useGetMetaConnection,
  useListMetaAdAccounts,
  useSelectMetaAdAccount,
  useDisconnectMetaAccount,
  useRunMetaReports,
} from "@workspace/api-client-react";
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
  vi.mocked(useGetMetaConnection).mockReturnValue({
    data: { connected: false },
    isLoading: false,
  } as ReturnType<typeof useGetMetaConnection>);
  vi.mocked(useListMetaAdAccounts).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useListMetaAdAccounts>);
  vi.mocked(useSelectMetaAdAccount).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSelectMetaAdAccount>);
  vi.mocked(useDisconnectMetaAccount).mockImplementation(
    (opts?: { mutation?: { onError?: (err: unknown) => void } }) => ({
      mutate: () => opts?.mutation?.onError?.(new Error("Disconnect failed")),
      isPending: false,
    }) as ReturnType<typeof useDisconnectMetaAccount>
  );
  vi.mocked(useRunMetaReports).mockImplementation(
    () => ({ mutate: vi.fn(), isPending: false }) as unknown as ReturnType<typeof useRunMetaReports>
  );
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

  it("shows the connect button when Meta is not connected", () => {
    vi.mocked(useGetMetaConnection).mockReturnValue({
      data: { connected: false },
      isLoading: false,
    } as ReturnType<typeof useGetMetaConnection>);
    select("manager", null);
    renderView();
    // The "Connect with Meta" button must be present in the live-connection card.
    expect(screen.getByTestId("button-connect-meta-live")).toBeTruthy();
  });

  it("shows the disconnect button when Meta is connected", () => {
    // connected: true — the ConnectedPanel renders inside MetaLiveConnection.
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
    renderView();
    // The "Disconnect" button must be present: this is the live connection
    // banner that must only appear in manager/agency view.
    expect(screen.getByTestId("button-disconnect-meta")).toBeTruthy();
    // And the connect button must not also appear (only one state at a time).
    expect(screen.queryByTestId("button-connect-meta-live")).toBeNull();
  });

  it("AccountPicker renders with pending_selection and the confirm button is disabled until an account is chosen", () => {
    // pending_selection: true means OAuth completed but no account selected yet.
    // The AccountPicker must render and its "Connect this account" button must
    // be disabled (no choice made) until the user explicitly picks one.
    vi.mocked(useGetMetaConnection).mockReturnValue({
      data: {
        connected: false,
        pending_selection: true,
        pilot_mode: true,
      },
      isLoading: false,
    } as ReturnType<typeof useGetMetaConnection>);
    // Two ad accounts available; neither is the pilot account so no auto-select.
    vi.mocked(useListMetaAdAccounts).mockReturnValue({
      data: {
        accounts: [
          { id: "act_aaa", name: "Brand Alpha", currency: "USD", timezone_name: "America/New_York" },
          { id: "act_bbb", name: "Brand Beta", currency: "EUR", timezone_name: "Europe/London" },
        ],
        pilot_required_account_id: null,
        pilot_required_account_present: false,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListMetaAdAccounts>);
    select("manager", null);
    renderView();

    // AccountPicker section heading must be visible.
    expect(screen.getByText(/Select the ad account to connect/i)).toBeTruthy();

    // "Connect this account" button must be disabled before any selection.
    const confirmBtn = screen.getByTestId("button-save-account-selection");
    expect(confirmBtn).toBeTruthy();
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    // Click one of the account rows to select it.
    fireEvent.click(screen.getByTestId("button-pick-account-act_aaa"));

    // After selection the button must become enabled.
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("AccountPicker surfaces the pilot-account warning when pilot_required_account_present is false", () => {
    // pilot_mode: true but the required pilot account is not present in the
    // profile's accounts — a warning banner must appear to guide the user.
    vi.mocked(useGetMetaConnection).mockReturnValue({
      data: {
        connected: false,
        pending_selection: true,
        pilot_mode: true,
      },
      isLoading: false,
    } as ReturnType<typeof useGetMetaConnection>);
    vi.mocked(useListMetaAdAccounts).mockReturnValue({
      data: {
        accounts: [
          { id: "act_other", name: "Unrelated Account", currency: "USD", timezone_name: null },
        ],
        pilot_required_account_id: "act_pilot_123",
        pilot_required_account_present: false,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListMetaAdAccounts>);
    select("manager", null);
    const { container } = renderView();

    // The warning banner must mention the missing pilot account id.
    expect(container.textContent).toContain("act_pilot_123");
    // And it must explain that the account is not visible to this profile.
    expect(container.textContent).toContain("not visible to this Meta profile");
  });

  it("AccountPicker 'Connect this account' button is disabled and mutate is not called while isPending is true", () => {
    // Guard against double-submit: if isPending is true (a save is already in
    // flight) the button must be disabled so a second click cannot fire mutate.
    const mutate = vi.fn();
    vi.mocked(useSelectMetaAdAccount).mockReturnValue({
      mutate,
      isPending: true,
    } as unknown as ReturnType<typeof useSelectMetaAdAccount>);
    vi.mocked(useGetMetaConnection).mockReturnValue({
      data: {
        connected: false,
        pending_selection: true,
        pilot_mode: true,
      },
      isLoading: false,
    } as ReturnType<typeof useGetMetaConnection>);
    vi.mocked(useListMetaAdAccounts).mockReturnValue({
      data: {
        accounts: [
          { id: "act_aaa", name: "Brand Alpha", currency: "USD", timezone_name: "America/New_York" },
        ],
        pilot_required_account_id: null,
        pilot_required_account_present: false,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListMetaAdAccounts>);
    select("manager", null);
    renderView();

    // Pick the account row so `chosen` is set — this would normally enable the
    // button, but isPending keeps it disabled.
    fireEvent.click(screen.getByTestId("button-pick-account-act_aaa"));

    const confirmBtn = screen.getByTestId("button-save-account-selection");
    // Button must be disabled while a save is in flight.
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    // Clicking a disabled button must not fire mutate.
    fireEvent.click(confirmBtn);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("disconnect mutation error surfaces an error message and is not silently swallowed", () => {
    // When disconnect.mutate() triggers onError, the error message must appear
    // in the UI — it must not be silently discarded.
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
    renderView();

    // Disconnect button must be present in the connected state.
    const disconnectBtn = screen.getByTestId("button-disconnect-meta");
    expect(disconnectBtn).toBeTruthy();

    // Clicking Disconnect triggers mutate() which, via our mock, fires onError
    // with a synthetic Error("Disconnect failed"). The component must surface
    // the message rather than swallowing it.
    fireEvent.click(disconnectBtn);
    expect(document.body.textContent).toContain("Disconnect failed");
  });

  it('"Run report pulls" button is disabled while reports are pending', () => {
    // isPending: true simulates an in-flight runReports mutation. The button
    // must be disabled to prevent overlapping Meta API calls.
    vi.mocked(useRunMetaReports).mockImplementation(
      () => ({ mutate: vi.fn(), isPending: true }) as unknown as ReturnType<typeof useRunMetaReports>
    );
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
    renderView();

    const runBtn = screen.getByTestId("button-run-reports");
    expect(runBtn).toBeTruthy();
    expect((runBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("runReports mutation error surfaces an error message in the UI", () => {
    // When runReports.mutate() triggers onError, the error banner must appear.
    vi.mocked(useRunMetaReports).mockImplementation(
      (opts?: { mutation?: { onError?: (err: unknown) => void } }) =>
        ({
          mutate: () => opts?.mutation?.onError?.(new Error("Report pull failed")),
          isPending: false,
        }) as unknown as ReturnType<typeof useRunMetaReports>
    );
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
    renderView();

    const runBtn = screen.getByTestId("button-run-reports");
    expect(runBtn).toBeTruthy();

    // Clicking the button triggers mutate() which fires onError with a
    // synthetic error. The component must surface the message.
    fireEvent.click(runBtn);
    expect(document.body.textContent).toContain("Report pull failed");
  });
});
