// ─── Customizable metric-tile selection (per-browser, shared by both
// overview pages) ───────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_METRIC_IDS } from "@/lib/data/metricsCatalog";

const DEFAULT_STORAGE_KEY = "metrix.overview.metric_tiles.v1";

function readStored(storageKey: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeStored(storageKey: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Best-effort persistence — a full/unavailable localStorage should
    // never break the overview page.
  }
}

/**
 * Manages the ordered set of metric ids selected for a tile row.
 * Persists to localStorage so the choice survives across visits.
 * `availableIds` scopes selection/defaults to what's actually pickable in
 * the current catalog (e.g. this account's own result events).
 * Pass `storageKey`/`defaultIds` to give another surface (e.g. the IAP
 * Library) its own independent selection.
 */
export function useMetricSelection(
  availableIds: string[],
  opts?: { storageKey?: string; defaultIds?: string[] }
) {
  const storageKey = opts?.storageKey ?? DEFAULT_STORAGE_KEY;
  const defaultIds = opts?.defaultIds ?? DEFAULT_METRIC_IDS;
  const [selected, setSelected] = useState<string[]>(() => {
    const stored = readStored(storageKey);
    const base = stored ?? defaultIds;
    const filtered = base.filter((id) => availableIds.includes(id));
    return filtered.length ? filtered : defaultIds.filter((id) => availableIds.includes(id));
  });

  // Re-filter if the available catalog changes (e.g. switching accounts
  // with different result events) so stale ids never linger selected.
  useEffect(() => {
    setSelected((prev) => {
      const filtered = prev.filter((id) => availableIds.includes(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(",")]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeStored(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapWith = idx + direction;
      if (swapWith < 0 || swapWith >= next.length) return prev;
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      writeStored(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const reset = useCallback(() => {
    const next = defaultIds.filter((id) => availableIds.includes(id));
    writeStored(storageKey, next);
    setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(","), storageKey, defaultIds.join(",")]);

  return { selected, toggle, move, reset };
}
