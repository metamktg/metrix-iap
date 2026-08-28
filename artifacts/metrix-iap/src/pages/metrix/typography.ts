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
//        H1 34 -> H2 22 (12) -> H3 18 (4) -> body 15 (3)
//      Below 13px the rule stops applying: 3px steps run out of readable
//      sizes almost at once (12 -> 9 -> 6). That band is CHROME — uppercase
//      micro-labels and eyebrows that separate by case, weight, tracking
//      and colour. Nothing carrying a sentence belongs there.
//
// The sizes, line-heights and tracking live in index.css @layer utilities:
//   text-micro   11px  chrome floor, index labels
//   text-label   12px  uppercase eyebrow; also data-table column headers
//   text-caption 13px  NON-SENTENCE metadata only (counts, units, dates)
//   text-body    15px  BODY FLOOR — every sentence, every paragraph
//   text-title   18px  H3 card / list-item title
//   text-callout 19px  dialog title
//   text-cardtitle 22px  H2 SectionCard title
//   text-display 25px · text-section 27px · text-stat 32px
//   text-bignum  34px  H1 page title / hero stat · text-h2 28px page-scale only
//
// ─── RULE 3: WEIGHT IS MONOTONIC WITH RANK ───────────────────────────
//
// Weight is the property that says "this outranks that", so it must never
// contradict the size ramp. Measured across the app before this rule
// existed, it contradicted it almost everywhere:
//
//   331 weight-emphasized elements in the 10-12px CHROME band
//    55 weight-emphasized elements at 17px and above
//
// Six to one — and worse than the ratio, the direction. Fifteen 11px
// uppercase eyebrows were font-BOLD while forty 17px card titles had been
// downgraded to font-semibold or font-medium at their call sites. An
// eyebrow was literally outranking the title it labelled. That is what
// "everything competes for attention" means mechanically: not too much
// text, but weight applied against the hierarchy instead of with it.
//
// The ceiling, by band:
//
//   10-12px CHROME LABEL   semibold max, NEVER bold. These already separate
//                          by case, tracking and colour — three signals —
//                          so weight is the fourth on an element that is
//                          subordinate by definition.
//   10-12px CHROME VALUE   bold is fine. A count badge or a set of initials
//                          is DATA, not a label, and it sits inside a
//                          coloured pill that already scopes it. The gate
//                          tells them apart by the `uppercase` class: a
//                          label is uppercased by CSS, a value is not.
//   14px BODY              regular, medium for genuine emphasis.
//   17px+ TITLE            bold, and never downgraded at a call site. The
//                          role already carries it; re-stating a lighter
//                          weight beside it is how the inversion happened.
//
// Enforced by scripts/src/check-optical-authority.ts.
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
  /** The smallest chrome: badge numerals and index labels below TYPE.label
   *  ("Spend"/"Results" strip labels, run-scope captions).
   *
   *  It used to be MONO. The mono face is gone from the product entirely —
   *  305 usages across 78 files — because it was doing two jobs and only
   *  one of them was real. The real job was aligning figures so columns of
   *  numbers do not jitter, and `tabular-nums` does that properly: it is a
   *  font-variant that makes the SANS's own digits equal-width, with none
   *  of the terminal aesthetic. The other job was decorative, and a
   *  measurement product that dresses its numbers as console output reads
   *  as a debug view rather than an instrument. */
  microLabel: "text-micro font-medium uppercase text-muted-foreground/75",
  /** Uppercase eyebrow/section labels above titles or field groups.
   *  text-data-caption = DS muted-foreground @85% — intentional secondary, solid step. */
  label: "text-label font-medium uppercase text-data-caption",
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
//   H1  .mx-section-header__title  34px bold   <h1>  ModuleHeader's page title (one per route)
//   H2  HEADING.h2                 22px bold   <h2>  SectionCard's title; a full-page empty/onboarding state's own heading
//   H3  TYPE.title                 18px bold   <h3>  a titled sub-card or list item nested inside a SectionCard body
//        ── body floor: 15px ── every sentence sits at or above this line
//   H4  HEADING.h4                 12px semibold, uppercase  (not a heading tag) data-table column headers (<th>)
//   H5  TYPE.label                 12px semibold, uppercase  (not a heading tag) eyebrow labels above a title/field group
//   H6  TYPE.microLabel            11px uppercase            (not a heading tag) micro-index strip labels ("Spend"/"Results")
//
// H4 and H5 share a size deliberately: both are chrome labels, and they are
// never siblings — one heads a table column, the other an eyebrow above a
// field group. They are told apart by position and context, not by size.
export const HEADING = {
  /** Route title (ModuleHeader). One per page — the biggest statement. */
  h1: "text-bignum font-h1 font-bold text-foreground leading-none text-balance",
  /** SectionCard's own title, and any full-page empty/onboarding state's
   *  heading that sits directly under a route's H1 (ModuleHeader) — the
   *  first real content heading on the page besides the H1 itself.
   *
   *  Size is text-cardtitle (22px), NOT text-h2 (28px). It briefly shipped
   *  as text-h2 and every module header on a route rendered one step under
   *  the page title itself — five or six 28px statements per screen, each
   *  louder than the data it framed. A section header orients; the page
   *  title (34px) states; the data leads. 22px keeps the full Outfit-bold
   *  authority while sitting clearly under the H1 and clearly over card
   *  titles (18px). text-h2 remains for genuine page-scale headings. */
  h2: "text-cardtitle font-h2 font-bold text-foreground leading-tight text-balance",
  /** A card or panel title inside a section. */
  h3: "text-h3 font-h3 font-bold text-foreground leading-snug text-balance",
  /** A group header inside a card — above a cluster of rows or fields. */
  h5: "text-h5 font-h5 font-bold text-foreground leading-snug text-balance",
  /** The smallest heading: an eyebrow above a field group. Chrome band,
   *  separated by case and tracking rather than size. */
  h6: "text-label font-h6 font-semibold uppercase text-data-caption",
  /** Data-table / dense-list column-group headers.
   *
   *  Moved from text-caption (12px) to text-label (11px) because it used to
   *  be the SAME size as TYPE.caption — a column header and the metadata
   *  beneath it rendering identically, which is the plainest form of two
   *  elements competing. It belongs in the chrome band: a column header
   *  labels a column, it does not title a section, so it separates by case,
   *  weight and tracking above 14px cells rather than by size. Not a
   *  heading tag — <th> already carries the right semantics. */
  h4: "text-label font-h4 font-semibold uppercase text-data-caption",
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
