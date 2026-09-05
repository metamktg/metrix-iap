// ─── A creative with no performance row reads a dash, never $0 ───────────
// The IAP Library's "Creative assets · no performance data yet" cards read
// SPEND $0 · 0 results (audit round 5): the stats builder returned zeros
// for a cell with no row. Null is the honest value and the card renders it
// as the en dash every other null on the platform uses.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"), "utf-8"),
);

// The card mounts its expand dialog, which reads the seed for its empty reasons.
vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { CreativeCard } from "../CreativeCard";

function renderCard(stats: { spend: number | null; results: number | null; unmeasuredReason?: string }) {
  sessionStorage.setItem("metrix_active_account_v1", JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AccountProvider>
          <TooltipProvider>
            <CreativeCard
              data={{ conceptCode: "C9Z", title: "Creative", tags: [], stats: { ...stats, cpa: null, ctrPct: null, resultLabel: "Purchases" } }}
              unmapped={false}
              demographic={[]}
              placements={[]}
            />
          </TooltipProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("CreativeCard · null stats", () => {
  it("renders a dash for null spend and results, and $0 only for a measured zero", () => {
    const { container } = renderCard({ spend: null, results: null });
    expect(screen.getAllByText("–").length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain("$0");
  });

  it("a dash carries its reason as the dotted-underline title, the way KpiStat does (check:unexplained-dashes)", () => {
    const reason = "no performance row for this creative in the selection";
    const { container } = renderCard({ spend: null, results: null, unmeasuredReason: reason });
    const dashes = Array.from(container.querySelectorAll("[data-unavailable-reason]"));
    expect(dashes.length).toBe(2);
    expect(dashes[0]!.getAttribute("title")).toBe(`Spend: ${reason}`);
    expect(dashes[1]!.getAttribute("title")).toBe(`Purchases: ${reason}`);
    expect(dashes[0]!.className).toContain("border-dotted");
  });

  it("still renders a measured zero as $0 and 0", () => {
    const { container } = renderCard({ spend: 0, results: 0 });
    expect(container.textContent).toContain("$0");
  });
});
