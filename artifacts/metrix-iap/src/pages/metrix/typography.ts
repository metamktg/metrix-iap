// ─── Typography role scale ────────────────────────────────────────────
// Platform-wide text-density roles for seed-hydrated Metrix pages.
// Every card/tile body should compose from these constants instead of
// ad-hoc arbitrary sizes (no more 10.5/11.5/12.5px drift between views).
//
// Anatomy of a standard tile:
//   eyebrow/index  → TYPE.label
//   title          → TYPE.title
//   body prose     → TYPE.body (clamped via <DenseText> when > ~2 sentences)
//   secondary/meta → TYPE.caption
//   micro chips    → existing 9–10px registry chips (unchanged)
//
// Utility classes are defined in index.css @layer utilities:
//   text-label   → 10px (0.625rem)
//   text-caption → 11px (0.6875rem)
//   text-body    → 12px (0.75rem) — same size as Tailwind text-xs
//   text-title   → 13px (0.8125rem)
//   text-display → 21px (1.3125rem)
//
// Full literal class strings so the Tailwind JIT scanner picks them up.

export const TYPE = {
  /** Uppercase eyebrow/section labels above titles or field groups.
   *  text-data-caption = #8796ac, 6.5:1 — intentional secondary, solid (no opacity blend). */
  label: "text-label font-semibold uppercase tracking-widest text-data-caption",
  /** Card / list-item titles. */
  title: "text-title font-semibold text-foreground leading-snug",
  /** Primary body prose inside cards and tiles.
   *  text-data-body = #c6d2e5, 12.9:1 — clear readable prose, solid. */
  body: "text-body leading-relaxed text-data-body",
  /** Secondary/supporting prose: descriptions, sublines, meta text.
   *  text-data-label = #aab6ca, 9.6:1 — crisp secondary text, solid (no opacity blend). */
  caption: "text-caption leading-relaxed text-data-label",
} as const;
