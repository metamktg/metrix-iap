// ─── strategyShared.tsx export smoke-test ─────────────────────────────
//
// Guards against two failure modes:
//   1. A deleted export — caught by the export-set equality check with a
//      clear list of which names are missing or unexpectedly added.
//   2. A null-returning stub accidentally introduced during a refactor,
//      e.g. `export function VariableChip() { return null; }` — caught by:
//        a) calling utility functions with minimal args and asserting the
//           return value is not null/undefined, and
//        b) rendering display components with RTL and asserting the
//           output container is not empty.
//
// Type-only exports (HierarchyRef, MessagePillar, ICPProfile, etc.) are
// erased at compile time and are intentionally absent from this list.
//
// Non-exported local helpers (ChipOverflow, HypothesisCodeChips,
// RefChips) are not guarded here — they are internal implementation
// details and cannot be accidentally deleted without breaking the
// components that use them (which are covered below).
//
// Components that legitimately return null for certain prop combinations
// (VariableStackChips with empty stack, IcpChips with empty ids,
// HypothesisCodeChipsRow without variable codes, PillarDetailSections
// with no fillable fields, ScalingPlaybookLanes with no lane data) are
// rendered with props that produce visible output so a null-returning
// stub is still caught.

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import * as strategyShared from "../strategy/strategyShared";
import type { MessagePillar, VariableCombination, ScalingPlaybook } from "@/lib/data/seedTypes";

afterEach(cleanup);

// ─── 1. Export-set equality ───────────────────────────────────────────
// Fails loudly if a name is added or removed without updating this list.

const RUNTIME_EXPORTS: Array<keyof typeof strategyShared> = [
  "familyLabel",
  "VariableChip",
  "VariableStackChips",
  "CombinationChips",
  "icpName",
  "IcpChips",
  "NormalizedRefItem",
  "HypothesisLabel",
  "HypothesisCodeChipsRow",
  "pillarHasDetails",
  "PillarDetailSections",
  "PillarDetailsFold",
  "HYP_STATUS_STYLE",
  "HYP_STATUS_LABEL",
  "HypothesisStatusBadge",
  "VariableCombinationsGrid",
  "playbookHasContent",
  "ScalingPlaybookLanes",
];

