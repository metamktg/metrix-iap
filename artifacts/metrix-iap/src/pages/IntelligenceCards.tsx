import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Brain, ChevronDown, CheckCircle2, Clock, AlertCircle,
  ArrowRight, DollarSign, Shield, Eye, BookOpen,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { INTELLIGENCE_CARDS, ANALYSIS_RUNS, REVIEW_EVENTS, APPROVAL_EVENTS } from "@/lib/mock-data";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import type {
  IntelligenceCard, CohortKey, ConfidenceLabel,
  EntityScope, ReviewStatus,
} from "@/lib/types";

// ─── Chip helpers ──────────────────────────────────────────────────────

function ConfidenceChip({ c }: { c: ConfidenceLabel }) {
  const map: Record<ConfidenceLabel, string> = {
    high: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    medium: "bg-yellow-400/10 border-yellow-400/20 text-yellow-400",
    validation_required: "bg-orange-400/10 border-orange-400/20 text-orange-400",
    insufficient: "bg-muted/50 border-border/40 text-muted-foreground",
  };
  const labels: Record<ConfidenceLabel, string> = {
    high: "High", medium: "Med", validation_required: "Validate", insufficient: "Insuff.",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none shrink-0", map[c])}>
      {labels[c]}
    </span>
  );
}

function SeverityChip({ s }: { s: string }) {
  const map: Record<string, string> = {
    Critical: "bg-red-500/10 border-red-500/20 text-red-400",
    High: "bg-orange-400/10 border-orange-400/20 text-orange-400",
    Medium: "bg-yellow-400/10 border-yellow-400/20 text-yellow-400",
    Low: "bg-muted border-border/40 text-muted-foreground",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none shrink-0", map[s] ?? map.Low)}>
      {s}
    </span>
  );
}

function ReviewChip({ s }: { s: ReviewStatus }) {
  const map: Record<ReviewStatus, string> = {
    needs_review: "bg-orange-400/10 border-orange-400/20 text-orange-400",
    reviewed: "bg-primary/10 border-primary/20 text-primary",
    approved: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    rejected: "bg-destructive/10 border-destructive/20 text-destructive",
  };
  const labels: Record<ReviewStatus, string> = {
    needs_review: "Needs Review",
    reviewed: "Reviewed",
    approved: "Approved",
    rejected: "Rejected",
  };
  const Icon = s === "approved" ? CheckCircle2 : s === "needs_review" ? AlertCircle : s === "reviewed" ? Eye : Clock;
  return (
    <span className={cn("flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none shrink-0", map[s])}>
      <Icon className="w-2.5 h-2.5" />
      {labels[s]}
    </span>
  );
}

function ScopeChip({ scope }: { scope: EntityScope }) {
  const map: Record<EntityScope, string> = {
    campaign: "text-blue-400 border-blue-400/20 bg-blue-400/8",
    ad_set: "text-indigo-400 border-indigo-400/20 bg-indigo-400/8",
    ad: "text-violet-400 border-violet-400/20 bg-violet-400/8",
    creative: "text-purple-400 border-purple-400/20 bg-purple-400/8",
    account: "text-muted-foreground border-border/40 bg-muted/40",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-mono font-medium leading-none shrink-0", map[scope])}>
      {scope}
    </span>
  );
}

// ─── Lifecycle derivation from event tables ────────────────────────────
// Derives effective review_status for an intelligence_card by joining:
//   approval_events (final approved state)
//   review_events   (intermediate reviewed/rejected state)
// Session overrides (approvedIds) take priority over event tables.

