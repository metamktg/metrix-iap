// ─── Performance tier → the four verbs ───────────────────────────────────
// The seed names a concept's performance tier in its own words ("1 - Scale
// Winners", "2 - Watch / Test", "3 - Optimize", "4 - Eliminate"). A reader
// meets it as one of the loop's four verbs (Retire · Scale · Optimize ·
// Validate), the seed's wording kept beside it for the title attr. It used
// to echo the seed string in uppercase ("ELIMINATE", "SCALE WINNERS"), a
// fifth and sixth vocabulary (audit round 7).

export interface TierBadge {
  label: string;
  cls: string;
  /** The tier as the run named it, when the label is a verb standing in for it. */
  raw: string | null;
}

export function tierBadge(tier: string | undefined): TierBadge {
  if (!tier) return { label: "–", cls: "bg-muted/40 text-muted-foreground/75 border-border/30", raw: null };
  const t = tier.toLowerCase();
  if (t.includes("1") || t.includes("scale") || t.includes("winner"))
    return { label: "Scale", cls: "bg-status-success/10 text-status-success border-status-success/25", raw: tier };
  if (t.includes("2") || t.includes("watch") || t.includes("test"))
    return { label: "Validate", cls: "bg-primary/10 text-interactive border-primary/25", raw: tier };
  if (t.includes("3") || t.includes("optim") || t.includes("limit"))
    return { label: "Optimize", cls: "bg-status-warning/10 text-status-warning border-status-warning/25", raw: tier };
  if (t.includes("4") || t.includes("elim") || t.includes("kill") || t.includes("fail"))
    return { label: "Retire", cls: "bg-status-danger/10 text-status-danger border-status-danger/25", raw: tier };
  return { label: tier, cls: "bg-muted/40 text-muted-foreground/75 border-border/30", raw: null };
}
