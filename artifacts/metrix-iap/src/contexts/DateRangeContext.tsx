// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Global date-range filter (A5)
// Live range selection shared by every data-driven module. Bounds are
// scoped to the active ad account's actual available data window
// (campaign_summary.window_start/end); manager scope unions configured
// accounts. Presets anchor to the END of the data window so "Last 7 days"
// always means the last 7 days of available data — never fabricated days.
// ═══════════════════════════════════════════════════════════════════════

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useAccount } from "@/contexts/AccountContext";
import { getCampaignSummary } from "@/lib/data/metrixSeedAdapter";

export type DateRangePreset =
  | "7d"
  | "14d"
  | "30d"
  | "60d"
  | "90d"
  | "all"
  | "custom";

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "60d": "Last 60 days",
  "90d": "Last 90 days",
  all: "All available data",
  custom: "Custom range",
};

const PRESET_DAYS: Partial<Record<DateRangePreset, number>> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

export interface IsoRange {
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
}

// ─── ISO date math (UTC, no time component) ───────────────────────────

function toUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

export function isoMax(a: string, b: string): string {
  return a >= b ? a : b;
}

export function isoMin(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Inclusive overlap between two ISO ranges. Unknown (null) row dates count as overlapping — we never hide undated rows. */
export function rangesOverlap(
  range: IsoRange,
  rowStart: string | null | undefined,
  rowEnd: string | null | undefined
): boolean {
  if (!rowStart && !rowEnd) return true;
  const s = rowStart ?? rowEnd!;
  const e = rowEnd ?? rowStart!;
  return s <= range.end && e >= range.start;
}

export function formatIsoRange(range: IsoRange): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}

// ─── Context shape ────────────────────────────────────────────────────

interface DateRangeState {
  preset: DateRangePreset;
  customStart: string | null;
  customEnd: string | null;
  compare: boolean;
}

export interface DateRangeValue {
  /** Actual data availability window for the current scope, or null when no dated data exists. */
  bounds: IsoRange | null;
  /** The selected range, clamped to bounds. Null when bounds are null. */
  range: IsoRange | null;
  /** Previous adjacent period of equal length (may extend before the data window). Null unless compare is on. */
  compareRange: IsoRange | null;
  preset: DateRangePreset;
  compare: boolean;
  setPreset: (p: DateRangePreset) => void;
  setCustomRange: (start: string, end: string) => void;
  setCompare: (on: boolean) => void;
  /** True when the selected range overlaps the scope's data window at all. */
  rangeHasData: boolean;
  rangeLabel: string;
  /** Convenience: does a dated row overlap the selected range? Undated rows always pass. */
  inRange: (rowStart: string | null | undefined, rowEnd: string | null | undefined) => boolean;
}

const DateRangeContext = createContext<DateRangeValue | null>(null);

const STORAGE_KEY = "metrix_date_range_v1";

type PersistMap = Record<string, DateRangeState>;

function loadPersist(): PersistMap {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistMap;
  } catch {
    /* ignore */
  }
  return {};
}

const DEFAULT_STATE: DateRangeState = {
  preset: "all",
  customStart: null,
  customEnd: null,
  compare: false,
};

// ─── Provider ─────────────────────────────────────────────────────────

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const seed = useMetrixSeed();
  const { selectedAccountType, activeAdAccountId, adAccounts } = useAccount();

  const scopeKey =
    selectedAccountType === "ad_account" && activeAdAccountId
      ? `acct:${activeAdAccountId}`
      : "manager";

  // Bounds: per-account campaign window, or the union across configured accounts for manager scope.
  const bounds = useMemo<IsoRange | null>(() => {
    const windows: IsoRange[] = [];
    const ids =
      selectedAccountType === "ad_account" && activeAdAccountId
        ? [activeAdAccountId]
        : adAccounts.map((a) => a.id);
    for (const id of ids) {
      const cs = getCampaignSummary(seed, id);
      if (cs?.window_start && cs?.window_end) {
        windows.push({ start: cs.window_start, end: cs.window_end });
      }
    }
    if (!windows.length) return null;
    return windows.reduce((acc, w) => ({
      start: isoMin(acc.start, w.start),
      end: isoMax(acc.end, w.end),
    }));
  }, [seed, selectedAccountType, activeAdAccountId, adAccounts]);

  const [persist, setPersist] = useState<PersistMap>(loadPersist);
  const state = persist[scopeKey] ?? DEFAULT_STATE;

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
    } catch {
      /* ignore */
    }
  }, [persist]);

  const update = useCallback(
    (patch: Partial<DateRangeState>) => {
      setPersist((prev) => ({
        ...prev,
        [scopeKey]: { ...(prev[scopeKey] ?? DEFAULT_STATE), ...patch },
      }));
    },
    [scopeKey]
  );

  const setPreset = useCallback(
    (p: DateRangePreset) => {
      if (p === "custom") return; // custom is set via setCustomRange
      update({ preset: p });
    },
    [update]
  );

  const setCustomRange = useCallback(
    (start: string, end: string) => {
      const s = isoMin(start, end);
      const e = isoMax(start, end);
      update({ preset: "custom", customStart: s, customEnd: e });
    },
    [update]
  );

  const setCompare = useCallback((on: boolean) => update({ compare: on }), [update]);

  const range = useMemo<IsoRange | null>(() => {
    if (!bounds) return null;
    if (state.preset === "all") return bounds;
    if (state.preset === "custom") {
      if (!state.customStart || !state.customEnd) return bounds;
      // Clamp custom range to the available data window.
      const start = isoMax(state.customStart, bounds.start);
      const end = isoMin(state.customEnd, bounds.end);
      // Preserve the user's literal selection even when it falls fully
      // outside the window — modules then show an explicit no-data state.
      if (start > end) return { start: state.customStart, end: state.customEnd };
      return { start, end };
    }
    const days = PRESET_DAYS[state.preset] ?? 30;
    // Anchor presets to the end of the available data window.
    const start = isoMax(addDays(bounds.end, -(days - 1)), bounds.start);
    return { start, end: bounds.end };
  }, [bounds, state.preset, state.customStart, state.customEnd]);

  const compareRange = useMemo<IsoRange | null>(() => {
    if (!state.compare || !range) return null;
    const lengthDays = Math.round((toUtc(range.end) - toUtc(range.start)) / DAY_MS) + 1;
    const end = addDays(range.start, -1);
    return { start: addDays(end, -(lengthDays - 1)), end };
  }, [state.compare, range]);

  const rangeHasData = useMemo(() => {
    if (!bounds || !range) return false;
    return range.start <= bounds.end && range.end >= bounds.start;
  }, [bounds, range]);

  const inRange = useCallback(
    (rowStart: string | null | undefined, rowEnd: string | null | undefined) => {
      if (!range) return true;
      return rangesOverlap(range, rowStart, rowEnd);
    },
    [range]
  );

  const value: DateRangeValue = {
    bounds,
    range,
    compareRange,
    preset: state.preset,
    compare: state.compare,
    setPreset,
    setCustomRange,
    setCompare,
    rangeHasData,
    rangeLabel: range ? formatIsoRange(range) : "No data window",
    inRange,
  };

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange(): DateRangeValue {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
