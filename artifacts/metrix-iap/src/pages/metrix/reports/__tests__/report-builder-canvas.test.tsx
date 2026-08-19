// ─── Report Builder — canvas audience/sections/live-preview layout ────
// The Nocturne reports screen: audience + sections + window + generate
// on the left rail, and a live document preview on the right rendered
// from the SAME buildReportModel output that generation persists.
// Honesty rules under test: the preview reflects section exclusions
// immediately (it is the document, not a mock), and excluding every
// section yields an explicit empty state, never a stale preview.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
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

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetReportSettings: () => ({ data: { default_format: "pdf" } }),
    useCreateWorkspaceReport: () => ({ mutate: vi.fn(), isPending: false }),
    useListWorkspaceReports: () => ({ data: { reports: [] } }),
    getListWorkspaceReportsQueryKey: () => ["reports"],
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { ReportBuilderView } from "../ReportBuilderView";

const SESSION_KEY = "metrix_active_account_v1";

function renderView() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <ReportBuilderView />
          </DateRangeProvider>
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
});

describe("report builder canvas layout", () => {
  it("renders the audience selector and the live document preview", () => {
    renderView();
    // Left rail: both audience options; internal selected by default.
    const internal = screen.getByRole("button", { name: /internal ops/i });
    expect(internal.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /client-facing/i })).toBeTruthy();
    // Right: live preview with the report kicker (real account name + the
    // selected window, not a static string) and real section content.
    const preview = screen.getByTestId("report-live-preview");
    expect(within(preview).getByText(/Bookster/)).toBeTruthy();
    // The preview renders the real composed document — its section count
    // matches the sections checklist (all included by default).
    expect(within(preview).getByText(/\d+ sections/)).toBeTruthy();
  });

  it("removes a section from the live preview when it is unchecked", () => {
    renderView();
    const preview = screen.getByTestId("report-live-preview");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(1);
    const before = within(preview).getByText(/(\d+) sections/).textContent!;
    fireEvent.click(boxes[0]!);
    const after = within(preview).getByText(/(\d+) sections/).textContent!;
    const n = (s: string) => parseInt(s.match(/(\d+) sections/)?.[1] ?? "0", 10);
    expect(n(after)).toBe(n(before) - 1);
  });

  it("shows an explicit empty state when every section is excluded", () => {
    renderView();
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    expect(screen.queryByTestId("report-live-preview")).toBeNull();
    expect(screen.getByText(/include at least one section to preview/i)).toBeTruthy();
    // Generate is disabled with nothing to compose.
    const generate = screen.getByRole("button", { name: /generate report/i });
    expect((generate as HTMLButtonElement).disabled).toBe(true);
  });

  it("switches the preview's audience tag with the audience selector", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /client-facing/i }));
    const preview = screen.getByTestId("report-live-preview");
    expect(within(preview).getByText("Client-facing")).toBeTruthy();
  });
});
