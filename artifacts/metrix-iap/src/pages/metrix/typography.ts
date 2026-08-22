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
   *  platform-wide — see HEADING below for the full H1-H6 scale
   *  (SectionCard's own title is HEADING.h2, not this role). */
  title: "text-title font-bold text-foreground leading-snug",
  /** Primary body prose inside cards and tiles.
   *  text-data-body = DS foreground @88% — clear readable prose, solid step. */
  body: "text-body leading-relaxed text-data-body",
  /** Secondary/supporting prose: descriptions, sublines, meta text.
   *  text-data-label = DS muted-foreground — crisp secondary text, solid step. */
  caption: "text-caption leading-relaxed text-data-label",
} as const;

// ─── Heading hierarchy (H1–H6) ──────────────────────────────────────
// The formal, platform-wide header scale every module page's real DOM
// heading tree (<h1>…<h6>) must draw from — never a raw Tailwind text-*
// utility (text-sm/text-lg/etc.) on a heading element, and never a skipped
// level (an <h1> followed directly by an <h3> with no <h2> in between).
//
// Only H1–H3 correspond to actual heading elements in this app's tree —
// the structure is genuinely three levels deep (page → section → nested
// card/list item). H4–H6 name the same visual scale for smaller text that
// is deliberately NOT a heading tag (table column headers stay <th>,
// eyebrow labels and micro-indices stay <span>) — using <h4>/<h5>/<h6> on
// those would be incorrect HTML semantics, not more "hierarchical".
//
//   H1  .mx-section-header__title  28px bold   <h1>  ModuleHeader's page title (one per route)
//   H2  HEADING.h2                 17px bold   <h2>  SectionCard's title; a full-page empty/onboarding state's own heading
//   H3  TYPE.title                 14px bold   <h3>  a titled sub-card or list item nested inside a SectionCard body
//   H4  HEADING.h4                 11px semibold, uppercase  (not a heading tag) data-table column headers (<th>)
//   H5  TYPE.label                 10px semibold, uppercase  (not a heading tag) eyebrow labels above a title/field group
//   H6  TYPE.microLabel            9px mono, uppercase       (not a heading tag) micro-index strip labels ("Spend"/"Results")
export const HEADING = {
  /** SectionCard's own title, and any full-page empty/onboarding state's
   *  heading that sits directly under a route's H1 (ModuleHeader) — the
   *  first real content heading on the page besides the H1 itself. */
  h2: "text-cardtitle font-bold text-foreground leading-tight",
  /** Data-table / dense-list column-group headers. Not a heading tag —
   *  <th> already carries the correct table semantics — this is the H4
   *  visual step for the rare non-heading label that needs to read at
   *  that weight (e.g. a grouped table section header). */
  h4: "text-caption font-semibold uppercase tracking-widest text-data-caption",
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
