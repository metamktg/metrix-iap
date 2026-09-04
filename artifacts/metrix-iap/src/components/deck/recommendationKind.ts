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

export const KIND_LABEL: Record<string, string> = {
  avoid: "Retire",
  scale: "Scale",
  budget: "Budget",
  investigate: "Investigate",
  optimize: "Optimize",
  validate: "Validate",
  test: "Test",
  data: "Data",
};

export const KIND_STYLE: Record<string, string> = {
  avoid: "border-status-danger/25 bg-status-danger/10 text-status-danger",
  scale: "border-status-success/25 bg-status-success/10 text-status-success",
  budget: "border-primary/25 bg-primary/10 text-interactive",
  investigate: "border-status-warning/25 bg-status-warning/10 text-status-warning",
  optimize: "border-status-warning/25 bg-status-warning/10 text-status-warning",
  validate: "border-border/40 bg-muted text-muted-foreground/75",
  test: "border-primary/25 bg-primary/10 text-interactive",
  data: "border-status-warning/25 bg-status-warning/10 text-status-warning",
};

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
