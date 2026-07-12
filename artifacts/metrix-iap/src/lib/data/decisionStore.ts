// ─── Decision store ───────────────────────────────────────────────────
// Tracks per-card decisions (approved → Task Tray, rejected → Dismissed Log)
// scoped by ad account. Persisted to sessionStorage. Approved cards become
// manual implementation tasks — never auto-applied to campaigns.

import { useSyncExternalStore } from "react";

export type Decision = "pending" | "approved" | "rejected";

interface DecisionRecord {
  decision: Decision;
  done?: boolean;
}

interface StoreShape {
  // key = `${adAccountId}::${cardId}`
  records: Record<string, DecisionRecord>;
  last: { key: string; prev: DecisionRecord } | null;
}

const SESSION_KEY = "metrix_decisions_v1";

function load(): StoreShape {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return { ...JSON.parse(raw), last: null };
  } catch {
    /* ignore */
  }
  return { records: {}, last: null };
}

let state: StoreShape = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ records: state.records }));
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function key(adAccountId: string, cardId: string) {
  return `${adAccountId}::${cardId}`;
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot(): StoreShape {
  return state;
}

// ─── Mutations ────────────────────────────────────────────────────────

export function setDecision(adAccountId: string, cardId: string, decision: Decision) {
  const k = key(adAccountId, cardId);
  const prev = state.records[k] ?? { decision: "pending" as Decision };
  state = {
    records: { ...state.records, [k]: { decision, done: false } },
    last: { key: k, prev },
  };
  emit();
}

export function toggleDone(adAccountId: string, cardId: string) {
  const k = key(adAccountId, cardId);
  const rec = state.records[k];
  if (!rec) return;
  state = {
    ...state,
    records: { ...state.records, [k]: { ...rec, done: !rec.done } },
  };
  emit();
}

export function undoLast() {
  if (!state.last) return;
  const { key: k, prev } = state.last;
  state = { records: { ...state.records, [k]: prev }, last: null };
  emit();
}

export function getDecision(adAccountId: string, cardId: string): Decision {
  return state.records[key(adAccountId, cardId)]?.decision ?? "pending";
}

export function isDone(adAccountId: string, cardId: string): boolean {
  return state.records[key(adAccountId, cardId)]?.done ?? false;
}

export function hasLast(): boolean {
  return state.last !== null;
}

// ─── React binding ────────────────────────────────────────────────────

export function useDecisions() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
