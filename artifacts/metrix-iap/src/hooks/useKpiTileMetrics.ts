// ─── Per-view KPI tile metric slots ────────────────────────────────────
// Each view renders a fixed number of KpiTile slots; every slot tracks its
// own metric id. Choices persist to localStorage keyed by view (optionally
// per account) so a user's picks survive navigation and reloads.

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_METRIC_IDS } from "@/lib/data/metricsCatalog";

const KEY_PREFIX = "metrix.kpi_tiles.v1::";

function readStored(viewKey: string): string[] | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + viewKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed as string[];
  } catch { /* ignore */ }
  return null;
}

function writeStored(viewKey: string, ids: string[]) {
  try {
    localStorage.setItem(KEY_PREFIX + viewKey, JSON.stringify(ids));
  } catch { /* best-effort */ }
}

/** Fill `count` slots: stored/default picks that exist in the catalog, backfilled with remaining available ids. */
function resolveSlots(stored: string[] | null, availableIds: string[], defaults: string[], count: number): string[] {
  const picks: string[] = [];
  for (const id of stored ?? defaults) {
    if (availableIds.includes(id) && !picks.includes(id) && picks.length < count) picks.push(id);
  }
  for (const id of defaults) {
    if (picks.length >= count) break;
    if (availableIds.includes(id) && !picks.includes(id)) picks.push(id);
  }
  for (const id of availableIds) {
    if (picks.length >= count) break;
    if (!picks.includes(id)) picks.push(id);
  }
  return picks;
}

export function useKpiTileMetrics(
  viewKey: string,
  availableIds: string[],
  opts?: { defaults?: string[]; tileCount?: number },
) {
  const defaults = opts?.defaults ?? DEFAULT_METRIC_IDS;
  const tileCount = opts?.tileCount ?? 4;
  const [stored, setStored] = useState<string[] | null>(() => readStored(viewKey));

  const tileMetricIds = useMemo(
    () => resolveSlots(stored, availableIds, defaults, tileCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored, availableIds.join(","), defaults.join(","), tileCount],
  );

  const setTileMetric = useCallback((slotIndex: number, metricId: string) => {
    setStored((prev) => {
      const base = resolveSlots(prev, availableIds, defaults, tileCount);
      const next = [...base];
      next[slotIndex] = metricId;
      writeStored(viewKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, availableIds.join(","), defaults.join(","), tileCount]);

  return { tileMetricIds, setTileMetric };
}
