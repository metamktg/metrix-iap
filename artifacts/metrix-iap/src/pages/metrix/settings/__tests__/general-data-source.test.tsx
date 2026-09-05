// ─── Settings · General names the account's source, not the platform ─────
// A manual account read "Meta ad account · Meta Ads · connected" with a
// check, carried a read-only "Objectives" module describing it by its
// derived objective (which the owner decision of 2026-09-01 says the
// objective is not for), and the System card said "SAMPLE / DEMO DATA" on
// a real client's data (audit round 5, 2026-09-05).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../test-fixtures/metrix_seed_bundle.json"), "utf-8"),
);
const MANUAL_ID = "manual_9JGXU_AQJjxJ";
const manual = (seed.ad_accounts as Record<string, any>[]).find((a) => a.id === MANUAL_ID)!;
const bookster = (seed.ad_accounts as Record<string, any>[]).find((a) => a.id === "bookster")!;

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { GeneralView } from "../GeneralView";

function renderFor(adAccountId: string) {
  sessionStorage.setItem("metrix_active_account_v1", JSON.stringify({ type: "ad_account", adAccountId }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AccountProvider>
          <GeneralView />
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/app/settings/general");
});

describe("Settings · General · data source", () => {
  it("the fixture's premises hold", () => {
    expect(manual.source_status).toBe("manual_reports");
    expect(manual.status).toBe("configured");
    expect(bookster.source_status).toMatch(/^imported_/);
  });

  it("names a manual account's source and never calls it connected", () => {
    const { container } = renderFor(MANUAL_ID);
    expect(screen.getByTestId("data-source-label").textContent).toBe("Manual reports");
    expect(container.textContent).toContain("Meta Ads · analysis data on file");
    expect(container.textContent).not.toMatch(/Meta Ads · connected/);
    expect(container.textContent).not.toContain("manual_reports");
  });

  it("names an imported account's source", () => {
    renderFor("bookster");
    expect(screen.getByTestId("data-source-label").textContent).toBe("Imported package");
  });

  it("carries no Objectives module: the objective is an analysis lens, not a description of the account", () => {
    const { container } = renderFor(MANUAL_ID);
    expect(screen.queryByText("Objectives")).toBeNull();
    expect(container.textContent).not.toContain("Determined from your data");
    expect(container.textContent).not.toContain("Terminal metric");
  });

  it("the System card names the seed and its assembly, not a static demo-data label", () => {
    const { container } = renderFor(MANUAL_ID);
    expect(screen.getByTestId("system-data-source").textContent).toContain(`Supabase seed ${seed.schema_version}`);
    expect(screen.getByTestId("system-data-source").textContent).toContain("assembled Aug 15, 2026");
    expect(container.textContent).not.toContain("SAMPLE / DEMO DATA");
    expect(screen.getByRole("button", { name: "About this data" })).toBeTruthy();
  });
});
