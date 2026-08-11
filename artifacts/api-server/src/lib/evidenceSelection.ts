// ─── Evidence-pack row selection ──────────────────────────────────────
// Pure, dependency-free row-ranking helpers for the strategy/brief evidence
// packs. Deliberately kept out of generationEngine.ts: that module imports
// the Anthropic client, which throws at import time when the AI integration
// isn't provisioned, so anything living there cannot be unit-tested without
// standing up an LLM environment. Selection logic decides what the model is
// allowed to see, which makes it exactly the kind of thing that must stay
// cheaply testable.

type Row = Record<string, any>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Rank rows by Results and cut to `cap` WITHOUT letting high-volume event
 * types crowd out low-volume ones.
 *
 * The performance tables carry one row per subject × `Result type`, and raw
 * `Results` counts are not comparable across event types: shallow events
 * (content views, app installs, registrations) outnumber deep ones
 * (checkouts, purchases) by orders of magnitude. A plain
 * `sort by Results, slice(cap)` therefore fills the evidence pack with the
 * shallowest event and can drop the deepest — the one closest to revenue —
 * entirely, with no signal to the model that anything was withheld. Measured
 * on a real 67-row bundle, a flat top-30 excluded both `onb_initiate_checkout`
 * and `Website trials started` outright and represented only 61% of spend.
 *
 * Instead: rank within each result type, then round-robin across types until
 * the cap is reached. Every event type present keeps representation, the
 * strongest rows of each still come first, and the cap is still respected.
 * Rows with no `Result type` group under one key rather than being dropped.
 */
export function topRowsPerResultType(rows: Row[], cap: number): Row[] {
  if (rows.length <= cap) {
    return [...rows].sort((a, b) => num(b["Results"]) - num(a["Results"]));
  }
  const byType = new Map<string, Row[]>();
  for (const r of rows) {
    const key = String(r["Result type"] ?? "");
    const list = byType.get(key) ?? [];
    list.push(r);
    byType.set(key, list);
  }
  const groups = [...byType.values()].map((g) =>
    [...g].sort((a, b) => num(b["Results"]) - num(a["Results"])),
  );
  const out: Row[] = [];
  for (let i = 0; out.length < cap; i++) {
    let tookAny = false;
    for (const g of groups) {
      const row = g[i];
      if (row === undefined) continue;
      out.push(row);
      tookAny = true;
      if (out.length >= cap) break;
    }
    if (!tookAny) break;
  }
  return out;
}
