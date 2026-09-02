// ─── Creative-source nudge dismissals ─────────────────────────────────
// The nudge that suggests uploading creatives or connecting Meta persists
// until the reader dismisses it, per account, per browser — the same
// per-browser convenience tier the metric-tile picker uses. It is not
// shared state: a colleague's dismissal must not hide it for you.

import { useSyncExternalStore } from "react";

const KEY = "metrix_creative_nudge_dismissed_v1";
const listeners = new Set<() => void>();
// Snapshot cache keyed on the raw stored string, so the array identity is
// stable between renders (useSyncExternalStore needs that) yet an external
// change to storage — another tab, or a test's localStorage.clear() — is
// picked up on the next read without a reset seam.
let cacheRaw: string | null | undefined;
let cache: string[] = [];

function load(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      cache = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      cache = [];
    }
  }
  return cache;
}

function save(next: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the dismissal lasts for this page only */
    cacheRaw = JSON.stringify(next);
    cache = next;
  }
  for (const l of listeners) l();
}

/**
 * Which suggestion is being dismissed. "source" is the original nudge
 * (upload creatives / connect Meta); "next_step" is the post-run suggestion
 * to deconstruct the uploaded creatives and re-run analysis. Stored as
 * `<kind>:<accountId>` — the bare account id remains the "source" key so
 * dismissals recorded before kinds existed still hold.
 */
export type CreativeNudgeKind = "source" | "next_step";

function keyFor(accountId: string, kind: CreativeNudgeKind): string {
  return kind === "source" ? accountId : `${kind}:${accountId}`;
}

export function dismissCreativeNudge(accountId: string, kind: CreativeNudgeKind = "source"): void {
  const cur = load();
  const key = keyFor(accountId, kind);
  if (cur.includes(key)) return;
  save([...cur, key]);
}

export function useCreativeNudgeDismissed(
  accountId: string | null | undefined,
  kind: CreativeNudgeKind = "source",
): boolean {
  const ids = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    load,
    load,
  );
  return accountId ? ids.includes(keyFor(accountId, kind)) : false;
}
