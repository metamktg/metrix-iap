// ─── Recommendation vocabulary ────────────────────────────────────────
//
// One place for what a recommendation's kind is called, what tone it
// wears, and how impact tiers are tinted. The rail, the drawer and the
// swipe deck all read from here, so a "Retire" chip on the overview is the
// same word and the same colour as the one in the deck (owner, 2026-09-03:
// one loop shape, one vocabulary).
//
// Colour is a claim: the three status tones are reserved for the three
// things a reader must not miss (money being lost, money being made, a
// signal that needs checking). Everything else sits on the neutral scale.

// Four verbs, whatever the engine kind: Retire · Scale · Optimize ·
// Validate. The eight engine kinds map onto them (a budget move is an
// optimisation; an investigation, a test and a data check are all
// validation), and the engine kind itself stays on the chip's title attr
// for the reader who wants it (audit round 7; the rail showed "Budget",
// "Investigate", "Test" and "Data" as if the vocabulary had eight words).
export const KIND_LABEL: Record<string, string> = {
  avoid: "Retire",
  scale: "Scale",
  budget: "Optimize",
  investigate: "Validate",
  optimize: "Optimize",
  validate: "Validate",
  test: "Validate",
  data: "Validate",
};

const STYLE_RETIRE = "border-status-danger/25 bg-status-danger/10 text-status-danger";
const STYLE_SCALE = "border-status-success/25 bg-status-success/10 text-status-success";
const STYLE_OPTIMIZE = "border-status-warning/25 bg-status-warning/10 text-status-warning";
const STYLE_VALIDATE = "border-border/40 bg-muted text-muted-foreground/75";

export const KIND_STYLE: Record<string, string> = {
  avoid: STYLE_RETIRE,
  scale: STYLE_SCALE,
  budget: STYLE_OPTIMIZE,
  investigate: STYLE_VALIDATE,
  optimize: STYLE_OPTIMIZE,
  validate: STYLE_VALIDATE,
  test: STYLE_VALIDATE,
  data: STYLE_VALIDATE,
};

/** The engine kind behind a verb, for a title attr; null when the kind is the verb itself or unknown. */
export function engineKindNote(kind: string): string | null {
  if (!KIND_LABEL[kind] || KIND_LABEL[kind].toLowerCase() === kind) return null;
  return `Engine kind: ${kind}`;
}

export const KIND_STYLE_FALLBACK = "border-border/40 bg-muted text-muted-foreground/75";

export const IMPACT_STYLE: Record<string, string> = {
  high: "bg-status-danger/10 text-status-danger border-status-danger/20",
  medium: "bg-status-warning/10 text-status-warning border-status-warning/20",
  low: "bg-muted text-muted-foreground/75 border-border/40",
  setup: "bg-primary/10 text-interactive border-primary/20",
};

/**
 * The card's kind, read off the derived id (`derived:<kind>:…`). A card the
 * Optimization Loop generated has no derived kind and reads "generated".
 */
export function recommendationKind(rec: { id: string; derived?: boolean }): string {
  if (rec.derived === false || !rec.id.startsWith("derived:")) return "generated";
  return rec.id.split(":")[1] ?? "";
}
