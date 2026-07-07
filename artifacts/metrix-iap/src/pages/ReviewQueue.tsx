import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CheckSquare, CheckCircle2, XCircle, Eye, BookOpen,
  ChevronDown, ArrowRight, Zap, FileText, Brain, DollarSign,
  Edit2, AlertCircle,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  INTELLIGENCE_CARDS, BSIL_SUGGESTIONS, BRIEFS, REPORTS,
  REVIEW_EVENTS, APPROVAL_EVENTS, HUMAN_EDITS,
} from "@/lib/mock-data";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import type { ReviewStatus, ApprovedFor, ReviewableEntityType } from "@/lib/types";

// ─── Lifecycle derivation ──────────────────────────────────────────────
// Derives effective review_status for a given entity from the event tables:
//   review_events (reviewed/approved/rejected)
//   approval_events (confirmed approval with approved_for scope)
// Priority: approval_event approved → "approved"
//           review_event approved  → "approved"
//           review_event reviewed  → "reviewed"
//           review_event rejected  → "rejected"
//           no event found         → "needs_review"

function deriveReviewStatus(
  entityType: ReviewableEntityType,
  entityId: string,
  overrides: Record<string, ReviewStatus>
): ReviewStatus {
  if (overrides[entityId]) return overrides[entityId];

  const approvalEvent = APPROVAL_EVENTS.find(
    a => a.entity_type === entityType && a.entity_id === entityId
  );
  if (approvalEvent) return "approved";

  // Find the most recent review event (sort by created_at desc)
  const reviewEventsForEntity = REVIEW_EVENTS
    .filter(r => r.entity_type === entityType && r.entity_id === entityId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (reviewEventsForEntity.length === 0) return "needs_review";
  return reviewEventsForEntity[0].review_status;
}

// ─── Shared types ──────────────────────────────────────────────────────

interface ReviewItem {
  id: string;
  entity_type: ReviewableEntityType;
  title: string;
  review_status: ReviewStatus;
  label?: string;
  extra?: string;
  approved_for?: ApprovedFor;
  reviewer?: string;
  edit_count: number;
}

// ─── Chips ────────────────────────────────────────────────────────────

function ReviewStatusChip({ s }: { s: ReviewStatus }) {
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
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none", map[s])}>
      {labels[s]}
    </span>
  );
}

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  intelligence_card: Brain,
  bsil_suggestion: DollarSign,
  creative_brief: FileText,
  report: BookOpen,
};

const APPROVED_FOR_OPTIONS: { value: ApprovedFor; label: string; isLearningLoop: boolean }[] = [
  { value: "internal_use", label: "Internal Use", isLearningLoop: false },
  { value: "client_report", label: "Client Report", isLearningLoop: false },
  { value: "creative_brief", label: "Creative Brief", isLearningLoop: false },
  { value: "strategy_export", label: "Strategy Export", isLearningLoop: false },
  { value: "learning_registry", label: "Feeds Optimization Loop", isLearningLoop: true },
];

// ─── ReviewRow component ───────────────────────────────────────────────

