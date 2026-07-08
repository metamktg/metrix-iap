// ─── Metric selection ─────────────────────────────────────────────────
// Per-account selection of Meta result events used to filter Analysis
// views. Persisted to sessionStorage. Default: all events selected.

import { useCallback, useMemo, useState } from "react";

const KEY_PREFIX = "metrix_metric_selection_v1::";

function load(adAccountId: string): string[] | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + adAccountId);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persist(adAccountId: string, events: string[]) {
  try {
    sessionStorage.setItem(KEY_PREFIX + adAccountId, JSON.stringify(events));
  } catch {
    /* ignore */
  }
}

export function useMetricSelection(adAccountId: string, allEvents: string[]) {
  const [stored, setStored] = useState<string[] | null>(() => load(adAccountId));

  // Selected = stored ∩ available; default = all available.
  const selected = useMemo(() => {
    if (stored == null) return allEvents;
    const filtered = stored.filter((e) => allEvents.includes(e));
    return filtered.length > 0 ? filtered : allEvents;
  }, [stored, allEvents]);

  const toggle = useCallback(
    (event: string) => {
      const next = selected.includes(event)
        ? selected.filter((e) => e !== event)
        : [...selected, event];
      // Never allow an empty selection — keep at least one event.
      if (next.length === 0) return;
      setStored(next);
      persist(adAccountId, next);
    },
    [selected, adAccountId]
  );

  const isSelected = useCallback((event: string) => selected.includes(event), [selected]);

  return { selected, toggle, isSelected };
}
