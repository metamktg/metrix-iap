// ─── shared.tsx export smoke-test ─────────────────────────────────────
//
// Guards against two failure modes:
//   1. A deleted export — caught by the export-set equality check with a
//      clear list of which names are missing or unexpectedly added.
//   2. A null-returning stub accidentally introduced during a refactor,
//      e.g. `export function ScopeBadge() { return null; }` — caught by:
//        a) calling utility functions with minimal args and asserting the
//           return value is not null/undefined, and
//        b) rendering display components with RTL and asserting the
//           output container is not empty.
//
// Type-only exports (interfaces/type aliases: ResultTerm, DetailSection,
// FromParams) are erased at compile time and are intentionally absent.
//
// Hooks (useFromParam, useFocusParam, useStaleFocus) and components that
// legitimately return null in their default render state (BackLink,
// FlowCrumb, RangeScopeBar) are verified by binding checks only — they
// are not stub-prone in a null-returning way.
//
// Complex components requiring full app context (UnconfiguredState,
// ModuleScopeGate) are protected by the export-set check; we skip render
// checks for them to keep this file focused and fast.

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import * as shared from "../shared";

// Minimal mocks for context providers required by complex components.
// NoDataInRangeState → DateRangeProvider → useMetrixSeed + useAccount.
vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => ({ accounts: [], manager: null }),
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({
    selectedAccountType: "manager",
    activeAdAccountId: null,
    adAccounts: [],
    setActiveAdAccountId: () => {},
    setSelectedAccountType: () => {},
  }),
  AccountProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { DateRangeProvider } from "@/contexts/DateRangeContext";

afterEach(cleanup);

// ─── 1. Export-set equality ───────────────────────────────────────────
// Fails loudly if a name is added or removed without updating this list.

const RUNTIME_EXPORTS: Array<keyof typeof shared> = [
  "InfoTooltip",
  "readableVariables",
  "fmtUSD",
  "fmtNum",
  "fmtPct",
  "EVENT_LABEL",
  "eventLabel",
  "resultTerm",
  "ConfidenceBadge",
  "SectionTabBar",
  "ModuleHeader",
  "RangeScopeBar",
  "NoDataInRangeState",
  "CaveatNote",
  "DenseText",
  "ExpandableText",
  "ClampedProse",
  "deriveLabel",
  "DetailReveal",
  "LoopChecklist",
  "UnconfiguredState",
  "PendingState",
  "MetricTile",
  "ModuleTabs",
  "ModuleScopeGate",
  "CrossLink",
  "LoopAction",
  "useFromParam",
  "BackLink",
  "FlowCrumb",
  "useFocusParam",
  "useStaleFocus",
  "StaleFocusNotice",
  "MetricSelectionBar",
  "IMPACT_STYLE",
  "SCOPE_STYLE",
  "ImpactBadge",
  "ScopeBadge",
  "SectionCard",
  "SkeletonBlock",
  "SkeletonTileRow",
];

describe("shared.tsx exports — set equality", () => {
  it("exports the expected set of runtime names (no missing, no extras)", () => {
    const actual = Object.keys(shared);
    const missing = RUNTIME_EXPORTS.filter((name) => !actual.includes(name));
    const extras = actual.filter((name) => !RUNTIME_EXPORTS.includes(name as keyof typeof shared));
    expect(missing, `Missing exports: ${missing.join(", ")}`).toHaveLength(0);
    expect(extras, `Unexpected new exports (add them to RUNTIME_EXPORTS): ${extras.join(", ")}`).toHaveLength(0);
  });
});

// ─── 2. Binding checks ────────────────────────────────────────────────
// Guards every export against being set to null or undefined.

describe("shared.tsx exports — binding checks", () => {
  it.each(RUNTIME_EXPORTS)("%s is defined and non-null", (name) => {
    expect(shared[name]).toBeDefined();
    expect(shared[name]).not.toBeNull();
  });
});

// ─── 3. Utility function return-value checks ─────────────────────────
// Calls each utility function with minimal args and asserts the return
// is not null/undefined. Catches stubs like `export function fmtUSD() { return null; }`.

