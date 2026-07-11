// ─── Report History bulk-delete (multi-select) UI regression test ───────
// Guards the select/confirm/delete flow in ReportHistoryView:
//   - "Select" enters select mode; checkboxes appear only on generated
//     (deletable) reports — seed history rows stay non-selectable
//   - selecting rows enables "Delete selected" and opens the confirmation
//     dialog; confirming POSTs the selected ids to the batch-delete route
//   - on success the list refreshes without the deleted rows, a toast is
//     shown, and select mode exits
// Renders against the checked-in seed fixture with a stubbed fetch, so the
// test exercises the real generated hooks + query invalidation without a
// server.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { GeneratedReport } from "@workspace/api-client-react";

vi.mock("@/contexts/MetrixDataContext", async () => {
  const { seed } = await import("@/navigation/__tests__/seed");
  return {
    useMetrixSeed: () => seed,
    MetrixDataProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { Toaster } from "@/components/ui/toaster";
import { ReportHistoryView } from "../ReportHistoryView";

const WORKSPACE_ID = "metrix_manager";
const LIST_PATH = `/api/metrix/workspaces/${WORKSPACE_ID}/reports`;
const BATCH_DELETE_PATH = `${LIST_PATH}/batch-delete`;
const SESSION_KEY = "metrix_active_account_v1";

// Seed (fixture) history rows for the bookster account — must never be
// selectable/deletable.
const SEED_TITLES = [
  "June Creative Signal Report",
  "June Client Report — Bookster",
  "July Mid-Sprint Read",
];

function makeGeneratedReport(id: number, title: string): GeneratedReport {
  return {
    id,
    ad_account_id: "bookster",
    title,
    mode: "internal",
    branding: "metrix",
    export_format: "pdf",
    section_count: 1,
    range_start: null,
    range_end: null,
    range_source: null,
    summary: `Summary for ${title}`,
    model_json: JSON.stringify({ sections: [{ title: "Overview" }] }),
    generated_at: "2026-07-10T12:00:00.000Z",
  };
}

// Mutable in-memory "server" state consumed by the fetch stub.
let reports: GeneratedReport[] = [];
let batchDeleteBodies: Array<{ report_ids: number[] }> = [];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

beforeEach(() => {
  cleanup();
  reports = [
    makeGeneratedReport(9101, "UI Bulk Delete Test Alpha"),
    makeGeneratedReport(9102, "UI Bulk Delete Test Bravo"),
    makeGeneratedReport(9103, "UI Bulk Delete Test Charlie"),
  ];
  batchDeleteBodies = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveUrl(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.endsWith(BATCH_DELETE_PATH)) {
        const body = JSON.parse(String(init?.body)) as { report_ids: number[] };
        batchDeleteBodies.push(body);
        const deleted = reports
          .filter((r) => body.report_ids.includes(r.id))
          .map((r) => r.id);
        reports = reports.filter((r) => !deleted.includes(r.id));
        return jsonResponse({
          status: "deleted",
          deleted_count: deleted.length,
          deleted_ids: deleted,
        });
      }
      if (method === "GET" && url.endsWith(LIST_PATH)) {
        return jsonResponse({ reports });
      }
      throw new Error(`Unexpected fetch in test: ${method} ${url}`);
    }),
  );

  // Scope the app to the Bookster ad account, like a user who picked it.
  sessionStorage.clear();
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" }),
  );
  window.history.replaceState({}, "", "/app/reports/history");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView() {
  const location = memoryLocation({ path: "/app/reports/history" });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WouterRouter hook={location.hook}>
        <AccountProvider>
          <DateRangeProvider>
            <ReportHistoryView />
            <Toaster />
          </DateRangeProvider>
        </AccountProvider>
      </WouterRouter>
    </QueryClientProvider>,
  );
}

