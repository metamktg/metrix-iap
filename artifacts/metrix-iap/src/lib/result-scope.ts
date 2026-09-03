// ─── Result scope ───────────────────────────────────────────────────────
// ONE account-level lens that every analysis surface reads: which result
// event (or which blend of terminal conversion events) the rows on screen
// are summed and ranked under. Owner direction (2026-09-03): awareness
// campaigns and purchase-intent events are never weighted against each
// other, and the reader gets both a blended view and each event on its own.
//
// Before this, the Library and Budget shared a multi-select whose default
// was "every event", and every other surface had no scope at all — so a
// ThruPlay row and a purchase row sat in one CPA ranking on thirty-one
// surfaces. The scope replaces that: rows are filtered to the scope's
// events BEFORE any sum or sort, so an aggregate is always one event, or a
// blend the taxonomy allows (terminal conversions only).
//
// Derived from data: the scopes an account offers come from the events its
// ads actually ran under (seed `result_events`, else bottom-line totals).
// The chosen scope is a per-account, per-browser convenience (session
// storage), never a property of the account.

import { useSyncExternalStore } from "react";
import { blendableEvents, classifyResultEvent, INTENT_CLASSES, INTENT_CLASS_ORDER, type EvaluationScale, type IntentClass } from "@/lib/resultEvents";
import { eventLabel } from "@/pages/metrix/shared";
import type { AdAccount, SeedResultEventTotals } from "@/lib/data/seedTypes";

export interface ResultScope {
  /** "event:<raw Meta result type>" or "blend:conversion". */
  id: string;
  kind: "event" | "blended";
  label: string;
  intent: IntentClass | null;
  scale: EvaluationScale | null;
  /** The raw Meta result type strings this scope covers. */
  resultTypes: string[];
  spend: number;
  results: number;
  ads: number;
}

export interface ResultScopeGroup {
  intent: IntentClass | null;
  label: string;
  scale: EvaluationScale | null;
  scopes: ResultScope[];
}

export interface ScopeEventInput {
  raw: string;
  spend: number;
  results: number;
  ads?: number;
}

const BLENDED_CONVERSION_ID = "blend:conversion";
const eventScopeId = (raw: string): string => `event:${raw}`;

function eventInputsFromTotals(totals: Record<string, SeedResultEventTotals> | null | undefined): ScopeEventInput[] {
  return Object.entries(totals ?? {}).map(([raw, t]) => ({ raw, spend: Number(t.spend ?? 0), results: Number(t.results ?? 0) }));
}

/**
 * The events an account offers as scopes, preferring the seed's derived
 * `result_events` (carries distinct-ad counts), then bottom-line totals,
 * then the distinct result types on the analysis rows themselves.
 */
export function eventInputsFromAccount(account: AdAccount | null | undefined): ScopeEventInput[] {
  if (!account) return [];
  if (account.result_events && account.result_events.length > 0) {
    return account.result_events.map((e) => ({ raw: e.raw, spend: e.spend, results: e.results, ads: e.ads }));
  }
  const fromTotals = eventInputsFromTotals(account.iap?.campaign_summary?.bottom_line_totals);
  if (fromTotals.length > 0) return fromTotals;
  const seen = new Map<string, ScopeEventInput>();
  for (const r of account.iap?.analysis?.performance_by_cell ?? []) {
    const raw = r["Result type"] || "unknown";
    const e = seen.get(raw) ?? { raw, spend: 0, results: 0 };
    e.spend += r["Amount spent (USD)"] ?? 0;
    e.results += r.Results ?? 0;
    seen.set(raw, e);
  }
  return [...seen.values()];
}

const GROUP_LABEL: Record<IntentClass, string> = { conversion: "Conversion", consideration: "Consideration", awareness: "Awareness" };

/**
 * Build the scopes: one per event, grouped by intent class in display
 * order, plus a single blended scope when two or more TERMINAL conversion
 * events exist (a checkout and the purchase it precedes are never summed;
 * neither are reach and ThruPlays). Unplaced events (unknown / custom)
 * form their own group so their spend is never hidden.
 */