describe("strategyShared.tsx exports — set equality", () => {
  it("exports the expected set of runtime names (no missing, no extras)", () => {
    const actual = Object.keys(strategyShared);
    const missing = RUNTIME_EXPORTS.filter((name) => !actual.includes(name));
    const extras = actual.filter(
      (name) => !RUNTIME_EXPORTS.includes(name as keyof typeof strategyShared),
    );
    expect(missing, `Missing exports: ${missing.join(", ")}`).toHaveLength(0);
    expect(
      extras,
      `Unexpected new exports (add them to RUNTIME_EXPORTS): ${extras.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ─── 2. Binding checks ────────────────────────────────────────────────
// Guards every export against being set to null or undefined.

describe("strategyShared.tsx exports — binding checks", () => {
  it.each(RUNTIME_EXPORTS)("%s is defined and non-null", (name) => {
    expect(strategyShared[name]).toBeDefined();
    expect(strategyShared[name]).not.toBeNull();
  });
});

// ─── 3. Utility function return-value checks ─────────────────────────
// Calls each utility function with minimal args and asserts the return
// is not null/undefined. Catches stubs like `export function familyLabel() { return null; }`.

describe("strategyShared.tsx utility functions — return-value checks", () => {
  it("familyLabel returns a non-null string for a known family", () => {
    const result = strategyShared.familyLabel("hook");
    expect(result).not.toBeNull();
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("familyLabel returns a non-null string for an unknown family", () => {
    const result = strategyShared.familyLabel("custom_family");
    expect(result).not.toBeNull();
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
  });

  it("icpName returns a non-null string when profiles is undefined", () => {
    const result = strategyShared.icpName(undefined, "ICP_high_intent");
    expect(result).not.toBeNull();
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
  });

  it("icpName returns the matched profile name when profiles array is provided", () => {
    const profiles = [{ profile_id: "ICP_01", profile_name: "High Intent Buyer" }];
    const result = strategyShared.icpName(profiles, "ICP_01");
    expect(result).toBe("High Intent Buyer");
  });

  it("pillarHasDetails returns false for a bare pillar", () => {
    const bare: MessagePillar = {
      id: "p1",
      label: "Test",
      source_cells: [],
      plain_descriptor: "desc",
      why_it_matters: "why",
      variable_stack: {},
    };
    expect(strategyShared.pillarHasDetails(bare)).toBe(false);
  });

  it("pillarHasDetails returns true when a pillar has funnel_application", () => {
    const rich: MessagePillar = {
      id: "p1",
      label: "Test",
      source_cells: [],
      plain_descriptor: "desc",
      why_it_matters: "why",
      variable_stack: {},
      funnel_application: "Top of funnel awareness play",
    };
    expect(strategyShared.pillarHasDetails(rich)).toBe(true);
  });

  it("pillarHasDetails returns true when a pillar has target_icps", () => {
    const withIcps: MessagePillar = {
      id: "p1",
      label: "Test",
      source_cells: [],
      plain_descriptor: "desc",
      why_it_matters: "why",
      variable_stack: {},
      target_icps: ["ICP_01"],
    };
    expect(strategyShared.pillarHasDetails(withIcps)).toBe(true);
  });

  it("playbookHasContent returns false for null", () => {
    expect(strategyShared.playbookHasContent(null)).toBe(false);
  });

  it("playbookHasContent returns false for an empty playbook", () => {
    expect(strategyShared.playbookHasContent({})).toBe(false);
  });

  it("playbookHasContent returns true when a lane has entries", () => {
    const pb: ScalingPlaybook = { scale_now: ["HK_benefit + TN_conversational"] };
    expect(strategyShared.playbookHasContent(pb)).toBe(true);
  });

  it("HYP_STATUS_STYLE is a non-empty object", () => {
    expect(Object.keys(strategyShared.HYP_STATUS_STYLE).length).toBeGreaterThan(0);
  });

  it("HYP_STATUS_LABEL is a non-empty object", () => {
    expect(Object.keys(strategyShared.HYP_STATUS_LABEL).length).toBeGreaterThan(0);
  });
});

// ─── 4. Component render checks — pure (no context needed) ───────────
// Renders each component with minimal props and asserts the container
// produced DOM output. Catches null-returning stubs for display components.

describe("strategyShared.tsx display components — render checks", () => {
  it("VariableChip renders non-empty output", () => {
    const { container } = render(<strategyShared.VariableChip code="HK_benefit" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("VariableStackChips renders non-empty output for a non-empty stack", () => {
    const { container } = render(
      <strategyShared.VariableStackChips stack={{ hook: "HK_benefit", tone: "TN_conversational" }} />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("CombinationChips renders non-empty output", () => {
    const { container } = render(
      <strategyShared.CombinationChips combination="HK_benefit + TN_conversational" />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("IcpChips renders non-empty output for a non-empty ids array", () => {
    const { container } = render(<strategyShared.IcpChips ids={["ICP_01", "ICP_02"]} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("NormalizedRefItem renders non-empty output for a short plain string", () => {
    const { container } = render(
      <strategyShared.NormalizedRefItem text="Short text" eyebrow="Finding" />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("NormalizedRefItem renders non-empty output for a hierarchy ref string", () => {
    const { container } = render(
      <strategyShared.NormalizedRefItem text="BOOK0 Concept C2 (esp. Row B)" eyebrow="Reference" />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("HypothesisLabel renders non-empty output for a label without codes", () => {
    const { container } = render(
      <strategyShared.HypothesisLabel label="Running benefit hooks in conversational tone outperforms direct-response variants." />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("HypothesisLabel renders non-empty output for a label with variable codes", () => {
    const { container } = render(
      <strategyShared.HypothesisLabel label="HK_benefit combined with TN_conversational drives lower CPA." />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("HypothesisCodeChipsRow renders non-empty output when codes are present", () => {
    const { container } = render(
      <strategyShared.HypothesisCodeChipsRow label="HK_benefit combined with TN_conversational drives lower CPA." />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("HypothesisStatusBadge renders non-empty output for a known status", () => {
    const { container } = render(<strategyShared.HypothesisStatusBadge status="high" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("HypothesisStatusBadge renders non-empty output for an unknown status", () => {
    const { container } = render(<strategyShared.HypothesisStatusBadge status="unknown_status" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("PillarDetailSections renders non-empty output for a pillar with funnel_application", () => {
    const pillar: MessagePillar = {
      id: "p1",
      label: "Benefit-led hook",
      source_cells: [],
      plain_descriptor: "desc",
      why_it_matters: "why",
      variable_stack: {},
      funnel_application: "Top of funnel awareness campaign targeting cold audiences.",
    };
    const { container } = render(<strategyShared.PillarDetailSections pillar={pillar} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("VariableCombinationsGrid renders non-empty output for a non-empty combinations array", () => {
    const combinations: VariableCombination[] = [
      { combination: "HK_benefit + TN_conversational", cpa: 18.5, cvr_pct: 0.04 },
    ];
    const { container } = render(
      <strategyShared.VariableCombinationsGrid combinations={combinations} />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("ScalingPlaybookLanes renders non-empty output for a playbook with scale_now entries", () => {
    const playbook: ScalingPlaybook = {
      scale_now: ["HK_benefit + TN_conversational — top performing stack"],
      optimize: ["FW_social_proof variants need budget increase"],
    };
    const { container } = render(<strategyShared.ScalingPlaybookLanes playbook={playbook} />);
    expect(container.firstChild).not.toBeNull();
  });
});
