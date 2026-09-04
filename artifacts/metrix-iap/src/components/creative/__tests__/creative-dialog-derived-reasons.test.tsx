// ─── Creative popup derives its own empty reasons (BUG-29) ─────────────
//
// §1.4 of the Phase-1 honesty work gave each creative tab a cause-specific
// empty state. It was threaded through call sites by hand and reached 3 of
// 10 <CreativeCard> sites; no site passed a funnel reason at all, so most
// popups still told users to import a file they had already imported.
//
// The fix moved the derivation INTO CreativeExpandDialog, so a call site
// cannot forget what it never has to pass. These tests render the dialog
// with NO *EmptyReason props — exactly how the seven unfixed call sites
// render it — and assert a specific, cause-correct reason still appears.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

let ACTIVE_ACCOUNT = "bookster";
vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/contexts/AccountContext", () => ({
  useScopedAdAccountId: () => ACTIVE_ACCOUNT,
  useAccount: () => ({ selectedAccountType: "ad_account", activeAdAccountId: ACTIVE_ACCOUNT }),
}));

import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { CreativeExpandDialog } from "../CreativeExpandDialog";
import type { CreativeCardData } from "../CreativeCard";

function card(conceptCode: string): CreativeCardData {
  return { conceptCode, title: `Creative ${conceptCode}`, tags: [] };
}

// Render exactly as an unfixed call site would: no reason props at all.
function open(conceptCode: string) {
  // App.tsx mounts the whole tree inside a TooltipProvider; the dialog's
  // tooltips need that context here too.
  return render(
    <TooltipProvider>
      <CreativeExpandDialog open onOpenChange={() => {}} data={card(conceptCode)} />
    </TooltipProvider>
  );
}

function clickTab(label: string) {
  const tab = screen.getAllByText(label).find((el) => el.closest("button"));
  if (tab) fireEvent.click(tab.closest("button")!);
}

beforeEach(() => {
  cleanup();
  ACTIVE_ACCOUNT = "bookster";
});

describe("CreativeExpandDialog · derived empty reasons", () => {
  it("says rows did not JOIN (not 'import a file') for a cell absent from an imported export", () => {
    // bookster HAS demographic rows, just none for this cell code.
    open("C9Z");
    clickTab("Demographics");
    expect(document.body.textContent).toContain("no rows that join to this creative");
    // The misleading original copy must not appear when a file WAS imported.
    expect(document.body.textContent).not.toContain(
      "Import a demographic pivot export to see the age × gender breakdown."
    );
  });

  it("says the export was never imported when the account genuinely has none", () => {
    ACTIVE_ACCOUNT = "ecas"; // fixture: 0 placement rows
    open("C9Z");
    clickTab("Placements");
    expect(document.body.textContent).toContain("No device × placement export has been imported");
  });

  it("supplies a funnel reason, which no call site ever passed", () => {
    open("C9Z");
    clickTab("Funnel");
    const txt = document.body.textContent ?? "";
    const derived =
      txt.includes("mapped ad names") || txt.includes("creative-to-ad mapping");
    expect(derived).toBe(true);
  });

  it("still lets an explicit prop win over the derivation", () => {
    render(
      <TooltipProvider>
        <CreativeExpandDialog
          open
          onOpenChange={() => {}}
          data={card("C9Z")}
          demographicEmptyReason="EXPLICIT OVERRIDE"
        />
      </TooltipProvider>
    );
    clickTab("Demographics");
    expect(document.body.textContent).toContain("EXPLICIT OVERRIDE");
  });
});