export function buildResultScopes(events: readonly ScopeEventInput[]): { scopes: ResultScope[]; groups: ResultScopeGroup[] } {
  const byClass = new Map<IntentClass | null, ResultScope[]>();
  for (const e of events) {
    const c = classifyResultEvent(e.raw);
    const scope: ResultScope = {
      id: eventScopeId(e.raw),
      kind: "event",
      label: c.key === "custom" || c.key === "unknown" ? eventLabel(e.raw) : c.label,
      intent: c.intent,
      scale: c.scale,
      resultTypes: [e.raw],
      spend: e.spend,
      results: e.results,
      ads: e.ads ?? 0,
    };
    (byClass.get(c.intent) ?? byClass.set(c.intent, []).get(c.intent)!).push(scope);
  }
  for (const list of byClass.values()) list.sort((a, b) => b.spend - a.spend || a.label.localeCompare(b.label));

  const groups: ResultScopeGroup[] = [];
  for (const intent of INTENT_CLASS_ORDER) {
    const list = byClass.get(intent);
    if (!list || list.length === 0) continue;
    const scopes = [...list];
    if (intent === "conversion") {
      const blend = blendableEvents(list.map((s) => s.resultTypes[0]!));
      if (blend.length >= 2) {
        const members = list.filter((s) => blend.includes(s.resultTypes[0]!));
        scopes.unshift({
          id: BLENDED_CONVERSION_ID,
          kind: "blended",
          label: "All conversions",
          intent: "conversion",
          scale: "cost_per_result",
          resultTypes: members.map((s) => s.resultTypes[0]!),
          spend: members.reduce((n, s) => n + s.spend, 0),
          results: members.reduce((n, s) => n + s.results, 0),
          ads: members.reduce((n, s) => n + s.ads, 0),
        });
      }
    }
    groups.push({ intent, label: GROUP_LABEL[intent], scale: INTENT_CLASSES[intent].scale, scopes });
  }
  const unplaced = byClass.get(null);
  if (unplaced && unplaced.length > 0) groups.push({ intent: null, label: "Unplaced", scale: null, scopes: unplaced });
  return { scopes: groups.flatMap((g) => g.scopes), groups };
}

/**
 * The scope a reader lands on: the dominant class by spend (conversion →
 * consideration → awareness on a tie); inside conversion, the blend when
 * one exists, else the largest event. Null only when there are no events.
 *
 * `presentTypes` — the result types the CALLING SURFACE's rows actually
 * carry — lets a surface land where its data is when the reader has not
 * chosen: the first scope in that same order whose events appear on the
 * rows wins, so a page whose rows were all written under one event opens
 * on that event rather than on an empty blend. A stored choice is always
 * respected everywhere; this only decides the first landing.
 */
export function defaultScopeId(groups: readonly ResultScopeGroup[], presentTypes?: readonly string[]): string | null {
  const placed = groups.filter((g) => g.intent !== null);
  const pool = placed.length > 0 ? placed : groups;
  if (pool.length === 0) return null;
  const spendOf = (g: ResultScopeGroup) => g.scopes.filter((s) => s.kind === "event").reduce((n, s) => n + s.spend, 0);
  const ordered = [...pool].sort((a, b) => spendOf(b) - spendOf(a) || pool.indexOf(a) - pool.indexOf(b));
  const present = new Set((presentTypes ?? []).map((t) => (t.trim() !== "" ? t.trim() : "unknown")));
  if (present.size > 0) {
    for (const g of [...ordered, ...groups.filter((g) => !ordered.includes(g))]) {
      const hit = g.scopes.find((s) => s.resultTypes.some((rt) => present.has(rt)));
      if (hit) return hit.id;
    }
  }
  return ordered[0]!.scopes[0]?.id ?? null;
}

export function resolveScope(scopes: readonly ResultScope[], id: string | null | undefined): ResultScope | null {
  if (!id) return null;
  return scopes.find((s) => s.id === id) ?? null;
}

/**
 * A row with NO result type field at all (null / undefined) was written
 * before the result-event grain and is "not split by event" — it is kept
 * under every scope, never treated as another event. An EMPTY string is a
 * present-but-blank type and folds under "unknown", as the engine does.
 */
export function inScope(scope: ResultScope | null, resultType: string | null | undefined): boolean {
  if (!scope) return true;
  if (resultType == null) return true;
  const rt = resultType.trim() !== "" ? resultType.trim() : "unknown";
  return scope.resultTypes.includes(rt);
}

export function scopeRows<T>(rows: readonly T[], scope: ResultScope | null, typeOf: (row: T) => string | null | undefined): T[] {
  if (!scope) return [...rows];
  return rows.filter((r) => inScope(scope, typeOf(r)));
}

/**
 * One row per cell inside a scope. performance_by_cell is (cell × event);
 * after scoping, a cell has one row (event scope) or one per blended
 * terminal event (blended scope). Sums are additive (spend, results,
 * clicks); rates are recomputed from the sums, never averaged; delivery
 * (impressions, reach) is summed across the blend's rows on the same basis
 * the account tiles use. The row's "Result type" names the scope so a
 * downstream reader can see what it is looking at.
 */
