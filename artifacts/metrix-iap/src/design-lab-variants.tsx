// ─── Design Lab · prototype variants ────────────────────────────────────
//
// Three real renderings of the recommendation tile, the surface a reader
// opens first on every command centre, behind a picker. Each is the same
// data, the same tokens and the same rail; what differs is the hierarchy
// the tile leads with. The owner picks one; the pick becomes the
// RecommendationSlider tile. Until then the shipped tile is variant A.
//
//   A  Verb first       chip · title · number · reason · link   (shipped today)
//   B  Number first     the figure is the headline; the verb is the eyebrow
//   C  Sentence first   one line that reads as an instruction, evidence under it
//
// Dev-only: served by vite at /design-lab.html, never in the production
// bundle (vite's input is index.html alone).

import { useState } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { CrossLink } from "@/pages/metrix/shared";
import { RecommendationSlider } from "@/components/deck/RecommendationSlider";
import type { DerivedRecommendation } from "@/lib/data/recommendations";

const RECS: DerivedRecommendation[] = [
  {
    id: "derived:avoid:0", title: "BOOK0 C3 (any variation): zero conversions on real spend",
    rationale: "$287 spent, 0 results, no conversions recorded.",
    recommendedAction: "Stop funding this combination and redirect the budget to a lane the rows support.",
    impact: "high", confidence: "high", scope: "campaign", actionGroup: "Budget actions",
    href: "/app/strategy/map", hrefLabel: "Why the playbook retires it",
    metric: { label: "Spend, no result", value: "$287" }, source: "strategy.scaling_playbook.avoid_combinations", stage: 3, derived: true,
  },
  {
    id: "derived:scale:0", title: "BOOK0 Concept C2 (esp. Row B)",
    rationale: "$2,332 spent, 329 results, $7.09 per result. The account's best cost per result on real volume.",
    recommendedAction: "Increase budget on this concept and hold its variable stack constant while it scales.",
    impact: "high", confidence: "high", scope: "concept", actionGroup: "Budget actions",
    href: "/app/analysis/library?tab=cells", hrefLabel: "See the cells behind it",
    metric: { label: "Cost per result", value: "$7.09" }, source: "strategy.scaling_playbook.scale_now", stage: 3, derived: true,
  },
  {
    id: "derived:investigate:0", title: "No results on BOOK2_LEAD_JUN26_QUIZ_V1",
    rationale: "Confirm MMP/pixel before concluding creative failure (validation required).",
    recommendedAction: "Confirm the conversion is being recorded before concluding the creative failed.",
    impact: "high", confidence: "validation required", scope: "campaign", actionGroup: "Data actions",
    href: "/app/analysis/findings", hrefLabel: "Open findings",
    metric: { label: "Spend, no result", value: "$787" }, source: "intelligence.failure_patterns", stage: 2, derived: true,
  },
];

const KIND: Record<string, { label: string; cls: string }> = {
  avoid: { label: "Retire", cls: "border-status-danger/25 bg-status-danger/10 text-status-danger" },
  scale: { label: "Scale", cls: "border-status-success/25 bg-status-success/10 text-status-success" },
  investigate: { label: "Investigate", cls: "border-status-warning/25 bg-status-warning/10 text-status-warning" },
};
const kindOf = (r: DerivedRecommendation) => r.id.split(":")[1] ?? "";

function Chip({ kind }: { kind: string }) {
  const k = KIND[kind] ?? { label: kind, cls: "border-border/40 bg-muted text-muted-foreground/75" };
  return <span className={cn(TYPE.microLabel, "border px-1.5 py-0.5 rounded-full font-semibold normal-case tracking-normal leading-none", k.cls)}>{k.label}</span>;
}

/** B · number first */
function TileNumberFirst({ rec }: { rec: DerivedRecommendation }) {
  return (
    <article className="snap-start shrink-0 w-[268px] rounded-xl border border-border/40 bg-foreground/[0.02] p-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5"><Chip kind={kindOf(rec)} /><span className={cn(TYPE.microLabel, "ml-auto text-muted-foreground/75")}>{rec.metric?.label ?? "No figure"}</span></div>
      <div className="text-h3 font-bold text-foreground metric-num tabular-nums leading-none">{rec.metric?.value ?? "–"}</div>
      <h4 className={cn(TYPE.body, "font-medium text-foreground/90 leading-snug line-clamp-2")}>{rec.title}</h4>
      <p className={cn(TYPE.caption, "text-muted-foreground/85 leading-snug line-clamp-2")}>{rec.rationale}</p>
      {rec.href && <div className="mt-auto pt-1"><CrossLink to={rec.href} label={rec.hrefLabel ?? "See the evidence"} /></div>}
    </article>
  );
}

/** C · sentence first */
function TileSentenceFirst({ rec }: { rec: DerivedRecommendation }) {
  return (
    <article className="snap-start shrink-0 w-[268px] rounded-xl border border-border/40 bg-foreground/[0.02] p-3.5 flex flex-col gap-2">
      <p className={cn(TYPE.body, "font-semibold text-foreground leading-snug line-clamp-3")}>{rec.recommendedAction}</p>
      <div className="flex items-center gap-1.5"><Chip kind={kindOf(rec)} /><span className={cn(TYPE.caption, "text-foreground/85 truncate")} title={rec.title}>{rec.title}</span></div>
      {rec.metric && (
        <div className="flex items-baseline gap-1.5"><span className="text-title text-foreground metric-num tabular-nums leading-none">{rec.metric.value}</span><span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{rec.metric.label}</span></div>
      )}
      {rec.href && <div className="mt-auto pt-1"><CrossLink to={rec.href} label={rec.hrefLabel ?? "See the evidence"} /></div>}
    </article>
  );
}

const VARIANTS = [
  { id: "A", label: "A · Verb first (shipped)", note: "chip, title, number, reason, link" },
  { id: "B", label: "B · Number first", note: "the figure is the headline; the verb is the eyebrow" },
  { id: "C", label: "C · Sentence first", note: "the instruction leads; the evidence sits under it" },
] as const;

export function RecommendationTileVariants() {
  const [variant, setVariant] = useState<"A" | "B" | "C">("A");
  return (
    <div className="space-y-3" data-testid="variant-picker">
      <div role="radiogroup" aria-label="Recommendation tile variant" className="flex items-center gap-1.5 flex-wrap">
        {VARIANTS.map((v) => (
          <button key={v.id} type="button" role="radio" aria-checked={variant === v.id} onClick={() => setVariant(v.id)} title={v.note}
            className={cn("pressable h-8 px-3 rounded-md border text-caption font-medium transition-colors", variant === v.id ? "border-primary/40 bg-primary/15 text-interactive" : "border-border/40 text-muted-foreground/75 hover:text-foreground")}>
            {v.label}
          </button>
        ))}
      </div>
      <p className={cn(TYPE.caption, "text-muted-foreground/75")}>{VARIANTS.find((v) => v.id === variant)?.note}</p>
      {variant === "A" ? (
        <RecommendationSlider recs={RECS} title="Next best actions" />
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1">
          {RECS.map((r) => variant === "B" ? <TileNumberFirst key={r.id} rec={r} /> : <TileSentenceFirst key={r.id} rec={r} />)}
        </div>
      )}
    </div>
  );
}
