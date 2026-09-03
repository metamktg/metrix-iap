// ─── Recommendations derived from what the account actually carries ───
//
// THE PROBLEM THIS SOLVES
// Every recommendation surface in the product — the Next Best Action hero,
// the swipe deck, the Action Queue — reads `iap.optimization_loop
// .recommendation_cards`. That array is written only by the Optimization
// Loop stage, which is execute-on-command and has never run for any account
// in the deployment. So four surfaces render an empty state on an account
// whose JSON is full of direction: a scaling playbook naming the concepts to
// scale and the combinations to avoid, a hypothesis queue with success
// criteria, failure patterns with the exact spend that produced nothing.
//
// The loop stage is not what makes that direction real. The rows are. This
// module reads them and emits the same `DeckCard` shape those surfaces
// already consume, so the empty schema fills without any of them changing.
//
// THE RULES IT WORKS UNDER
//  · Nothing is invented. A card's numbers come from a row; when the rows
//    carry no number for a reference the strategy names, the card says the
//    strategy named it and the rows do not — it never shows a zero.
//  · Every card names its source JSON, and links to the surface where the
//    evidence lives. A recommendation you cannot check is an opinion.
//  · `confidence` carries the engine's own grade where one exists
//    (concept_rollup.confidence_level / confidence). A hypothesis has no
//    grade because it has not been run: it reads "untested", which is a
//    statement of its epistemic state, not a fabricated score.
//  · Generated cards win. If the Optimization Loop HAS run, its cards come
//    first and derived ones follow, deduped — a real generated card is
//    better evidence than anything derived here.
//  · Cost per result, never ROAS or purchases: the terminal metric comes
//    from the rows' own result events.

import type { DeckCard } from "@/components/deck/RecommendationDeck";
import type { AdAccount, ConceptRollupRow, RecommendationCard, SeedImpact } from "./seedTypes";
import { scopeToRun } from "@/lib/run-supersede";
import { parseHierarchyRef } from "@/lib/normalize";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";

export interface DerivedRecommendation extends DeckCard {
  /** Where the evidence lives — a real in-app route, or null when none fits. */
  href: string | null;
  hrefLabel: string | null;
  /** The measured number that carries the card, already formatted. Null when
   *  the account's rows carry none — the card then says so in words. */
  metric: { label: string; value: string } | null;
  /** Which part of the account JSON produced this card. */
  source: string;
  /** IAP loop stage (1–6) the card belongs to, for the stage numeral. */
  stage: number | null;
  /** True for cards this module derived rather than the loop generating. */
  derived: boolean;
}

/** Cards are ordered by how much of the account's money the finding moves. */
const KIND_ORDER = ["avoid", "scale", "budget", "investigate", "optimize", "validate", "test", "data"] as const;

function conceptRollupFor(
  rollup: ConceptRollupRow[],
  ref: { book?: string; concept: string },
): ConceptRollupRow[] {
  return rollup.filter(
    (r) =>
      r.concept != null &&
      // "C2B" in the playbook matches the C2B rollup row and, failing that,
      // the C2 row it belongs to — a book prefix narrows further when given.
      (r.concept === ref.concept || ref.concept.startsWith(r.concept)) &&
      (!ref.book || r.book === ref.book),
  );
}

interface RefEvidence {
  spend: number;
  results: number;
  cpa: number | null;
  confidence: string | null;
  rows: number;
}

function evidenceForRef(rollup: ConceptRollupRow[], label: string): RefEvidence | null {
  const parsed = parseHierarchyRef(label);
  const ref = parsed?.refs[0];
  // A ref with no concept ("Male 55-64 dedicated creative") is a real
  // playbook entry that names no rollup row — no measurement, not an error.
  if (!ref?.concept) return null;
  const rows = conceptRollupFor(rollup, { book: ref.book, concept: ref.concept });
  if (rows.length === 0) return null;
  const spend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
  const results = rows.reduce((s, r) => s + (r.results ?? 0), 0);
  return {
    spend,
    results,
    cpa: results > 0 ? spend / results : null,
    // The engine's own grade, never a computed stand-in.
    confidence: rows.find((r) => r.confidence_level)?.confidence_level ?? rows.find((r) => r.confidence)?.confidence ?? null,
    rows: rows.length,
  };
}

/** A measured line, or an honest statement that the rows carry no number. */
function evidenceLine(ev: RefEvidence | null): string {
  if (!ev) return "The strategy names this reference; the account's rollup rows carry no measurement for it.";
  const bits = [`${fmtUSD(ev.spend, 0)} spent`, `${fmtNum(ev.results)} results`];
  if (ev.cpa != null) bits.push(`${fmtUSD(ev.cpa)} per result`);
  else bits.push("no conversions recorded");
  return bits.join(" · ");
}

