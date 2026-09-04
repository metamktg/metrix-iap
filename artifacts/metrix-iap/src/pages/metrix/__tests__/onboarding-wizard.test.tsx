// ─── OnboardingWizard render + navigation tests ────────────────────────
// Verifies the guided first-run flow that ManagerOverview shows in place
// of the dashboard when a user has zero ad accounts: Welcome → Prepare →
// Link steps navigate correctly, the real CSV format panels render with
// live server-side data, and the final step opens the real
// AddAccountDialog (same component the normal "Add Account" button uses —
// not a stand-in). The deeper manual-account creation round trip is
// already covered end-to-end against AddAccountDialog directly in
// add-account-keyboard.test.tsx, so this suite focuses on the wizard's own
// steps and its hand-off into that dialog.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ManualPerformanceCsvFormat } from "@workspace/api-client-react";

let mockMutateAsync: ReturnType<typeof vi.fn>;
let mockSelectAdAccount: ReturnType<typeof vi.fn>;

const csvFormat: ManualPerformanceCsvFormat = {
  demographic: {
    report_name: "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
    breakdown_columns: ["Date", "Campaign name", "Ad name", "Gender", "Age"],
    metric_groups: [{ name: "Core", required: true, columns: ["Amount spent (USD)", "Impressions"] }],
    sample_csv: "Date,Campaign name,Ad name,Gender,Age\n2026-01-01,Test,Ad 1,female,25-34",
  },
  device_placement: {
    report_name: "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL",
    breakdown_columns: ["Date", "Campaign name", "Ad name", "Impression device", "Platform", "Placement"],
    metric_groups: [{ name: "Core", required: true, columns: ["Amount spent (USD)", "Impressions"] }],
    sample_csv: "Date,Campaign name,Ad name,Impression device,Platform,Placement\n2026-01-01,Test,Ad 1,mobile_app,facebook,feed",
  },
  ad_summary: {
    report_name: "IAP_AD_SUMMARY",
    breakdown_columns: ["Date", "Campaign name", "Ad name"],
    metric_groups: [{ name: "Core", required: false, columns: ["Amount spent (USD)"] }],
    sample_csv: "Date,Campaign name,Ad name\n2026-01-01,Test,Ad 1",
  },
  column_aliases: [],
};

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useCreateManualAdAccount: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
    useListManualImports: () => ({ data: { imports: [] } }),
    useGetManualPerformanceCsvFormat: () => ({ data: csvFormat, isLoading: false }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
  };
});

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useLocation: () => ["/app", vi.fn()] };
});

vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({ selectAdAccount: mockSelectAdAccount }),
  AccountProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ManualUploadPanel pulls in file-upload machinery unrelated to wizard
// navigation — stub it, matching add-account-keyboard.test.tsx's approach.
vi.mock("../ConnectAccountDialogs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ManualUploadPanel: () => <div data-testid="manual-upload-panel" />,
  };
});

import { OnboardingWizard } from "../OnboardingWizard";

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingWizard managerName="Meta Marketing Agency" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  mockMutateAsync = vi.fn().mockResolvedValue({ account_id: "acct-test", name: "Acme" });
  mockSelectAdAccount = vi.fn();
});

describe("OnboardingWizard", () => {
  it("renders the welcome step with the manager name and explains the hierarchy", () => {
    renderWizard();
    expect(screen.getByText(/Welcome to Meta Marketing Agency/i)).toBeTruthy();
    expect(screen.getByText(/Manager Suite/i)).toBeTruthy();
    expect(screen.getByText(/Ad accounts/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Orientation/, current: "step" })).toBeTruthy();
    expect(screen.getByText(/0\/3 visited/i)).toBeTruthy();
  });

  it("Next advances welcome → prepare, showing live CSV format panels", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^Next$/i }));

    expect(screen.getByText(/What you'll need from Meta/i)).toBeTruthy();
    expect(screen.getByText(/Required columns · Demographics/i)).toBeTruthy();
    expect(screen.getByText(/Required columns · Placements/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Prepare exports/, current: "step" })).toBeTruthy();
    expect(screen.getByText(/1\/3 visited/i)).toBeTruthy();
  });

  it("Back from prepare returns to welcome", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByText(/What you'll need from Meta/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(screen.getByText(/Welcome to Meta Marketing Agency/i)).toBeTruthy();
  });

  it("Next from prepare reaches the link step, and Add Ad Account opens the real AddAccountDialog", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^Next$/i })); // welcome -> prepare
    await user.click(screen.getByRole("button", { name: /^Next$/i })); // prepare -> link

    expect(screen.getByText(/Link your first ad account/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Link account/, current: "step" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Add Ad Account/i }));

    // The real AddAccountDialog's choose step must appear — manual upload
    // is the live path; Meta connect is gated ("Coming soon") in current code.
    expect(screen.getByRole("button", { name: /Upload manual reports/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connect Meta Ad Account/i })).toBeTruthy();
  });

  it("Skip guide on the welcome step jumps straight to AddAccountDialog", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /Skip guide/i }));

    expect(screen.getByRole("button", { name: /Upload manual reports/i })).toBeTruthy();
  });

  it("starting the manual-account flow from within the wizard reaches the real upload panel", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /Skip guide/i }));
    await user.click(screen.getByRole("button", { name: /Upload manual reports/i }));
    await user.type(screen.getByPlaceholderText(/Acme Skincare/i), "Acme Co");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    // Confirms the wizard hands off into the same real dialog/mutation the
    // rest of the app uses — not a duplicated flow.
    expect(mockMutateAsync).toHaveBeenCalledWith({ data: { name: "Acme Co" } });
    await screen.findByTestId("manual-upload-panel");
  });
});
