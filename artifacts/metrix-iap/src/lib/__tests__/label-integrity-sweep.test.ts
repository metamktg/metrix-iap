// ─── Label integrity sweep ────────────────────────────────────────────
//
// Every string this app puts in front of a user should read as English. The
// `raw_token variables` defect got into the breakdown picker because a
// fallback interpolated an internal identifier straight into a label and
// nothing looked at the result — the value was honest, the wording was not.
//
// That is a class, not an incident, so this drives every label-producing
// function in the data layer over the codes and ids that really occur in the
// fixture and reads the OUTPUT. Source inspection cannot catch it; only
// looking at what comes out can.
//
// Deliberately not flagged: strings that are meant to be identifiers.
// A variable CODE (HK_Problem) is shown as a code, in mono, on purpose —
// what must not happen is a code appearing where a LABEL was promised.

import { describe, expect, it } from "vitest";

import seedBundle from "../../test-fixtures/metrix_seed_bundle.json";
import { resolveVariableLabel, resolveVariableDescription, getVariablePrefix } from "../variable-registry";
import { compactIcpName } from "../normalize";
import { listBreakdownDimensions, buildAccountBreakdown } from "../data/kpiBreakdown";
import { eventLabel, costPerResultLabel } from "@/pages/metrix/shared";
import type { AnalysisData } from "../data/seedTypes";

const accounts = (seedBundle as { ad_accounts?: any[] }).ad_accounts ?? [];

/** Reads as a leaked identifier rather than a label. */
function looksLikeIdentifier(s: string): boolean {
  return (
    /_/.test(s) || // snake_case survived into the label
    /\bundefined\b|\bnull\b|\bNaN\b/i.test(s) ||
    s.trim() === ""
  );
}

/** Reads as mangled text: doubled spaces, or an acronym split letter by letter. */
function looksMangled(s: string): boolean {
  return /\s{2,}/.test(s) || /\b(?:[A-Z]\s){2,}[A-Z]\b/.test(s);
}

/** Every variable code that actually occurs anywhere in the fixture. */
function everyVariableCode(): string[] {
  const codes = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\b(CN|FW|TN|HK|ST|AW|HP|PR|CTA)_[A-Za-z0-9_]+/g)) {
        codes.add(m[0]);
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(seedBundle);
  return [...codes].sort();
}

/** Every result-event key that actually occurs anywhere in the fixture. */
function everyEventKey(): string[] {
  const keys = new Set<string>();
  for (const account of accounts) {
    const totals = account.iap?.campaign_summary?.bottom_line_totals ?? {};
    for (const key of Object.keys(totals)) keys.add(key);
    for (const row of account.iap?.analysis?.performance_by_cell ?? []) {
      if (typeof row?.["Result type"] === "string") keys.add(row["Result type"]);
    }
  }
  return [...keys].sort();
}