export function collapseCellRows<T extends { cell_id: string; "Result type": string; "Amount spent (USD)": number; Results: number; Impressions: number; Reach: number; "Clicks (all)": number; "Link clicks": number; CPA_result: number | null; CTR_link_pct: number; Result_per_link_click_pct?: number }>(
  rows: readonly T[],
  scope: ResultScope | null,
): T[] {
  const byCell = new Map<string, T[]>();
  for (const r of rows) (byCell.get(r.cell_id) ?? byCell.set(r.cell_id, []).get(r.cell_id)!).push(r);
  const out: T[] = [];
  for (const group of byCell.values()) {
    if (group.length === 1) { out.push(group[0]!); continue; }
    const spend = group.reduce((n, r) => n + (r["Amount spent (USD)"] ?? 0), 0);
    const results = group.reduce((n, r) => n + (r.Results ?? 0), 0);
    const impressions = group.reduce((n, r) => n + (r.Impressions ?? 0), 0);
    const reach = group.reduce((n, r) => n + (r.Reach ?? 0), 0);
    const clicksAll = group.reduce((n, r) => n + (r["Clicks (all)"] ?? 0), 0);
    const linkClicks = group.reduce((n, r) => n + (r["Link clicks"] ?? 0), 0);
    const types = [...new Set(group.map((r) => r["Result type"]))];
    out.push({
      ...group[0]!,
      "Result type": scope?.kind === "blended" ? scope.label : types.length === 1 ? types[0]! : types.join(" + "),
      "Amount spent (USD)": spend,
      Results: results,
      Impressions: impressions,
      Reach: reach,
      "Clicks (all)": clicksAll,
      "Link clicks": linkClicks,
      CPA_result: results > 0 ? spend / results : null,
      CTR_link_pct: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
      Result_per_link_click_pct: linkClicks > 0 ? (results / linkClicks) * 100 : 0,
    });
  }
  return out;
}

/**
 * concept_rollup rows written at result-event grain carry `result_type`;
 * rows from before the split carry null and are KEPT — "not split by event"
 * is not "another event", and dropping them would hide history.
 */
export function scopeRollupRows<T extends { result_type?: string | null }>(rows: readonly T[], scope: ResultScope | null): T[] {
  if (!scope) return [...rows];
  return rows.filter((r) => r.result_type == null || inScope(scope, r.result_type));
}

/** "Purchases" · "All conversions · Purchases + Leads" · "ThruPlays · communication scale". */
export function scopeSubtitle(scope: ResultScope | null): string {
  if (!scope) return "";
  if (scope.kind === "blended") return `${scope.label} · ${scope.resultTypes.map((rt) => classifyResultEvent(rt).label).join(" + ")}`;
  return scope.scale === "communication" ? `${scope.label} · communication scale` : scope.label;
}

/** The metric a ranking under this scope leads with, and its direction. */
export function scopeRank(scope: ResultScope | null): { metric: string; direction: "asc" | "desc" } {
  if (!scope || !scope.intent) return { metric: "cpa", direction: "asc" };
  const def = INTENT_CLASSES[scope.intent];
  return { metric: def.rankOn[0]!, direction: def.primaryDirection };
}

// ─── Per-account persisted choice (session) ──────────────────────────────

const KEY_PREFIX = "metrix_result_scope_v1::";
const listeners = new Map<string, Set<() => void>>();
const memory = new Map<string, string | null>();

function read(accountId: string): string | null {
  if (memory.has(accountId)) return memory.get(accountId)!;
  let v: string | null = null;
  try {
    v = sessionStorage.getItem(KEY_PREFIX + accountId);
  } catch {
    /* storage unavailable: memory only */
  }
  memory.set(accountId, v);
  return v;
}

export function writeStoredScopeId(accountId: string, id: string | null): void {
  memory.set(accountId, id);
  try {
    if (id) sessionStorage.setItem(KEY_PREFIX + accountId, id);
    else sessionStorage.removeItem(KEY_PREFIX + accountId);
  } catch {
    /* ignore */
  }
  for (const cb of listeners.get(accountId) ?? []) cb();
}

function subscribe(accountId: string, cb: () => void): () => void {
  const set = listeners.get(accountId) ?? listeners.set(accountId, new Set()).get(accountId)!;
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

/** The stored scope id for an account, live across every surface on the page. */
export function useStoredScopeId(accountId: string): string | null {
  return useSyncExternalStore(
    (cb) => subscribe(accountId, cb),
    () => read(accountId),
    () => null,
  );
}
