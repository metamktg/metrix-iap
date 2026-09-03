// ─── Analysis-run scoping helpers ──────────────────────────────────────
// Mirrors date-scope.ts's cell-window mechanics, but scopes creative cells
// by which analysis run(s) produced their concept's rollup data instead of
// by a date range. Cells inherit their concept's run membership (cell
// "C2B" belongs to concept "C2"), derived from concept_rollup's
// manual_analysis_run_id — the same source date-scope.ts's cellInRange
// uses for date windows, now read for run identity instead.
//
// A concept with no dated/run-tagged rollup entry at all, or a rollup row
// predating run-scoping (manual_analysis_run_id null), always passes —
// never hide a row we can't honestly attribute to a run.

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import type { AnalysisData, ConceptScopedRow } from "@/lib/data/seedTypes";
import { conceptForCell } from "@/lib/date-scope";
import { ALL_TIME_SELECTION, type RunSelectorValue } from "@/components/analysis/RunSelector";
import type { AnalysisRun } from "@workspace/api-client-react";

// ─── Persisted run-scope selection ─────────────────────────────────────
// Each page's RunScopePicker selection survives navigation (and refresh,
// within the tab) per page + per ad account, mirroring the account
// switcher's sessionStorage persistence. Stale-run guard: once the run
// list loads, any stored run id that no longer exists resets the whole
// selection to All time — a deleted run must never blank the page.

function runScopeStorageKey(pageKey: string, adAccountId: string): string {
  return `metrix.runScope.${pageKey}.${adAccountId}`;
}

function readStoredRunScope(pageKey: string, adAccountId: string | null): RunSelectorValue {
  if (!adAccountId) return ALL_TIME_SELECTION;
  try {
    const raw = sessionStorage.getItem(runScopeStorageKey(pageKey, adAccountId));
    if (!raw) return ALL_TIME_SELECTION;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof (parsed as RunSelectorValue).allTime === "boolean" &&
      Array.isArray((parsed as RunSelectorValue).selectedRunIds) &&
      (parsed as RunSelectorValue).selectedRunIds.every((id) => typeof id === "string")
    ) {
      const v = parsed as RunSelectorValue;
      // An explicit non-all-time selection with no runs is invalid — normalize.
      if (!v.allTime && v.selectedRunIds.length === 0) return ALL_TIME_SELECTION;
      return v;
    }
  } catch {
    // Corrupt JSON or storage unavailable — fall back to the default.
  }
  return ALL_TIME_SELECTION;
}

/**
 * Drop-in replacement for `useState(ALL_TIME_SELECTION)` in pages using
 * RunScopePicker. Persists the selection in sessionStorage per page and
 * ad account, and falls back to All time when a stored run id no longer
 * exists in the loaded run list (`runs` undefined = still loading; the
 * guard waits until the list is actually known).
 */
