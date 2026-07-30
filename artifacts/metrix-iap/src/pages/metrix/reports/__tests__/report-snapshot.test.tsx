// ─── Report snapshot regression tests ─────────────────────────────────
// Generated reports are persisted as a serialized ReportModel snapshot
// (model_json) and re-downloaded from that snapshot — never re-composed
// from current seed data. These tests pin down both halves of that flow:
//   - ReportBuilderView's Generate posts a valid, parseable snapshot
//   - the post-generate download uses the server-returned snapshot
//   - ReportHistoryView downloads stored snapshots verbatim
// Uses the checked-in seed fixture served by the API in production.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

// Replace only the download side effect; keep the real (de)serializers and
// model builder so the snapshot content under test is the real thing.
vi.mock("@/lib/reportExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportExport")>();
  return { ...actual, downloadReportExport: vi.fn().mockResolvedValue(undefined) };
});

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mutateMock = vi.fn();
let createReportOptions: {
  mutation?: { onSuccess?: (result: unknown) => Promise<void> | void };
} | null = null;
let listedReports: Record<string, unknown>[] = [];

// Stub only the report hooks; everything else (auth, waitlist, …) stays real.
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetReportSettings: () => ({ data: { default_format: "html" } }),
    useCreateWorkspaceReport: (opts?: typeof createReportOptions) => {
      createReportOptions = opts ?? null;
      return { mutate: mutateMock, isPending: false };
    },
    useListWorkspaceReports: () => ({ data: { reports: listedReports } }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { ReportBuilderView } from "../ReportBuilderView";
import { ReportHistoryView } from "../ReportHistoryView";
import {
  parseReportModel,
  serializeReportModel,
  downloadReportExport,
  type ReportModel,
} from "@/lib/reportExport";

const downloadMock = vi.mocked(downloadReportExport);

const SESSION_KEY = "metrix_active_account_v1";

function selectBookster() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

function renderView(View: React.ComponentType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <View />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** A snapshot with content buildReportModel could never compose from the
 *  current seed — if a download shows this content, it came from the
 *  stored snapshot, not from re-composition. */
function makeArchivedModel(): ReportModel {
  return {
    docTitle: "Archived Report — Legacy Shape",
    brandName: "Metrix IAP",
    brandLine: "Internal dashboard mode · full Metrix branding",
    accountName: "Bookster",
    platform: "Meta Ads",
    mode: "internal",
    generatedAt: new Date("2026-06-15T10:00:00.000Z"),
    windowLabel: "Jun 1 – Jun 14, 2026",
    sections: [
      {
        title: "Legacy Snapshot Section",
        blocks: [{ kind: "text", text: "Frozen at generate time." }],
      },
    ],
    footerNote: "Archived footer note.",
  };
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  mutateMock.mockClear();
  downloadMock.mockClear();
  toastMock.mockClear();
  createReportOptions = null;
  listedReports = [];
});

describe("ReportBuilderView · Generate", () => {
  it("POSTs a snapshot that parses back into a valid ReportModel", () => {
    selectBookster();
    renderView(ReportBuilderView);

    fireEvent.click(screen.getByRole("button", { name: /Generate report/i }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const { workspaceId, data } = mutateMock.mock.calls[0][0] as {
      workspaceId: string;
      data: Record<string, unknown>;
    };
    expect(workspaceId).toBe(seed.manager_account.id);
    expect(data.ad_account_id).toBe("bookster");
    expect(data.export_format).toBe("html");
    expect(typeof data.model_json).toBe("string");

    // The stored snapshot must be a valid, self-contained document.
    const model = parseReportModel(data.model_json as string);
    expect(model).not.toBeNull();
    expect(model!.generatedAt).toBeInstanceOf(Date);
    expect(model!.docTitle).toBe(data.title);
    expect(model!.sections).toHaveLength(data.section_count as number);
    for (const s of model!.sections) expect(s.blocks.length).toBeGreaterThan(0);
    // Snapshot is stable: parse → re-serialize reproduces the stored JSON.
    expect(serializeReportModel(model!)).toBe(data.model_json);
  });

  it("downloads the server-returned snapshot after a successful generate", async () => {
    selectBookster();
    renderView(ReportBuilderView);

    fireEvent.click(screen.getByRole("button", { name: /Generate report/i }));
    const { data } = mutateMock.mock.calls[0][0] as { data: Record<string, unknown> };

    // Simulate the server responding with the persisted report row.
    await createReportOptions!.mutation!.onSuccess!({
      report: {
        id: 1,
        title: data.title,
        export_format: "html",
        model_json: data.model_json,
      },
    });

    expect(downloadMock).toHaveBeenCalledTimes(1);
    const [format, model] = downloadMock.mock.calls[0];
    expect(format).toBe("html");
    expect((model as ReportModel).docTitle).toBe(data.title);
    expect((model as ReportModel).generatedAt).toBeInstanceOf(Date);
  });
});

describe("ReportHistoryView · snapshot downloads", () => {
  it("downloads the stored snapshot verbatim instead of re-composing", async () => {
    const archived = makeArchivedModel();
    listedReports = [
      {
        id: 7,
        ad_account_id: "bookster",
        title: archived.docTitle,
        summary: "1 of 9 sections · archived.",
        generated_at: "2026-06-15T10:00:00.000Z",
        mode: "internal",
        branding: "metrix",
        section_count: 1,
        export_format: "html",
        model_json: serializeReportModel(archived),
      },
    ];
    selectBookster();
    const { container } = renderView(ReportHistoryView);
    expect(container.textContent).toContain("Archived Report — Legacy Shape");

    fireEvent.click(screen.getByRole("button", { name: /Download HTML/i }));

    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    const [format, model] = downloadMock.mock.calls[0] as [string, ReportModel];
    expect(format).toBe("html");
    // Content only the snapshot could contain — proof it wasn't re-composed.
    expect(model.docTitle).toBe("Archived Report — Legacy Shape");
    expect(model.sections.map((s) => s.title)).toEqual(["Legacy Snapshot Section"]);
    expect(model.windowLabel).toBe("Jun 1 – Jun 14, 2026");
    expect(model.generatedAt.getTime()).toBe(new Date("2026-06-15T10:00:00.000Z").getTime());
  });

  it("falls back to re-composing from seed data when no snapshot exists", async () => {
    // Legacy rows without a stored snapshot must still download.
    listedReports = [
      {
        id: 8,
        ad_account_id: "bookster",
        title: "Legacy Report Without Snapshot",
        summary: "Generated before snapshots existed.",
        generated_at: "2026-05-01T00:00:00.000Z",
        mode: "internal",
        branding: "metrix",
        section_count: 3,
        export_format: "pdf",
        model_json: null,
      },
    ];
    selectBookster();
    renderView(ReportHistoryView);

    // Seed-history rows render their own download buttons — scope to this
    // report's card so the query stays unambiguous.
    const card = screen
      .getByText("Legacy Report Without Snapshot")
      .closest("div.flex.items-start") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /Download PDF/i }));

    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    const [format, model] = downloadMock.mock.calls[0] as [string, ReportModel];
    expect(format).toBe("pdf");
    // Re-composed from the live seed — carries current-seed content.
    expect(model.docTitle).toBe("Legacy Report Without Snapshot");
    expect(model.sections).toHaveLength(3);
    expect(model.accountName).toBe("Bookster");
  });

  it("shows an error toast instead of downloading when a stored snapshot is malformed", async () => {
    listedReports = [
      {
        id: 9,
        ad_account_id: "bookster",
        title: "Corrupted Snapshot Report",
        summary: "Snapshot no longer parses.",
        generated_at: "2026-06-20T00:00:00.000Z",
        mode: "internal",
        branding: "metrix",
        section_count: 2,
        export_format: "html",
        model_json: "{definitely not valid json",
      },
    ];
    selectBookster();
    renderView(ReportHistoryView);

    fireEvent.click(screen.getByRole("button", { name: /Download HTML/i }));

    // parseReportModel returns null → download is skipped, user is told why.
    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: expect.stringMatching(/can't be read/i),
      })
    );
    expect(downloadMock).not.toHaveBeenCalled();
  });
});