describe("shared.tsx utility functions — return-value checks", () => {
  it("fmtUSD returns a non-null string", () => {
    expect(shared.fmtUSD(100)).not.toBeNull();
    expect(shared.fmtUSD(100)).toBeDefined();
  });

  it("fmtNum returns a non-null string", () => {
    expect(shared.fmtNum(1000)).not.toBeNull();
    expect(shared.fmtNum(1000)).toBeDefined();
  });

  it("fmtPct returns a non-null string", () => {
    expect(shared.fmtPct(0.5)).not.toBeNull();
    expect(shared.fmtPct(0.5)).toBeDefined();
  });

  it("eventLabel returns a non-null string", () => {
    expect(shared.eventLabel("install")).not.toBeNull();
    expect(shared.eventLabel("install")).toBeDefined();
  });

  it("readableVariables returns a non-null string", () => {
    expect(shared.readableVariables("HK_foo")).not.toBeNull();
    expect(shared.readableVariables("HK_foo")).toBeDefined();
  });

  it("deriveLabel returns a non-null string for a non-empty input", () => {
    const result = shared.deriveLabel("Benefit Hook — drive registration");
    expect(result).not.toBeNull();
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it("resultTerm returns a non-null object with singular/plural fields", () => {
    const term = shared.resultTerm(null);
    expect(term).not.toBeNull();
    expect(term).toBeDefined();
    expect(typeof term.singular).toBe("string");
    expect(typeof term.plural).toBe("string");
    expect(typeof term.Singular).toBe("string");
    expect(typeof term.Plural).toBe("string");
  });

  it("EVENT_LABEL is a non-empty object", () => {
    expect(Object.keys(shared.EVENT_LABEL).length).toBeGreaterThan(0);
  });

  it("IMPACT_STYLE is a non-empty object", () => {
    expect(Object.keys(shared.IMPACT_STYLE).length).toBeGreaterThan(0);
  });

  it("SCOPE_STYLE is a non-empty object", () => {
    expect(Object.keys(shared.SCOPE_STYLE).length).toBeGreaterThan(0);
  });
});

// ─── 4. Component render checks — pure (no context needed) ───────────
// Renders each component with minimal props and asserts the container
// produced DOM output. Catches null-returning stubs for display components.

describe("shared.tsx display components — render checks (no context)", () => {
  it("InfoTooltip renders non-empty output", () => {
    const { container } = render(<shared.InfoTooltip content="Helpful explanation" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("ConfidenceBadge renders non-empty output", () => {
    const { container } = render(<shared.ConfidenceBadge value="high" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("ImpactBadge renders non-empty output", () => {
    const { container } = render(<shared.ImpactBadge impact="high" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("ScopeBadge renders non-empty output", () => {
    const { container } = render(<shared.ScopeBadge scope="campaign" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("MetricTile renders non-empty output", () => {
    const { container } = render(<shared.MetricTile label="CTR" value="3.2%" sub="avg last 30d" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("PendingState renders non-empty output", () => {
    const { container } = render(
      <shared.PendingState title="Analyzing" message="Please wait while we run the analysis." />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("StaleFocusNotice renders non-empty output", () => {
    const { container } = render(<shared.StaleFocusNotice label="concept" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("DenseText renders non-empty output for a short string", () => {
    const { container } = render(<shared.DenseText text="Short text" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("ExpandableText renders non-empty output", () => {
    const { container } = render(<shared.ExpandableText text="Short text" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("ClampedProse renders non-empty output", () => {
    const { container } = render(<shared.ClampedProse text="Short text" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("CaveatNote renders non-empty output", () => {
    const { container } = render(<shared.CaveatNote text="This is a short caveat note." />);
    expect(container.firstChild).not.toBeNull();
  });

  it("ModuleHeader renders non-empty output", () => {
    const { container } = render(
      <shared.ModuleHeader section="Analysis · Overview" title="Analysis" />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("ModuleTabs renders non-empty output", () => {
    const { container } = render(
      <shared.ModuleTabs
        tabs={[{ id: "a", label: "Overview" }, { id: "b", label: "Detail" }]}
        active="a"
        onChange={() => {}}
      />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("SectionCard renders non-empty output", () => {
    const { container } = render(
      <shared.SectionCard title="Performance">
        <span>content</span>
      </shared.SectionCard>
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("MetricSelectionBar renders non-empty output", () => {
    const { container } = render(
      <shared.MetricSelectionBar
        events={["install", "purchase"]}
        isSelected={(e) => e === "install"}
        onToggle={() => {}}
      />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("DetailReveal renders non-empty output", () => {
    const { container } = render(
      <shared.DetailReveal
        label="Show detail"
        sections={[{ label: "Summary", text: "Full prose goes here." }]}
      />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("CrossLink renders non-empty output", () => {
    const { container } = render(<shared.CrossLink to="/app/strategy/map" label="Go to Strategy" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("LoopAction renders non-empty output", () => {
    const { container } = render(<shared.LoopAction to="/app/strategy/map" label="View Strategy" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("SectionTabBar renders non-empty output", () => {
    const { container } = render(<shared.SectionTabBar section="analysis" />);
    expect(container.firstChild).not.toBeNull();
  });
});

// ─── 5. Component render checks — needs DateRangeProvider ────────────

describe("shared.tsx display components — render checks (DateRangeProvider)", () => {
  it("NoDataInRangeState renders non-empty output", () => {
    const { container } = render(
      <DateRangeProvider>
        <shared.NoDataInRangeState what="signals" detail="Try a wider date range." />
      </DateRangeProvider>
    );
    expect(container.firstChild).not.toBeNull();
  });
});
