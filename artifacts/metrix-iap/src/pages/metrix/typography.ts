// ─── Typography role scale ────────────────────────────────────────────
// Platform-wide text-density roles for seed-hydrated Metrix pages.
// Every card/tile body should compose from these constants instead of
// ad-hoc arbitrary sizes (no more 10.5/11.5/12.5px drift between views).
//
// Anatomy of a standard tile:
//   micro index    → TYPE.microLabel (mono 9px — strip labels like "Spend"/"Results")
//   eyebrow/index  → TYPE.label
//   title          → TYPE.title
//   body prose     → TYPE.body (clamped via <DenseText> when > ~2 sentences)
//   secondary/meta → TYPE.caption
//
// Utility classes are defined in index.css @layer utilities:
//   text-micro   → 9px (0.5625rem)
//   text-label   → 10px (0.625rem)
//   text-caption → 11px (0.6875rem)
//   text-body    → 12px (0.75rem) — same size as Tailwind text-xs
//   text-title   → 14px (0.875rem)
//   text-display → 21px (1.3125rem)
//
// Full literal class strings so the Tailwind JIT scanner picks them up.

export const TYPE = {
  /** Micro mono index/eyebrow labels below TYPE.label (e.g. "Spend"/"Results"
   *  strip labels, run-scope captions) — the formal home for the 9px
   *  font-mono uppercase pattern that was previously hand-copied as raw
   *  text-micro classes across several files. */
  microLabel: "text-micro font-mono font-semibold uppercase tracking-widest text-muted-foreground/60",
  /** Uppercase eyebrow/section labels above titles or field groups.
   *  text-data-caption = DS muted-foreground @85% — intentional secondary, solid step. */
  label: "text-label font-semibold uppercase tracking-widest text-data-caption",
  /** Card / list-item titles. Bold is the one enforced title weight
   *  platform-wide — matches SectionCard's own hardcoded <h3>. */
  title: "text-title font-bold text-foreground leading-snug",
  /** Primary body prose inside cards and tiles.
   *  text-data-body = DS foreground @88% — clear readable prose, solid step. */
  body: "text-body leading-relaxed text-data-body",
  /** Secondary/supporting prose: descriptions, sublines, meta text.
   *  text-data-label = DS muted-foreground — crisp secondary text, solid step. */
  caption: "text-caption leading-relaxed text-data-label",
} as const;

// ─── Dialog title ────────────────────────────────────────────────────
// The one size every <DialogTitle> in the app should use, overriding the
// shared Dialog component's own default (text-lg/18px, command-deck's
// dialog.tsx). Formalizes what was already the majority convention —
// PlacementsView, KpiDrilldownModal, SegmentDrilldownModal,
// VariableDrilldownModal, and SegmentGridModal all independently arrived
// at this exact class combo; a handful of other dialogs used raw
// text-base (16px) or text-sm (14px) instead. One size for one role.
export const DIALOG = {
  title: "text-callout font-semibold text-foreground",
} as const;
