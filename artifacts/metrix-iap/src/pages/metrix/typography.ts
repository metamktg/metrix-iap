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
// Full literal class strings so the Tailwind JIT scanner picks them up.

export const TYPE = {
  /** Uppercase eyebrow/section labels above titles or field groups. */
  label: "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70",
  /** Card / list-item titles. */
  title: "text-[13px] font-semibold text-foreground leading-snug",
  /** Primary body prose inside cards and tiles. */
  body: "text-[12px] text-foreground/85 leading-relaxed",
  /** Secondary/supporting prose: descriptions, sublines, meta text. */
  caption: "text-[11px] text-muted-foreground/80 leading-relaxed",
} as const;