describe("label integrity · what the data layer actually renders", () => {
  it("finds real variable codes in the fixture to sweep", () => {
    expect(everyVariableCode().length).toBeGreaterThan(10);
  });

  it("turns every real variable code into a readable label", () => {
    const bad: string[] = [];
    for (const code of everyVariableCode()) {
      const label = resolveVariableLabel(code);
      if (looksLikeIdentifier(label)) {
        bad.push(`${code} → ${JSON.stringify(label)}  (identifier leaked)`);
      } else if (looksMangled(label)) {
        bad.push(`${code} → ${JSON.stringify(label)}  (mangled spacing/acronym)`);
      }
    }
    expect(bad, `Variable labels that do not read as English:\n${bad.join("\n")}`).toEqual([]);
  });

  it("labels every breakdown dimension without leaking an identifier", () => {
    const bad: string[] = [];
    for (const account of accounts) {
      const analysis = account.iap?.analysis as AnalysisData | undefined;
      if (!analysis) continue;
      for (const dim of listBreakdownDimensions(analysis)) {
        if (looksLikeIdentifier(dim.label) || looksMangled(dim.label)) {
          bad.push(`${account.id} · ${dim.id} → ${JSON.stringify(dim.label)}`);
        }
      }
    }
    expect(bad, `Dimension labels:\n${bad.join("\n")}`).toEqual([]);
  });

  it("labels every breakdown ROW without leaking an identifier", () => {
    // The dimension NAMES were already swept; the row labels were not, and
    // that is where Meta's raw tokens surfaced — the KPI drill-down's platform
    // and device breakdowns rendered "audience_network" and
    // "android_smartphone" verbatim. Sweeping the rows is what makes this a
    // class rather than three separate incidents.
    const bad: string[] = [];
    let swept = 0;
    for (const account of accounts) {
      const analysis = account.iap?.analysis as AnalysisData | undefined;
      if (!analysis) continue;
      for (const dim of listBreakdownDimensions(analysis)) {
        for (const row of buildAccountBreakdown(analysis, dim.id, "spend")) {
          swept += 1;
          if (!String(row.label ?? "").trim()) {
            bad.push(`${account.id} · ${dim.id} → empty label`);
          } else if (dim.id.startsWith("var:")) {
            // A variable dimension labels its rows with the registry code
            // itself (HK_Benefit), which is this product's own vocabulary
            // rather than a leaked transport token — variable-registry.ts and
            // VARIABLES_REGISTRY.md define them, and the app shows them as
            // codes on purpose elsewhere. Whether the drill-down should show
            // the code or resolveVariableLabel's wording is a product call,
            // not something this sweep should decide. What it CAN insist on is
            // that the code is a real registry code and not some other token
            // that happens to contain an underscore.
            // Not every family's values are prefixed codes: the concept family
            // carries bare names ("AuthorityProxy") and var:raw_token carries
            // verbatim ad-name tokens ("BELTS", "COMBO"), which is the whole
            // point of that family. So the rule is narrow — an underscore
            // token that is NOT a registry code is a transport value that
            // wandered in, and everything else is this product's vocabulary.
            if (
              dim.id !== "var:raw_token" &&
              /_/.test(row.label) &&
              getVariablePrefix(row.label) === "unknown"
            ) {
              bad.push(`${account.id} · ${dim.id} → ${JSON.stringify(row.label)} (not a registry code)`);
            }
          } else if (/_/.test(row.label)) {
            bad.push(`${account.id} · ${dim.id} → ${JSON.stringify(row.label)} (identifier leaked)`);
          }
        }
      }
    }
    expect(swept, "no breakdown rows were swept. The assertion below proves nothing").toBeGreaterThan(50);
    expect(bad, `Breakdown row labels:\n${bad.slice(0, 25).join("\n")}`).toEqual([]);
  });

  it("compacts every real ICP name into something non-empty and unmangled", () => {
    const names = new Set<string>();
    for (const account of accounts) {
      for (const p of account.iap?.strategy?.icp_profiles ?? []) {
        if (typeof p?.profile_name === "string") names.add(p.profile_name);
      }
    }
    expect(names.size, "fixture carries no ICP names to sweep").toBeGreaterThan(0);

    const bad: string[] = [];
    for (const name of names) {
      const compact = compactIcpName(name);
      if (!compact.trim()) bad.push(`${JSON.stringify(name)} → empty`);
      else if (looksMangled(compact)) bad.push(`${JSON.stringify(name)} → ${JSON.stringify(compact)}`);
    }
    expect(bad, `ICP chip names:\n${bad.join("\n")}`).toEqual([]);
  });

  it("never renders a pillar or hypothesis with an empty display name", () => {
    const bad: string[] = [];
    for (const account of accounts) {
      for (const p of account.iap?.strategy?.message_pillars ?? []) {
        if (!String(p?.label ?? "").trim()) bad.push(`${account.id} pillar ${p?.id} → empty label`);
      }
      for (const h of account.iap?.strategy?.active_hypotheses ?? []) {
        if (!String(h?.label ?? "").trim()) bad.push(`${account.id} hypothesis ${h?.id} → empty label`);
      }
    }
    expect(bad, `Empty display names:\n${bad.join("\n")}`).toEqual([]);
  });

  it("has an authored description for the codes it claims to, and none invented", () => {
    // These were written and then never rendered anywhere. They are now shown
    // in the VariableChip tooltip, so their quality is user-facing.
    const described = everyVariableCode().filter((c) => resolveVariableDescription(c) !== "");
    expect(described.length, "no descriptions resolve · the wiring regressed").toBeGreaterThan(0);

    const bad: string[] = [];
    for (const code of described) {
      const d = resolveVariableDescription(code);
      if (d.trim().length < 20) bad.push(`${code} → ${JSON.stringify(d)} (too short to be useful)`);
      if (looksLikeIdentifier(d)) bad.push(`${code} → ${JSON.stringify(d)} (identifier leaked)`);
    }
    expect(bad, `Descriptions:\n${bad.join("\n")}`).toEqual([]);
  });

  it("finds real result-event keys in the fixture to sweep", () => {
    expect(everyEventKey().length).toBeGreaterThan(3);
  });

  it("turns every real result-event key into a readable label", () => {
    // "unknown" is the analysis engine's marker for an ad/day row that carried
    // no result type in any export. It reached tiles as the literal lowercase
    // token, and "Cost per unknown" was a label a user could read.
    const bad: string[] = [];
    for (const key of everyEventKey()) {
      const label = eventLabel(key);
      if (looksLikeIdentifier(label)) bad.push(`${key} → ${JSON.stringify(label)} (identifier leaked)`);
      else if (looksMangled(label)) bad.push(`${key} → ${JSON.stringify(label)} (mangled)`);
      else if (label !== label.trim() || !/^[A-Z0-9]/.test(label)) {
        bad.push(`${key} → ${JSON.stringify(label)} (not a display label)`);
      }
    }
    expect(bad, `Result-event labels:\n${bad.join("\n")}`).toEqual([]);
  });

  it("never builds a cost label out of a raw event key", () => {
    const bad: string[] = [];
    for (const key of everyEventKey()) {
      const label = costPerResultLabel(key);
      if (/\bunknown\b/i.test(label) || looksLikeIdentifier(label.replace(/^Cost per /, ""))) {
        bad.push(`${key} → ${JSON.stringify(label)}`);
      }
    }
    expect(bad, `Cost-per labels:\n${bad.join("\n")}`).toEqual([]);

    // Mutation-testing this caught the sweep being too loose: with the map
    // entry alone the label falls out as "Cost per unattributed", which is not
    // a finished phrase. The wording is pinned rather than merely screened.
    // main names the marker "Unclassified result type" (with the evidence that
    // it holds 41% of spend on the largest account), which reads better than
    // the "Unattributed" this branch had used — so the wording pinned here is
    // main's, and the special case this branch added is unnecessary.
    expect(costPerResultLabel("unknown")).toBe("Cost per unclassified result type");
  });

  it("humanises an unmapped custom event key instead of printing it raw", () => {
    // Result types come from client exports and custom onb_* events, so a key
    // no map knows about is ordinary. The mapped onb_ siblings drop the
    // namespace prefix, and so does the fallback.
    expect(eventLabel("onb_complete_registration")).toBe("Complete registration");
    expect(eventLabel("Website purchases")).toBe("Purchases");
    expect(eventLabel("Mobile app installs")).toBe("Mobile app installs");
  });

  it("returns an empty string, not a placeholder, for an undescribed code", () => {
    // A tooltip must show nothing rather than invent an explanation.
    expect(resolveVariableDescription("HK_NoSuchCodeAnywhere")).toBe("");
    expect(resolveVariableDescription("")).toBe("");
  });
});