describe("Report History bulk delete (select mode)", () => {
  it("selects multiple generated reports, confirms, deletes them, and leaves seed rows untouched", async () => {
    renderView();

    // Generated reports load from the (stubbed) API.
    await waitFor(() => {
      expect(screen.getByText("UI Bulk Delete Test Alpha")).not.toBeNull();
    });
    expect(screen.getByText("UI Bulk Delete Test Bravo")).not.toBeNull();
    expect(screen.getByText("UI Bulk Delete Test Charlie")).not.toBeNull();
    for (const title of SEED_TITLES) {
      expect(screen.getByText(title)).not.toBeNull();
    }

    // Enter select mode.
    fireEvent.click(screen.getByRole("button", { name: /^Select$/ }));

    // Checkboxes exist ONLY for the generated (deletable) reports.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(3);
    for (const title of [
      "UI Bulk Delete Test Alpha",
      "UI Bulk Delete Test Bravo",
      "UI Bulk Delete Test Charlie",
    ]) {
      expect(
        screen.getByRole("checkbox", { name: `Select report "${title}"` }),
      ).not.toBeNull();
    }
    for (const title of SEED_TITLES) {
      expect(
        screen.queryByRole("checkbox", { name: `Select report "${title}"` }),
      ).toBeNull();
    }

    // Nothing selected yet → delete button disabled.
    const deleteSelected = screen.getByRole("button", {
      name: /Delete selected/,
    }) as HTMLButtonElement;
    expect(deleteSelected.disabled).toBe(true);

    // Select Alpha and Bravo.
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: 'Select report "UI Bulk Delete Test Alpha"',
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: 'Select report "UI Bulk Delete Test Bravo"',
      }),
    );
    expect(screen.getByText("2 selected")).not.toBeNull();
    expect(deleteSelected.disabled).toBe(false);

    // Open the confirmation dialog.
    fireEvent.click(deleteSelected);
    await waitFor(() => {
      expect(screen.getByText("Delete 2 reports?")).not.toBeNull();
    });

    // Confirm — the batch-delete request must carry exactly the two ids.
    fireEvent.click(screen.getByRole("button", { name: /Delete 2 reports/ }));
    await waitFor(() => {
      expect(batchDeleteBodies.length).toBe(1);
    });
    expect([...batchDeleteBodies[0].report_ids].sort()).toEqual([9101, 9102]);

    // List refreshes: deleted rows gone, survivor + seed rows remain.
    await waitFor(() => {
      expect(screen.queryByText("UI Bulk Delete Test Alpha")).toBeNull();
    });
    expect(screen.queryByText("UI Bulk Delete Test Bravo")).toBeNull();
    expect(screen.getByText("UI Bulk Delete Test Charlie")).not.toBeNull();
    for (const title of SEED_TITLES) {
      expect(screen.getByText(title)).not.toBeNull();
    }

    // Success toast announces the deletion.
    await waitFor(() => {
      expect(screen.getByText("Reports deleted")).not.toBeNull();
    });
    expect(
      screen.getByText("2 reports were removed from Report History."),
    ).not.toBeNull();

    // Select mode exited: "Select" button is back, no checkboxes remain.
    expect(screen.getByRole("button", { name: /^Select$/ })).not.toBeNull();
    expect(screen.queryAllByRole("checkbox").length).toBe(0);
  });

  it("cancel in the confirmation dialog deletes nothing and keeps the selection", async () => {
    renderView();

    await waitFor(() => {
      expect(screen.getByText("UI Bulk Delete Test Alpha")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Select$/ }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: 'Select report "UI Bulk Delete Test Alpha"',
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    await waitFor(() => {
      expect(screen.getByText("Delete 1 report?")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    await waitFor(() => {
      expect(screen.queryByText("Delete 1 report?")).toBeNull();
    });

    // No request was sent, the report is still listed and still selected.
    expect(batchDeleteBodies.length).toBe(0);
    expect(screen.getByText("UI Bulk Delete Test Alpha")).not.toBeNull();
    expect(screen.getByText("1 selected")).not.toBeNull();
  });
});