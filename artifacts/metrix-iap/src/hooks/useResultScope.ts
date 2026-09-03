// ─── useResultScope ──────────────────────────────────────────────────────
// The account-level result scope every analysis surface reads (see
// lib/result-scope.ts). Returns the active scope (stored choice when it
// still exists for this account, else the derived default), the groups
// for the bar, and the row filters. Setting it updates every surface on
// the page at once — one lens, many consumers.

import { useCallback, useMemo } from "react";
import type { AdAccount } from "@/lib/data/seedTypes";
import {
  buildResultScopes,
  defaultScopeId,
  eventInputsFromAccount,
  inScope as inScopeFn,
  resolveScope,
  scopeRows as scopeRowsFn,
  useStoredScopeId,
  writeStoredScopeId,
  type ResultScope,
  type ResultScopeGroup,
} from "@/lib/result-scope";

export interface ResultScopeState {
  scope: ResultScope | null;
  scopes: ResultScope[];
  groups: ResultScopeGroup[];
  /** True while the reader has not chosen — the derived default is showing. */
  isDefault: boolean;
  setScopeId: (id: string | null) => void;
  /** Raw Meta result types the scope covers; every type when no scope exists. */
  selectedTypes: string[];
  inScope: (resultType: string | null | undefined) => boolean;
  scopeRows: <T>(rows: readonly T[], typeOf: (row: T) => string | null | undefined) => T[];
  /**
   * Land a row-set where ITS data is, before the reader has chosen. When
   * the account scope is the derived default and this row-set has no rows
   * under it but does carry rows under events the account offers, the
   * row-set lands on its own best scope (same order as the account default)
   * and says so through `landed`. A stored choice is always honoured — then
   * an empty row-set is an honest empty, never a silent switch.
   */
  landRows: <T>(rows: readonly T[], typeOf: (row: T) => string | null | undefined) => { rows: T[]; landed: ResultScope | null };
}

export function useResultScope(
  account: AdAccount | null | undefined,
  adAccountId: string | null | undefined,
  /** Result types the calling surface's rows carry — decides the first landing only (see defaultScopeId). */
  presentTypes?: readonly (string | null | undefined)[],
): ResultScopeState {
  const key = adAccountId ?? "none";
  const storedId = useStoredScopeId(key);
  const built = useMemo(() => buildResultScopes(eventInputsFromAccount(account)), [account]);
  const presentKey = useMemo(() => [...new Set((presentTypes ?? []).filter((t): t is string => typeof t === "string"))].sort().join("\u0001"), [presentTypes]);
  const fallbackId = useMemo(() => defaultScopeId(built.groups, presentKey ? presentKey.split("\u0001") : undefined), [built, presentKey]);
  const stored = resolveScope(built.scopes, storedId);
  const scope = stored ?? resolveScope(built.scopes, fallbackId);
  const setScopeId = useCallback((id: string | null) => writeStoredScopeId(key, id), [key]);
  const selectedTypes = useMemo(() => (scope ? scope.resultTypes : built.scopes.flatMap((s) => (s.kind === "event" ? s.resultTypes : []))), [scope, built]);
  const isDefault = stored === null;
  const landRows = useCallback(
    <T,>(rows: readonly T[], typeOf: (row: T) => string | null | undefined): { rows: T[]; landed: ResultScope | null } => {
      const scoped = scopeRowsFn(rows, scope, typeOf);
      if (!isDefault || scoped.length > 0 || rows.length === 0 || !scope) return { rows: scoped, landed: null };
      const present = rows.map(typeOf).filter((t): t is string => typeof t === "string");
      const ownId = defaultScopeId(built.groups, present);
      const own = ownId && ownId !== scope.id ? resolveScope(built.scopes, ownId) : null;
      if (!own) return { rows: scoped, landed: null };
      const landedRows = scopeRowsFn(rows, own, typeOf);
      return landedRows.length > 0 ? { rows: landedRows, landed: own } : { rows: scoped, landed: null };
    },
    [scope, isDefault, built],
  );
  return {
    scope,
    scopes: built.scopes,
    groups: built.groups,
    isDefault,
    setScopeId,
    selectedTypes,
    inScope: (rt) => inScopeFn(scope, rt),
    scopeRows: (rows, typeOf) => scopeRowsFn(rows, scope, typeOf),
    landRows,
  };
}
