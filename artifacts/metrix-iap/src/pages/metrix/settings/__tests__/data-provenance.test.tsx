// ─── Settings · Data provenance — rendering tests ─────────────────────
// The page's whole value is that a reader can check a claim against the
// seed. So every test here asks "would this still pass if the page showed
// a plausible-looking substitute instead of the seed's own words?"

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MetrixSeed } from "@/lib/data/seedTypes";

const fixture: MetrixSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

// One mutable holder so a test can swap the seed without re-mocking.
let activeSeed: MetrixSeed = fixture;

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvenanceView } from "../DataProvenanceView";

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DataProvenanceView />
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  activeSeed = fixture;
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("assembly statement", () => {
  it("prints the seed's integrity note verbatim, not a summary of it", () => {
    // Verbatim is the requirement. A paraphrase on a provenance page is
    // the app asserting something the seed did not say.
    const { container } = renderView();
    expect(container.textContent).toContain(fixture.integrity_note);
  });

  it("shows the schema version and generated date the seed carries", () => {
    const { container } = renderView();
    expect(container.textContent).toContain(fixture.schema_version);
    // The stamp is rendered as a date ("Aug 15, 2026"), never the raw ISO
    // string (audit round 7); a bare date stays a date, no time appended.
    expect(fixture.generated_at).toBe("2026-08-15");
    expect(container.textContent).toContain("Aug 15, 2026");
    expect(container.textContent).not.toContain("2026-08-15");
  });

  it("says outright when the seed carries no assembly statement", () => {
    activeSeed = { ...fixture, integrity_note: "" };
    const { container } = renderView();
    // Must NOT quietly render an empty paragraph that reads as "fine".
    expect(container.textContent).toMatch(/no assembly statement/i);
    expect(container.textContent).not.toContain(fixture.integrity_note);
  });
});

describe("variable registry backing", () => {
  it("names every unbacked family and its confirmed-gap note", () => {
    // ST_, AW_ and CTA_ render as chips across creative and strategy
    // surfaces with nothing marking them unbacked. This is the only place
    // in the app that says so.
    const { container } = renderView();
    const unbacked = (fixture.variable_registry ?? []).filter((r) => r.status !== "active");
    expect(unbacked.length).toBeGreaterThan(0);
    for (const r of unbacked) {
      expect(container.textContent).toContain(`${r.prefix}_`);
      if (r.note) expect(container.textContent).toContain(r.note);
    }
  });

  it("counts the gap in the section description", () => {
    const { container } = renderView();
    const total = (fixture.variable_registry ?? []).length;
    const unbacked = (fixture.variable_registry ?? []).filter((r) => r.status !== "active").length;
    // Both terms of the fraction, so "3 gaps" cannot be read without
    // knowing it is 3 out of 9.
    expect(container.textContent).toContain(`${unbacked} of ${total}`);
  });

  it("orders EVERY unbacked family ahead of every backed one", () => {
    // First-unbacked-before-first-backed is not enough. The fixture's
    // alphabetical order already starts with AW_ (unbacked), so that weaker
    // assertion passes against a plain alphabetical sort — it proved
    // nothing. This asserts the whole partition: no backed family may
    // appear before any unbacked one.
    renderView();
    const items = screen.getAllByRole("listitem");
    const flags = items
      .map((li) =>
        within(li).queryByText(/Unbacked variable family/i)
          ? "unbacked"
          : within(li).queryByText(/^Backed variable family$/i)
            ? "backed"
            : null,
      )
      .filter((f): f is "unbacked" | "backed" => f !== null);
    expect(flags).toContain("unbacked");
    expect(flags).toContain("backed");
    const lastUnbacked = flags.lastIndexOf("unbacked");
    const firstBacked = flags.indexOf("backed");
    expect(lastUnbacked).toBeLessThan(firstBacked);
  });
});

describe("per-account source chain", () => {
  it("names the source file behind each completed loop stage", () => {
    const { container } = renderView();
    const files = (fixture.ad_accounts ?? [])
      .flatMap((a) => a.iap?.loop_status ?? [])
      .map((s) => s.source_file)
      .filter((f): f is string => typeof f === "string" && f.length > 0);
    expect(files.length).toBeGreaterThan(0);
    for (const f of new Set(files)) expect(container.textContent).toContain(f);
  });

  it("labels a stage with no recorded source file rather than dashing it", () => {
    // A bare em dash on a provenance page is unreadable: it could mean
    // "no file" or "we didn't record one". Only one of those is a gap.
    activeSeed = {
      ...fixture,
      ad_accounts: [
        {
          ...fixture.ad_accounts[0]!,
          iap: {
            ...fixture.ad_accounts[0]!.iap!,
            loop_status: [{ stage: "creative_scan", status: "pending", source_file: null }],
          },
        },
      ],
    };
    const { container } = renderView();
    expect(container.textContent).toMatch(/no source file recorded/i);
  });

  it("surfaces the run facts from the untyped metadata record", () => {
    const { container } = renderView();
    const meta = (fixture.ad_accounts ?? []).find((a) => a.iap?.metadata)?.iap?.metadata as
      | Record<string, unknown>
      | undefined;
    expect(meta).toBeTruthy();
    // The dotted path proves the record was traversed rather than
    // pick-listed (a pick-list would only ever show keys it was told about).
    // The face reads the path as words; the record key itself stays on the
    // label's title attribute for the reader who wants the JSON path.
    expect(container.textContent).toContain("loop run · ");
    const raw = Array.from(container.querySelectorAll("[title]")).map((el) => el.getAttribute("title") ?? "");
    expect(raw.some((t) => t.startsWith("loop_run."))).toBe(true);
  });
});

describe("empty workspace", () => {
  it("renders an honest pending state instead of empty cards", () => {
    activeSeed = { ...fixture, integrity_note: "", variable_registry: [], ad_accounts: [] };
    const { container } = renderView();
    expect(container.textContent).toMatch(/No provenance recorded/i);
  });
});
