// ─── Segment drill-down metric selection (per-browser) ────────────────
// Same pattern as useMetricSelection (overview tiles) but with its own
// storage key and a hard cap on how many metrics can be visible at once,
// so the segment view stays readable.

import { useCallback, useState } from "react";
import { DEFAULT_SEGMENT_METRIC_IDS, MAX_VISIBLE_SEGMENT_METRICS } from "@/lib/data/segmentMetricsCatalog";

const STORAGE_KEY = "metrix.segment.drilldown.metrics.v1";

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
    // Best-effort persistence — never break the drill-down.
  }
}

export function useSegmentMetricSelection() {
  const [selected, setSelected] = useState<string[]>(() => {
    const stored = readStored();
    const base = stored ?? DEFAULT_SEGMENT_METRIC_IDS;
    return base.slice(0, MAX_VISIBLE_SEGMENT_METRICS);
  });

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        writeStored(next);
        return next;
      }
      if (prev.length >= MAX_VISIBLE_SEGMENT_METRICS) return prev;
      const next = [...prev, id];
      writeStored(next);
      return next;
    });
  }, []);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const swapWith = idx + direction;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
      writeStored(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    writeStored(DEFAULT_SEGMENT_METRIC_IDS);
    setSelected(DEFAULT_SEGMENT_METRIC_IDS);
  }, []);

  const atCap = selected.length >= MAX_VISIBLE_SEGMENT_METRICS;

  return { selected, toggle, move, reset, atCap };
}
