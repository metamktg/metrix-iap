// ─── Tray store ───────────────────────────────────────────────────────
// User-curated task tray: any actionable strategy/brief item across the
// platform can be added to the tray ("Add to Tray"), then later marked
// complete or archived from inside the tray. Nothing is ever deleted —
// completed and archived items stay in the tray history so the user can
// review everything that was ever tasked.
//
// Persisted to localStorage (durable across sessions — the history is the
// point), scoped per ad account like the old decision store.

import { useSyncExternalStore } from "react";

export type TrayItemStatus = "open" | "done" | "archived";

export type TrayItemKind =
  | "recommendation"
  | "hypothesis"
  | "brief"
  | "signal"
  | "custom";

export interface TrayItemInput {
  /** Stable id of the source item (card id, hypothesis id, brief id…). */
  id: string;
  kind: TrayItemKind;
  title: string;
  /** Secondary line (status, action, impact…). */
  sub?: string;
  /** In-app route to jump back to the source of the item. */
  href?: string;
}

export interface TrayItem extends TrayItemInput {
  status: TrayItemStatus;
  addedAt: number;
  statusChangedAt: number;
}

interface StoreShape {
  // key = `${scopeId}::${itemId}`
  items: Record<string, TrayItem>;
}

const STORAGE_KEY = "metrix_tray_items_v1";

function load(): StoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreShape;
      if (parsed && typeof parsed.items === "object" && parsed.items !== null) {
        return { items: parsed.items };
      }
    }
  } catch {
    /* ignore */
  }
  return { items: {} };
}

let state: StoreShape = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function key(scopeId: string, itemId: string) {
  return `${scopeId}::${itemId}`;
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot(): StoreShape {
  return state;
}

// ─── Mutations ────────────────────────────────────────────────────────

/** Add an item to the tray (or re-open it if it was completed/archived). */
export function addToTray(scopeId: string, input: TrayItemInput) {
  const k = key(scopeId, input.id);
  const now = Date.now();
  const existing = state.items[k];
  state = {
    items: {
      ...state.items,
      [k]: existing
        ? { ...existing, ...input, status: "open", statusChangedAt: now }
        : { ...input, status: "open", addedAt: now, statusChangedAt: now },
    },
  };
  emit();
}

/** Remove an item from the tray entirely (undo of an accidental add). */
export function removeFromTray(scopeId: string, itemId: string) {
  const k = key(scopeId, itemId);
  if (!state.items[k]) return;
  const items = { ...state.items };
  delete items[k];
  state = { items };
  emit();
}

export function setTrayItemStatus(
  scopeId: string,
  itemId: string,
  status: TrayItemStatus,
) {
  const k = key(scopeId, itemId);
  const rec = state.items[k];
  if (!rec || rec.status === status) return;
  state = {
    items: {
      ...state.items,
      [k]: { ...rec, status, statusChangedAt: Date.now() },
    },
  };
  emit();
}

// ─── Queries ──────────────────────────────────────────────────────────

export function isInTray(scopeId: string, itemId: string): boolean {
  return state.items[key(scopeId, itemId)]?.status === "open";
}

export function getTrayItem(scopeId: string, itemId: string): TrayItem | undefined {
  return state.items[key(scopeId, itemId)];
}

export interface ScopedTrayItem extends TrayItem {
  scopeId: string;
}

/** All items for a scope (or every scope when omitted), newest first. */
export function getTrayItems(scopeId?: string): ScopedTrayItem[] {
  return Object.entries(state.items)
    .map(([k, item]) => {
      const sep = k.indexOf("::");
      return { ...item, scopeId: k.slice(0, sep) };
    })
    .filter((i) => scopeId === undefined || i.scopeId === scopeId)
    .sort((a, b) => b.addedAt - a.addedAt);
}

export function getOpenTrayItems(scopeId?: string): ScopedTrayItem[] {
  return getTrayItems(scopeId).filter((i) => i.status === "open");
}

/** Completed + archived items — the tray history, newest change first. */
export function getTrayHistory(scopeId?: string): ScopedTrayItem[] {
  return getTrayItems(scopeId)
    .filter((i) => i.status !== "open")
    .sort((a, b) => b.statusChangedAt - a.statusChangedAt);
}

// ─── React binding ────────────────────────────────────────────────────

export function useTrayItems() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ─── Test helpers (never import in production code) ───────────────────

/** Reset in-memory store state. Only for use in unit tests. */
export function _resetForTest() {
  state = { items: {} };
  emit();
}
