// ─── Customizable metric-tile selection (per-browser, shared by both
// overview pages) ───────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_METRIC_IDS } from "@/lib/data/metricsCatalog";

const STORAGE_KEY = "metrix.overview.metric_tiles.v1";

function readStored(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeStored(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort persistence — a full/unavailable localStorage should
    // never break the overview page.
  }
}

/**
 * Manages the ordered set of metric ids selected for the overview tile
 * row. Persists to localStorage so the choice survives across visits and
 * is shared by both overview pages (they render the same tile component).
 * `availableIds` scopes selection/defaults to what's actually pickable in
 * the current catalog (e.g. this account's own result events).
 */
export function useMetricSelection(availableIds: string[]) {
  const [selected, setSelected] = useState<string[]>(() => {
    const stored = readStored();
    const base = stored ?? DEFAULT_METRIC_IDS;
    const filtered = base.filter((id) => availableIds.includes(id));
    return filtered.length ? filtered : DEFAULT_METRIC_IDS.filter((id) => availableIds.includes(id));
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
      writeStored(next);
      return next;
    });
  }, []);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapWith = idx + direction;
      if (swapWith < 0 || swapWith >= next.length) return prev;
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      writeStored(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = DEFAULT_METRIC_IDS.filter((id) => availableIds.includes(id));
    writeStored(next);
    setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(",")]);

  return { selected, toggle, move, reset };
}