function deriveCardReviewStatus(cardId: string, sessionApproved: boolean): ReviewStatus {
  if (sessionApproved) return "approved";
  const approvalEvent = APPROVAL_EVENTS.find(
    a => a.entity_type === "intelligence_card" && a.entity_id === cardId
  );
  if (approvalEvent) return "approved";
  const reviewEvent = REVIEW_EVENTS
    .filter(r => r.entity_type === "intelligence_card" && r.entity_id === cardId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (reviewEvent) return reviewEvent.review_status;
  return "needs_review";
}

const COHORT_LABELS: Record<CohortKey, string> = {
  age_gender: "Age × Gender",
  placement: "Placement",
  device: "Device",
  creative_angle: "Creative Angle",
  funnel_stage: "Funnel Stage",
  language: "Language",
  geography: "Geography",
  audience_type: "Audience Type",
};

// ─── Card component ────────────────────────────────────────────────────

function ICardItem({ card, reviewStatus, onApprove, onRefer }: {
  card: IntelligenceCard;
  reviewStatus: ReviewStatus;
  onApprove: (id: string) => void;
  onRefer: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const canReferBSIL = card.entity_scope === "campaign" || card.entity_scope === "ad_set";
  const priorityColor: Record<string, string> = {
    Critical: "border-l-red-400",
    High: "border-l-orange-400",
    Medium: "border-l-yellow-400",
    Low: "border-l-muted-foreground",
  };

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-card overflow-hidden border-l-4 transition-all",
      priorityColor[card.priority] ?? "border-l-muted-foreground"
    )}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ScopeChip scope={card.entity_scope} />
            <ConfidenceChip c={card.confidence_grade} />
            <SeverityChip s={card.severity} />
            <ReviewChip s={reviewStatus} />
            {card.feeds_learning_registry && (
              <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-semibold leading-none">
                <BookOpen className="w-2 h-2" /> Learning Loop
              </span>
            )}
          </div>
          <div className="text-xs font-semibold text-foreground leading-snug">{card.title}</div>
          <div className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{card.evidence_summary}</div>
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform mt-0.5", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border/30 space-y-3 pt-3">
          <div>
            <div className="text-[10px] text-muted-foreground font-medium mb-1">Evidence</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{card.evidence_summary}</p>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Recommendation
            </div>
            <p className="text-[11px] text-foreground leading-relaxed">{card.recommendation}</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            {reviewStatus === "needs_review" && (
              <button
                onClick={() => onApprove(card.id)}
                className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors font-medium"
              >
                <CheckCircle2 className="w-3 h-3" /> Approve
              </button>
            )}
            {canReferBSIL && (
              <button
                onClick={() => onRefer(card.id)}
                className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors font-medium"
              >
                <DollarSign className="w-3 h-3" /> Refer to BSIL
              </button>
            )}
            <div className="ml-auto text-[9px] text-muted-foreground font-mono">
              {card.card_type.replace(/_/g, " ")} · {card.card_subtype.replace(/_/g, " ")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IntelligenceCards page ────────────────────────────────────────────

export function IntelligenceCards() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace.id;

  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [referredIds, setReferredIds] = useState<Set<string>>(new Set());
  const [filterCohort, setFilterCohort] = useState<string>("all");
  const [filterReview, setFilterReview] = useState<string>("all");

  const allCards = INTELLIGENCE_CARDS.filter(c => c.workspace_id === wsId);
  const runs = ANALYSIS_RUNS.filter(r => r.workspace_id === wsId);
  const latestRun = runs[0];

  // Get distinct cohort keys present in this workspace
  const cohortKeys = [...new Set(allCards.map(c => c.cohort_key))];

  // Derive effective review_status from event tables + session overrides
  const effectiveStatus = (cardId: string): ReviewStatus =>
    deriveCardReviewStatus(cardId, approvedIds.has(cardId));

  const filtered = allCards.filter(c => {
    if (filterCohort !== "all" && c.cohort_key !== filterCohort) return false;
    if (filterReview !== "all") {
      if (effectiveStatus(c.id) !== filterReview) return false;
    }
    return true;
  });

  // Group by cohort_key, sort within each group by priority then severity
  const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const grouped = new Map<CohortKey, IntelligenceCard[]>();
  for (const card of filtered) {
    const arr = grouped.get(card.cohort_key) ?? [];
    arr.push(card);
    grouped.set(card.cohort_key, arr);
  }
  // Sort within each group
  for (const [key, cards] of grouped) {
    grouped.set(key, cards.sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3) ||
      (PRIORITY_ORDER[a.severity] ?? 3) - (PRIORITY_ORDER[b.severity] ?? 3)
    ));
  }

  const needsReviewCount = allCards.filter(c => effectiveStatus(c.id) === "needs_review").length;

  function handleApprove(id: string) {
    setApprovedIds(s => new Set([...s, id]));
  }
  function handleRefer(id: string) {
    setReferredIds(s => new Set([...s, id]));
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-primary" />
              <h1 className="text-base font-bold text-foreground">Intelligence Cards</h1>
              {needsReviewCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-400/10 border border-orange-400/20 text-orange-400 font-semibold">
                  {needsReviewCount} needs review
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              IAP-generated signals grouped by cohort — organized by confidence grade and severity
            </p>
            <DataSourceBadge table="intelligence_cards, review_events" className="mt-2" />
          </div>
          {latestRun && (
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">From run</div>
              <div className="text-xs font-mono text-foreground">{latestRun.id}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{latestRun.date_range_start} – {latestRun.date_range_end}</div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">Cohort:</div>
          {["all", ...cohortKeys].map(k => (
            <button
              key={k}
              onClick={() => setFilterCohort(k)}
              className={cn(
                "text-[10px] px-2 py-1 rounded border transition-colors font-medium",
                filterCohort === k
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "border-border/40 text-muted-foreground hover:bg-white/5"
              )}
            >
              {k === "all" ? "All" : COHORT_LABELS[k as CohortKey] ?? k}
            </button>
          ))}
          <div className="w-px h-4 bg-border/50 mx-1" />
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">Status:</div>
          {["all", "needs_review", "reviewed", "approved"].map(s => (
            <button
              key={s}
              onClick={() => setFilterReview(s)}
              className={cn(
                "text-[10px] px-2 py-1 rounded border transition-colors font-medium",
                filterReview === s
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "border-border/40 text-muted-foreground hover:bg-white/5"
              )}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
        {grouped.size === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-2">
              <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">No intelligence cards for this workspace yet.</p>
              <p className="text-xs text-muted-foreground/60">Run a Full IAP Analysis to generate cards.</p>
            </div>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([cohortKey, cards]) => (
            <div key={cohortKey}>
              {/* Cohort group header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {COHORT_LABELS[cohortKey]}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary leading-none">
                    cohort_key: {cohortKey}
                  </span>
                </div>
                <div className="flex-1 h-px bg-border/30" />
                <span className="text-[10px] text-muted-foreground">{cards.length} cards</span>
              </div>
              <div className="space-y-2">
                {cards.map(card => (
                  <ICardItem
                    key={card.id}
                    card={card}
                    reviewStatus={effectiveStatus(card.id)}
                    onApprove={handleApprove}
                    onRefer={handleRefer}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
