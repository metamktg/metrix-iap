// ─── Typography role scale ────────────────────────────────────────────
// Platform-wide text roles for seed-hydrated Metrix pages. Every card and
// tile composes from these constants instead of ad-hoc sizes.
//
// TWO RULES GOVERN THE SCALE. Both are enforced by
// scripts/src/check-type-scale.ts, and both exist because the previous
// scale broke them:
//
//   1. THE BODY FLOOR IS 14px. Anything the reader takes in as a sentence
//      sits at 14px or above. Body prose used to be 12px under a 14px card
//      title — a 2px step, which asks the eye to work out the hierarchy
//      rather than handing it over.
//
//   2. A HEADER IS >= 3px ABOVE THE CONTENT IT LABELS.
//        H1 32 -> H2 21 (11) -> H3 17 (4) -> body 14 (3)
//      Below 12px the rule stops applying: 3px steps run out of readable
//      sizes almost at once (12 -> 9 -> 6). That band is CHROME — uppercase
//      micro-labels and eyebrows that separate by case, weight, tracking
//      and colour. Nothing carrying a sentence belongs there.
//
// The sizes, line-heights and tracking live in index.css @layer utilities:
//   text-micro   10px  chrome floor, mono index labels
//   text-label   11px  uppercase eyebrow; also data-table column headers
//   text-caption 12px  NON-SENTENCE metadata only (counts, units, dates)
//   text-body    14px  BODY FLOOR — every sentence, every paragraph
//   text-title   17px  H3 card / list-item title
//   text-callout 18px  dialog title
//   text-cardtitle 21px  H2 SectionCard title
//   text-display 24px · text-section 26px · text-stat 30px
//   text-bignum  32px  H1 page title / hero stat
//
// Choosing between caption and body: ask whether the text is a SENTENCE.
// "12 segments · updated Aug 3" is metadata and takes caption. "Clusters
// need results, so this grouping is empty" is a sentence and takes body,
// however short it looks in the mock.
//
// WRAPPING IS PART OF THE ROLE. Every heading carries text-balance and every
// prose role carries text-pretty, because both are decisions about the role
// rather than about the sentence:
//
//   balance  distributes a heading evenly across its lines. Without it a
//            two-line card title routinely breaks six words then one, which
//            is the commonest way a finished card still looks unfinished.
//   pretty   keeps a paragraph from ending on a single-word orphan.
//
// They were used once each in the whole app, against 40 rendered headings.
// Putting them on the roles means a new card gets them without anyone
// remembering to.
//
// Full literal class strings so the Tailwind JIT scanner picks them up.

export const TYPE = {
  /** Micro mono index/eyebrow labels below TYPE.label (e.g. "Spend"/"Results"
   *  strip labels, run-scope captions) — the formal home for the 9px
   *  font-mono uppercase pattern that was previously hand-copied as raw
   *  text-micro classes across several files. */
  microLabel: "text-micro font-mono font-semibold uppercase text-muted-foreground/75",
  /** Uppercase eyebrow/section labels above titles or field groups.
   *  text-data-caption = DS muted-foreground @85% — intentional secondary, solid step. */
  label: "text-label font-semibold uppercase text-data-caption",
  /** Card / list-item titles. Bold is the one enforced title weight
   *  platform-wide — see HEADING below for the full H1-H6 scale
   *  (SectionCard's own title is HEADING.h2, not this role). */
  title: "text-title font-h5 font-bold text-foreground leading-snug text-balance",
  /** Body prose inside cards and tiles — the 14px floor. Every sentence the
   *  product shows a user lands here or higher, including short ones.
   *  text-data-body = DS foreground @88% — clear readable prose. */
  body: "text-body font-body text-data-body text-pretty",
  /** NON-SENTENCE metadata: counts, units, dates, "3 of 11" coverage notes.
   *  Anything phrased as a sentence uses TYPE.body instead — 12px is below
   *  the body floor on purpose, and prose does not belong here.
   *  text-data-label = DS muted-foreground — crisp secondary text. */
  caption: "text-caption text-data-label",
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
//   H1  .mx-section-header__title  32px bold   <h1>  ModuleHeader's page title (one per route)
//   H2  HEADING.h2                 21px bold   <h2>  SectionCard's title; a full-page empty/onboarding state's own heading
//   H3  TYPE.title                 17px bold   <h3>  a titled sub-card or list item nested inside a SectionCard body
//        ── body floor: 14px ── every sentence sits at or above this line
//   H4  HEADING.h4                 11px semibold, uppercase  (not a heading tag) data-table column headers (<th>)
//   H5  TYPE.label                 11px semibold, uppercase  (not a heading tag) eyebrow labels above a title/field group
//   H6  TYPE.microLabel            10px mono, uppercase      (not a heading tag) micro-index strip labels ("Spend"/"Results")
//
// H4 and H5 share a size deliberately: both are chrome labels, and they are
// never siblings — one heads a table column, the other an eyebrow above a
// field group. They are told apart by position and context, not by size.
export const HEADING = {
  /** Route title (ModuleHeader). One per page — the biggest statement. */
  h1: "text-bignum font-h1 font-bold text-foreground leading-none text-balance",
  /** SectionCard's own title, and any full-page empty/onboarding state's
   *  heading that sits directly under a route's H1 (ModuleHeader) — the
   *  first real content heading on the page besides the H1 itself. */
  h2: "text-h2 font-h2 font-bold text-foreground leading-tight text-balance",
  /** A card or panel title inside a section. */
  h3: "text-h3 font-h3 font-semibold text-foreground leading-snug text-balance",
  /** A group header inside a card — above a cluster of rows or fields. */
  h5: "text-h5 font-h5 font-semibold text-foreground leading-snug text-balance",
  /** The smallest heading: an eyebrow above a field group. Chrome band,
   *  separated by case and tracking rather than size. */
  h6: "text-label font-h6 font-bold uppercase text-data-caption",
  /** Data-table / dense-list column-group headers.
   *
   *  Moved from text-caption (12px) to text-label (11px) because it used to
   *  be the SAME size as TYPE.caption — a column header and the metadata
   *  beneath it rendering identically, which is the plainest form of two
   *  elements competing. It belongs in the chrome band: a column header
   *  labels a column, it does not title a section, so it separates by case,
   *  weight and tracking above 14px cells rather than by size. Not a
   *  heading tag — <th> already carries the right semantics. */
  h4: "text-label font-h4 font-bold uppercase text-data-caption",
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