function metricFor(ev: RefEvidence | null): DerivedRecommendation["metric"] {
  if (!ev) return null;
  if (ev.cpa != null) return { label: "Cost per result", value: fmtUSD(ev.cpa) };
  if (ev.spend > 0) return { label: "Spend, no result", value: fmtUSD(ev.spend, 0) };
  return null;
}

function scopeOf(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("placement") || l.includes("audience network")) return "placement";
  if (l.includes("budget") || l.includes("spend")) return "campaign";
  return "creative";
}

/**
 * Recommendations for an account, generated cards first.
 *
 * `deriveRecommendations` is pure: same account in, same cards out, in the
 * same order. Nothing here reads the clock or the DOM.
 */
export function deriveRecommendations(account: AdAccount | null | undefined): DerivedRecommendation[] {
  const iap = account?.iap;
  if (!iap) return [];

  const out: DerivedRecommendation[] = [];

  // ── Generated cards win, unchanged ────────────────────────────────────
  for (const c of iap.optimization_loop?.recommendation_cards ?? []) {
    out.push({
      id: c.id,
      title: c.title,
      rationale: c.rationale,
      recommendedAction: c.recommended_action,
      impact: c.impact,
      confidence: c.confidence,
      scope: c.scope,
      actionGroup: "Generated",
      href: "/app/act/queue",
      hrefLabel: "Open the action queue",
      metric: null,
      source: "optimization_loop.recommendation_cards",
      stage: 6,
      derived: false,
    });
  }

  const analysis = iap.analysis;
  // concept_rollup keeps one row per run — scope before reading a number off
  // it, or the same spend counts once per run.
  const rollup = scopeToRun(analysis?.concept_rollup ?? [], analysis?.latest_analysis_run_id ?? null);
  const playbook = iap.strategy?.scaling_playbook;

  // ── Avoid: the money the account is losing, first ─────────────────────
  for (const [i, label] of (playbook?.avoid_combinations ?? []).entries()) {
    const ev = evidenceForRef(rollup, label);
    out.push({
      id: `derived:avoid:${i}`,
      title: label,
      rationale: evidenceLine(ev),
      recommendedAction: "Stop funding this combination and redirect the budget to a lane the rows support.",
      impact: "high",
      confidence: ev?.confidence ?? "stated by the strategy map",
      scope: scopeOf(label),
      actionGroup: "Budget actions",
      href: "/app/strategy/map",
      hrefLabel: "See the scaling playbook",
      metric: metricFor(ev),
      source: "strategy.scaling_playbook.avoid_combinations",
      stage: 3,
      derived: true,
    });
  }

  // ── Scale: what the rows say is working ───────────────────────────────
  for (const [i, label] of (playbook?.scale_now ?? []).entries()) {
    const ev = evidenceForRef(rollup, label);
    out.push({
      id: `derived:scale:${i}`,
      title: label,
      rationale: evidenceLine(ev),
      recommendedAction: "Increase budget on this concept and hold its variable stack constant while it scales.",
      impact: "high",
      confidence: ev?.confidence ?? "stated by the strategy map",
      scope: "creative",
      actionGroup: "Budget actions",
      href: "/app/analysis/library?tab=cells",
      hrefLabel: "See the cells behind it",
      metric: metricFor(ev),
      source: "strategy.scaling_playbook.scale_now",
      stage: 3,
      derived: true,
    });
  }

  // ── Investigate: spend that produced nothing ──────────────────────────
  // Ad-level patterns arrive one per ad — nineteen of them on the validated
  // account, all saying the same thing. Nineteen identical tiles is noise,
  // not direction, so they are grouped by the engine's own diagnosis and the
  // card carries the count and the summed spend (both real sums of real
  // rows). Campaign- and placement-level patterns stay whole: each names a
  // different thing to go and look at.
  // `intelligence` is typed as an open record in the seed contract, so the
  // shape is checked here rather than asserted.
  const rawPatterns = (iap.intelligence as Record<string, unknown> | undefined)?.failure_patterns;
  const failurePatterns: Record<string, unknown>[] = Array.isArray(rawPatterns)
    ? (rawPatterns as Record<string, unknown>[])
    : [];
  const coveredCampaigns = new Set<string>();
  const adLevel = new Map<string, { count: number; wasted: number }>();
  let investigateIdx = 0;
  for (const f of failurePatterns) {
    const wasted = typeof f.wasted_spend === "number" ? f.wasted_spend : typeof f.spend === "number" ? f.spend : null;
    const diagnosis = typeof f.diagnosis === "string" ? f.diagnosis : "";
    const campaign = typeof f.campaign === "string" ? f.campaign : null;
    const placement = typeof f.placement === "string" ? f.placement : null;
    const segment = typeof f.segment_type === "string" ? f.segment_type : "campaign";

    if (segment === "ad") {
      const prev = adLevel.get(diagnosis) ?? { count: 0, wasted: 0 };
      adLevel.set(diagnosis, { count: prev.count + 1, wasted: prev.wasted + (wasted ?? 0) });
      continue;
    }
    if (campaign) coveredCampaigns.add(campaign);
    const subject = campaign ?? placement ?? "this segment";
    out.push({
      id: `derived:investigate:${investigateIdx++}`,
      title: campaign ? `No results on ${campaign}` : placement ? `Reach without result · ${placement}` : "Spend with no recorded result",
      rationale: diagnosis || "The account recorded spend against this segment and no results.",
      recommendedAction: diagnosis.startsWith("traffic_quality")
        ? `Exclude ${subject} from the delivery mix and re-read the remaining placements.`
        : "Confirm the conversion is being recorded before concluding the creative failed — a broken signal and a failed creative look identical here.",
      impact: "high",
      confidence: diagnosis.includes("validation_required") ? "validation required" : "recorded",
      scope: segment,
      actionGroup: "Data actions",
      href: "/app/analysis/findings",
      hrefLabel: "Open findings",
      metric: wasted != null && wasted > 0 ? { label: "Spend, no result", value: fmtUSD(wasted, 0) } : null,
      source: "intelligence.failure_patterns",
      stage: 2,
      derived: true,
    });
  }
  for (const [diagnosis, g] of adLevel) {
    out.push({
      id: `derived:investigate:ads:${diagnosis || "unstated"}`,
      title: `${g.count} ad${g.count === 1 ? "" : "s"} spent with no recorded result`,
      rationale: diagnosis
        ? `${diagnosis} — summed across ${g.count} ad${g.count === 1 ? "" : "s"}.`
        : `Recorded across ${g.count} ad${g.count === 1 ? "" : "s"} with no stated diagnosis.`,
      recommendedAction:
        "Check the conversion signal for these ads before retiring their creative — engagement without a recorded result is the tracking signature, not a creative verdict.",
      impact: "high",
      confidence: diagnosis.includes("validation_required") ? "validation required" : "recorded",
      scope: "creative",
      actionGroup: "Data actions",
      href: "/app/analysis/findings",
      hrefLabel: "Open findings",
      metric: g.wasted > 0 ? { label: "Spend, no result", value: fmtUSD(g.wasted, 0) } : null,
      source: "intelligence.failure_patterns",
      stage: 2,
      derived: true,
    });
  }

  // ── Optimize / validate: the middle of the playbook ───────────────────
  for (const [i, label] of (playbook?.optimize ?? []).entries()) {
    const ev = evidenceForRef(rollup, label);
    out.push({
      id: `derived:optimize:${i}`,
      title: label,
      rationale: evidenceLine(ev),
      recommendedAction: "Iterate the weakest variable in this concept's stack rather than retiring the concept.",
      impact: "medium",
      confidence: ev?.confidence ?? "stated by the strategy map",
      scope: "creative",
      actionGroup: "Creative actions",
      href: "/app/analysis/library?tab=variables",
      hrefLabel: "See its variables",
      metric: metricFor(ev),
      source: "strategy.scaling_playbook.optimize",
      stage: 3,
      derived: true,
    });
  }
  for (const [i, label] of (playbook?.validate ?? []).entries()) {
    out.push({
      id: `derived:validate:${i}`,
      title: label,
      rationale: "Named for validation by the strategy map — not yet measured at a volume that would settle it.",
      recommendedAction: "Fund this as a test cell with enough volume to reach a read.",
      impact: "medium",
      confidence: "unvalidated",
      scope: "creative",
      actionGroup: "Creative actions",
      href: "/app/mst/sprints",
      hrefLabel: "Open the sprint matrix",
      metric: null,
      source: "strategy.scaling_playbook.validate",
      stage: 5,
      derived: true,
    });
  }

  // ── Test: the hypothesis queue ────────────────────────────────────────
  for (const [i, h] of (iap.strategy?.active_hypotheses ?? []).entries()) {
    const criteria = typeof h.success_criteria === "string" ? h.success_criteria : null;
    out.push({
      id: `derived:test:${h.id ?? i}`,
      title: typeof h.label === "string" ? h.label : `Hypothesis ${h.id ?? i + 1}`,
      rationale: [criteria && `Success criteria: ${criteria}`, typeof h.isolated_variable === "string" ? `Isolates: ${h.isolated_variable}` : null]
        .filter(Boolean)
        .join(" · ") || "A queued hypothesis with no stated criteria.",
      recommendedAction:
        typeof h.test_variant === "string" && h.test_variant ? h.test_variant : "Run this as the next sprint's isolated test.",
      impact: "medium",
      // A hypothesis has no grade because it has not been run. Saying so is
      // more useful than borrowing a number from somewhere else.
      confidence: "untested",
      scope: "creative",
      actionGroup: "Test actions",
      href: "/app/strategy/hypotheses",
      hrefLabel: "Open the hypothesis queue",
      metric: criteria ? { label: "Target", value: criteria.replace(/^.*?(CPA[^,]*|CVR[^,]*).*$/i, "$1").slice(0, 24) } : null,
      source: "strategy.active_hypotheses",
      stage: 5,
      derived: true,
    });
  }

  // ── Data: anomalies the import itself recorded ────────────────────────
  for (const [i, q] of (iap.data_quality ?? []).entries()) {
    if (q.kind !== "anomaly") continue;
    if (String(q.priority) !== "critical") continue;
    const campaign = typeof q.campaign === "string" ? q.campaign : null;
    // A failure pattern already covers this campaign in full — two cards for
    // one fact is noise, and the failure pattern carries the diagnosis.
    if (campaign && coveredCampaigns.has(campaign)) continue;
    const spend = typeof q.spend === "number" ? q.spend : null;
    out.push({
      id: `derived:data:${i}`,
      title: campaign ? `Check the signal on ${campaign}` : `Data anomaly · ${String(q.type ?? q.kind)}`,
      rationale: `The import flagged ${String(q.type ?? "an anomaly")} at critical priority.`,
      recommendedAction: "Confirm the conversion signal for this campaign before reading its creative performance.",
      impact: "high",
      confidence: "recorded",
      scope: "campaign",
      actionGroup: "Data actions",
      href: "/app/analysis",
      hrefLabel: "Open the analysis centre",
      metric: spend != null && spend > 0 ? { label: "Spend affected", value: fmtUSD(spend, 0) } : null,
      source: "data_quality",
      stage: 1,
      derived: true,
    });
  }

  // ── Budget note: the strategy's own reallocation sentence ─────────────
  const note = playbook?.budget_reallocation_note;
  if (typeof note === "string" && note.trim()) {
    out.push({
      id: "derived:budget:note",
      title: "Budget reallocation",
      rationale: note,
      recommendedAction: note,
      impact: "medium",
      confidence: "stated by the strategy map",
      scope: "campaign",
      actionGroup: "Budget actions",
      href: "/app/strategy/map",
      hrefLabel: "See the playbook",
      metric: null,
      source: "strategy.scaling_playbook.budget_reallocation_note",
      stage: 3,
      derived: true,
    });
  }

  // Generated cards keep their position at the head; derived cards sort by
  // kind, which is ordered by how much of the account's money each moves.
  const kindOf = (id: string) => id.split(":")[1] ?? "";
  const rank = (r: DerivedRecommendation) => {
    if (!r.derived) return 0;
    const i = KIND_ORDER.indexOf(kindOf(r.id) as (typeof KIND_ORDER)[number]);
    // An unrecognised kind sorts last rather than first — the budget note
    // led the whole deck when -1 + 1 tied it with the generated cards.
    return i === -1 ? KIND_ORDER.length + 1 : i + 1;
  };
  return out
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r);
}