export function usePersistedRunScope(
  pageKey: string,
  adAccountId: string | null,
  runs: AnalysisRun[] | undefined,
  /** When false, the hook is inert: plain local state, no storage reads,
   *  writes, or stale-run validation. Used by controlled components whose
   *  parent owns the persisted selection — an inert child must never write
   *  its unused local state into the parent's shared storage key. */
  enabled = true,
): [RunSelectorValue, (v: RunSelectorValue) => void] {
  // The selection is keyed to the page + account it was read/written for.
  // On account (or page) change we reset synchronously during render —
  // never letting a previous account's selection survive even one render,
  // where the stale-run guard could validate it against the NEW account's
  // run list and clobber that account's stored value.
  const scopeKey = `${pageKey}|${adAccountId ?? ""}`;
  const [state, setState] = useState<{ key: string; value: RunSelectorValue }>(() => ({
    key: scopeKey,
    value: enabled ? readStoredRunScope(pageKey, adAccountId) : ALL_TIME_SELECTION,
  }));
  if (state.key !== scopeKey) {
    setState({
      key: scopeKey,
      value: enabled ? readStoredRunScope(pageKey, adAccountId) : ALL_TIME_SELECTION,
    });
  }
  const selection =
    state.key === scopeKey
      ? state.value
      : enabled
        ? readStoredRunScope(pageKey, adAccountId)
        : ALL_TIME_SELECTION;

  // ── Arriving pre-scoped (N-5) ────────────────────────────────────────
  // A history row used to link to "Open in Analysis Overview" and leave the
  // reader to find that run again in the picker — the one thing they had
  // just chosen. `?run=<id>` applies it on arrival, ONCE: it is copied into
  // the same stored selection the picker writes, so the picker keeps working
  // and a later change is not fought by the URL. Applied only when the run
  // list is loaded and actually contains the id, so a stale link falls back
  // to whatever the reader had rather than emptying the page.
  const appliedRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !adAccountId || runs === undefined) return;
    const requested = new URLSearchParams(window.location.search).get("run");
    if (!requested || appliedRunRef.current === `${scopeKey}|${requested}`) return;
    if (!runs.some((r) => r.id === requested)) return;
    appliedRunRef.current = `${scopeKey}|${requested}`;
    setSelection({ allTime: false, selectedRunIds: [requested] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, adAccountId, runs, scopeKey]);

  const setSelection = useCallback(
    (v: RunSelectorValue) => {
      setState({ key: scopeKey, value: v });
      if (!enabled || !adAccountId) return;
      try {
        sessionStorage.setItem(runScopeStorageKey(pageKey, adAccountId), JSON.stringify(v));
      } catch {
        // Storage full/unavailable — selection still works for this visit.
      }
    },
    [pageKey, adAccountId, scopeKey, enabled],
  );

  // Stale-run guard: once runs are loaded, a stored id that no longer
  // exists resets the selection (and the stored value) to All time.
  // Only ever validates a selection belonging to the CURRENT scope key —
  // never a previous account's leftover state, and never when inert.
  useEffect(() => {
    if (!enabled || runs === undefined) return;
    if (state.key !== scopeKey) return;
    const sel = state.value;
    if (sel.allTime || sel.selectedRunIds.length === 0) return;
    const known = new Set(runs.map((r) => r.id));
    if (sel.selectedRunIds.some((id) => !known.has(id))) {
      setSelection(ALL_TIME_SELECTION);
    }
  }, [runs, state, scopeKey, setSelection, enabled]);

  return [selection, setSelection];
}

/** Per concept code, the set of analysis run ids (plus "null" for
 *  untagged/legacy rows) whose rollup contributed to that concept. */
export function getConceptRunIds(a: AnalysisData | null | undefined): Map<string, Set<string | null>> {
  const map = new Map<string, Set<string | null>>();
  for (const r of a?.concept_rollup ?? []) {
    const set = map.get(r.concept) ?? new Set<string | null>();
    set.add(r.manual_analysis_run_id ?? null);
    map.set(r.concept, set);
  }
  return map;
}

/**
 * Whether a creative cell's concept was produced by (one of) the selected
 * analysis run(s). All time always passes. Cells whose concept has no
 * rollup entry, or whose rollup includes an untagged legacy row, always
 * pass — same "never hide what we can't attribute" rule as cellInRange.
 */
export function cellInRunScope(
  runIdsByConcept: Map<string, Set<string | null>>,
  selection: RunSelectorValue,
  cellId: string,
  conceptHint?: string | null,
): boolean {
  if (selection.allTime) return true;
  const concept =
    (conceptHint && runIdsByConcept.has(conceptHint) ? conceptHint : null) ??
    conceptForCell(cellId);
  if (!concept) return true;
  const runIds = runIdsByConcept.get(concept);
  if (!runIds) return true;
  if (runIds.has(null)) return true;
  return selection.selectedRunIds.some((id) => runIds.has(id));
}

export function useCellRunScope(analysis: AnalysisData | null | undefined, selection: RunSelectorValue) {
  const runIdsByConcept = useMemo(() => getConceptRunIds(analysis), [analysis]);

  const inRunScope = useCallback(
    (cellId: string, conceptHint?: string | null) =>
      cellInRunScope(runIdsByConcept, selection, cellId, conceptHint),
    [runIdsByConcept, selection],
  );

  const filterByRun = useCallback(
    <T extends ConceptScopedRow>(rows: T[]): T[] =>
      selection.allTime
        ? rows
        : rows.filter((r) => inRunScope(r.cell_id, r.concept_variable ?? null)),
    [selection, inRunScope],
  );

  return { runIdsByConcept, inRunScope, filterByRun };
}