function ReviewRow({ item, onAction }: {
  item: ReviewItem;
  onAction: (id: string, action: "approve" | "reject", approvedFor?: ApprovedFor) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedFor, setSelectedFor] = useState<ApprovedFor>("internal_use");
  const Icon = ENTITY_ICONS[item.entity_type] ?? Brain;

  // Pull the actual review event and approval event for this entity for provenance display
  const reviewEvent = REVIEW_EVENTS.find(r => r.entity_type === item.entity_type && r.entity_id === item.id);
  const approvalEvent = APPROVAL_EVENTS.find(a => a.entity_type === item.entity_type && a.entity_id === item.id);
  const humanEdits = HUMAN_EDITS.filter(h => h.entity_type === item.entity_type && h.entity_id === item.id);

  return (
    <div className={cn(
      "border rounded-xl bg-card overflow-hidden transition-all",
      item.review_status === "needs_review" ? "border-orange-400/30" : "border-border/60"
    )}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-mono text-muted-foreground/60 border border-border/30 bg-muted/20 px-1.5 py-0.5 rounded leading-none">
              {item.entity_type.replace(/_/g, " ")}
            </span>
            <ReviewStatusChip s={item.review_status} />
            {item.label && (
              <span className="text-[9px] text-muted-foreground/60">{item.label}</span>
            )}
            {item.edit_count > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border border-yellow-400/20 bg-yellow-400/8 text-yellow-400 font-semibold leading-none">
                <Edit2 className="w-2 h-2" /> {item.edit_count} edit{item.edit_count > 1 ? "s" : ""}
              </span>
            )}
            {item.approved_for && item.review_status === "approved" && (
              <span className={cn(
                "flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none",
                item.approved_for === "learning_registry"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-border/30 bg-muted/20 text-muted-foreground"
              )}>
                {item.approved_for === "learning_registry" && <Zap className="w-2 h-2" />}
                {item.approved_for.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <div className="text-xs font-semibold text-foreground leading-snug">{item.title}</div>
          {item.extra && (
            <div className="text-[10px] text-muted-foreground">{item.extra}</div>
          )}
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform mt-0.5", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
          {/* State machine visualization */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className={cn("px-2 py-1 rounded border font-medium", item.review_status === "needs_review" ? "bg-orange-400/10 border-orange-400/20 text-orange-400" : "bg-muted border-border/40 text-muted-foreground")}>
              needs_review
            </span>
            <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
            <span className={cn("px-2 py-1 rounded border font-medium", item.review_status === "reviewed" ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted border-border/40 text-muted-foreground")}>
              reviewed
            </span>
            <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
            <span className={cn("px-2 py-1 rounded border font-medium", item.review_status === "approved" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-muted border-border/40 text-muted-foreground")}>
              approved
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className={cn("px-2 py-1 rounded border font-medium", item.review_status === "rejected" ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-muted border-border/40 text-muted-foreground")}>
              rejected
            </span>
          </div>

          {/* Review event provenance — sourced from review_events */}
          {reviewEvent && (
            <div className="rounded border border-border/30 bg-muted/10 px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60 font-mono mb-1">
                <AlertCircle className="w-2.5 h-2.5" />
                review_events · {reviewEvent.id}
              </div>
              <p className="text-[10px] text-muted-foreground italic">"{reviewEvent.notes}"</p>
              <div className="text-[9px] text-muted-foreground/50">{reviewEvent.reviewer_id} · {reviewEvent.created_at}</div>
            </div>
          )}

          {/* Approval event provenance — sourced from approval_events */}
          {approvalEvent && (
            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] text-emerald-400/70 font-mono mb-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                approval_events · {approvalEvent.id}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground italic">"{approvalEvent.notes}"</span>
              </div>
              <div className="text-[9px] text-muted-foreground/50">
                {approvalEvent.approver_id} · approved_for: {approvalEvent.approved_for}
                {approvalEvent.feeds_learning_registry && " · ↗ feeds learning_registry"}
              </div>
            </div>
          )}

          {/* Human edits provenance — sourced from human_edits */}
          {humanEdits.length > 0 && (
            <div className="rounded border border-yellow-400/20 bg-yellow-400/5 px-3 py-2 space-y-2">
              <div className="flex items-center gap-1.5 text-[9px] text-yellow-400/70 font-mono mb-0.5">
                <Edit2 className="w-2.5 h-2.5" />
                human_edits · {humanEdits.length} edit{humanEdits.length > 1 ? "s" : ""}
              </div>
              {humanEdits.map(he => (
                <div key={he.id} className="space-y-0.5">
                  <div className="text-[9px] font-mono text-muted-foreground/60">{he.field_name}</div>
                  <div className="text-[10px] text-foreground">"{he.new_value}"</div>
                  <div className="text-[9px] text-muted-foreground/40">{he.editor_id} · {he.edit_reason}</div>
                </div>
              ))}
            </div>
          )}

          {/* Approve-for scope selector */}
          {item.review_status !== "approved" && item.review_status !== "rejected" && (
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-2">Approve for:</div>
              <div className="flex flex-wrap gap-1.5">
                {APPROVED_FOR_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedFor(opt.value)}
                    className={cn(
                      "flex items-center gap-1 text-[9px] px-2 py-1 rounded border font-medium transition-colors",
                      selectedFor === opt.value
                        ? opt.isLearningLoop
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                          : "bg-primary/10 border-primary/20 text-primary"
                        : "border-border/40 text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    {opt.isLearningLoop && <Zap className="w-2.5 h-2.5" />}
                    {opt.label}
                    {opt.isLearningLoop && (
                      <span className="text-[8px] font-bold">↗ Loop</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {item.review_status !== "approved" && item.review_status !== "rejected" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onAction(item.id, "approve", selectedFor)}
                className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors font-medium"
              >
                <CheckCircle2 className="w-3 h-3" />
                Approve
                {selectedFor === "learning_registry" && " → Feeds Loop"}
              </button>
              <button
                onClick={() => onAction(item.id, "reject")}
                className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors font-medium"
              >
                <XCircle className="w-3 h-3" /> Reject
              </button>
            </div>
          )}

          {item.review_status === "approved" && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approved
              {item.approved_for && ` — ${item.approved_for.replace(/_/g, " ")}`}
            </div>
          )}
          {item.review_status === "rejected" && (
            <div className="flex items-center gap-2 text-[10px] text-destructive">
              <XCircle className="w-3.5 h-3.5" />
              Rejected
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ReviewQueue page ─────────────────────────────────────────────────

export function ReviewQueue() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace.id;

  // Local overrides for actions taken in this session
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ReviewStatus>>({});
  const [approvedForMap, setApprovedForMap] = useState<Record<string, ApprovedFor>>({});

  // Build review items — review_status derived from event tables, then session overrides
  const allItems: ReviewItem[] = useMemo(() => {
    const icItems: ReviewItem[] = INTELLIGENCE_CARDS
      .filter(c => c.workspace_id === wsId)
      .map(c => ({
        id: c.id,
        entity_type: "intelligence_card" as const,
        title: c.title,
        review_status: deriveReviewStatus("intelligence_card", c.id, statusOverrides),
        label: `${c.cohort_key} · ${c.severity}`,
        extra: c.evidence_summary.slice(0, 100) + "…",
        approved_for: approvedForMap[c.id] ??
          APPROVAL_EVENTS.find(a => a.entity_type === "intelligence_card" && a.entity_id === c.id)?.approved_for,
        reviewer: REVIEW_EVENTS.find(r => r.entity_type === "intelligence_card" && r.entity_id === c.id)?.reviewer_id,
        edit_count: HUMAN_EDITS.filter(h => h.entity_type === "intelligence_card" && h.entity_id === c.id).length,
      }));

    const bsilItems: ReviewItem[] = BSIL_SUGGESTIONS
      .filter(s => s.workspace_id === wsId)
      .map(s => ({
        id: s.id,
        entity_type: "bsil_suggestion" as const,
        title: s.entity_name,
        review_status: deriveReviewStatus("bsil_suggestion", s.id, statusOverrides),
        label: `${s.budget_scope_object} · ${s.suggestion_type.replace(/_/g, " ")}`,
        extra: s.rationale.slice(0, 100) + "…",
        approved_for: approvedForMap[s.id] ??
          APPROVAL_EVENTS.find(a => a.entity_type === "bsil_suggestion" && a.entity_id === s.id)?.approved_for,
        reviewer: REVIEW_EVENTS.find(r => r.entity_type === "bsil_suggestion" && r.entity_id === s.id)?.reviewer_id,
        edit_count: HUMAN_EDITS.filter(h => h.entity_type === "bsil_suggestion" && h.entity_id === s.id).length,
      }));

    const briefItems: ReviewItem[] = BRIEFS
      .filter(b => b.workspace_id === wsId)
      .filter(b => ["Draft", "In Review"].includes(b.status))
      .map(b => ({
        id: b.id,
        entity_type: "creative_brief" as const,
        title: b.title,
        review_status: deriveReviewStatus("creative_brief", b.id, statusOverrides),
        label: b.status,
        extra: b.objective,
        approved_for: approvedForMap[b.id] ??
          APPROVAL_EVENTS.find(a => a.entity_type === "creative_brief" && a.entity_id === b.id)?.approved_for,
        reviewer: REVIEW_EVENTS.find(r => r.entity_type === "creative_brief" && r.entity_id === b.id)?.reviewer_id,
        edit_count: HUMAN_EDITS.filter(h => h.entity_type === "creative_brief" && h.entity_id === b.id).length,
      }));

    const reportItems: ReviewItem[] = REPORTS
      .filter(r => r.workspace_id === wsId)
      .filter(r => ["Draft", "In Review"].includes(r.status))
      .map(r => ({
        id: r.id,
        entity_type: "report" as const,
        title: r.title,
        review_status: deriveReviewStatus("report", r.id, statusOverrides),
        label: r.status,
        extra: r.executive_summary.slice(0, 80) + "…",
        approved_for: approvedForMap[r.id] ??
          APPROVAL_EVENTS.find(a => a.entity_type === "report" && a.entity_id === r.id)?.approved_for,
        reviewer: REVIEW_EVENTS.find(r2 => r2.entity_type === "report" && r2.entity_id === r.id)?.reviewer_id,
        edit_count: HUMAN_EDITS.filter(h => h.entity_type === "report" && h.entity_id === r.id).length,
      }));

    return [...icItems, ...bsilItems, ...briefItems, ...reportItems];
  }, [wsId, statusOverrides, approvedForMap]);

  const needsReviewCount = allItems.filter(i => i.review_status === "needs_review").length;

  function handleAction(id: string, action: "approve" | "reject", approvedFor?: ApprovedFor) {
    setStatusOverrides(m => ({ ...m, [id]: action === "approve" ? "approved" : "rejected" }));
    if (action === "approve" && approvedFor) {
      setApprovedForMap(m => ({ ...m, [id]: approvedFor }));
    }
  }

  const [activeTab, setActiveTab] = useState<"all" | "needs_review" | "approved">("needs_review");

  const filtered = allItems.filter(i => {
    if (activeTab === "all") return true;
    if (activeTab === "needs_review") return i.review_status === "needs_review";
    if (activeTab === "approved") return i.review_status === "approved";
    return true;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3 mb-1">
          <CheckSquare className="w-4 h-4 text-primary" />
          <h1 className="text-base font-bold text-foreground">Review Queue</h1>
          {needsReviewCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive font-semibold">
              {needsReviewCount} needs review
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-1">
          Unified review lifecycle — intelligence cards, briefs, reports, and BSIL suggestions.
          Review state derived from <code className="text-[9px] font-mono">review_events → human_edits → approval_events</code>.
        </p>
        <DataSourceBadge table="review_events, approval_events, human_edits" collapsible className="mt-1.5" />

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-3">
          {([
            { id: "needs_review", label: "Needs Review", count: allItems.filter(i => i.review_status === "needs_review").length },
            { id: "all", label: "All Items", count: allItems.length },
            { id: "approved", label: "Approved", count: allItems.filter(i => i.review_status === "approved").length },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg border font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "border-border/40 text-muted-foreground hover:bg-white/5"
              )}
            >
              {tab.label}
              <span className={cn(
                "text-[9px] font-mono rounded px-1",
                activeTab === tab.id ? "text-primary/70" : "text-muted-foreground/60"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                {activeTab === "needs_review" ? "Nothing needs review — you're all caught up." : "No items found."}
              </p>
            </div>
          </div>
        ) : (
          filtered.map(item => (
            <ReviewRow key={item.id} item={item} onAction={handleAction} />
          ))
        )}
      </div>
    </div>
  );
}