/** The deck's own shape, for the surfaces that take `DeckCard[]`. */
export function toDeckCards(recs: DerivedRecommendation[]): DeckCard[] {
  return recs.map(({ href: _href, hrefLabel: _l, metric: _m, source: _s, stage: _st, derived: _d, ...card }) => card);
}

/**
 * The cards belonging to one IAP loop stage — what a command centre for that
 * stage should carry. Stage-less cards (a generated card with no stage) are
 * never silently dropped into a stage they did not come from.
 */
export function recommendationsForStage(recs: DerivedRecommendation[], stage: number): DerivedRecommendation[] {
  return recs.filter((r) => r.stage === stage);
}

/**
 * The seed's own `RecommendationCard` shape, for surfaces that consume the
 * raw loop array (the Action Queue, the Listen recommendations view). The
 * derivation's source lands in `source_path`, which the shape already has —
 * so a card in the queue can still say where it came from.
 */
export function toLoopCards(recs: DerivedRecommendation[], accountId: string): RecommendationCard[] {
  return recs.map((r) => ({
    id: r.id,
    account_id: accountId,
    scope: r.scope,
    title: r.title,
    rationale: r.rationale,
    impact: r.impact as SeedImpact,
    confidence: r.confidence,
    source_path: r.source,
    recommended_action: r.recommendedAction,
  }));
}
