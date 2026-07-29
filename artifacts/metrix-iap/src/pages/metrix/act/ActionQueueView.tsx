// ─── Action Queue ─────────────────────────────────────────────────────
// /app/act/queue — renders all recommendation_cards from the scoped
// optimization_loop. Each card can be approved (→ TaskTray) or dismissed
// (session-level). Clicking a card expands an L2 inline drawer with the
// full rationale and recommended_action.

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import {
  useDecisions,
  getDecision,
  setDecision,
} from "@/lib/data/decisionStore";
import { ConfidenceBadge, DenseText, UnconfiguredState } from "@/pages/metrix/shared";
import type { RecommendationCard } from "@/lib/data/seedTypes";
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────

const IMPACT_RANK: Record<string, number> = { high: 4, medium: 3, low: 2, setup: 1 };

function impactRank(card: RecommendationCard): number {
  return IMPACT_RANK[String(card.impact).toLowerCase()] ?? 0;
}

function actionVerb(recommended_action: string): { label: string; cls: string } {
  const a = recommended_action.toLowerCase();
  if (a.includes("scale")) return { label: "Scale", cls: "bg-emerald-400/10 text-emerald-400 border-emerald-400/25" };
  if (a.includes("pause") || a.includes("kill") || a.includes("stop"))
    return { label: "Kill", cls: "bg-red-400/10 text-red-300 border-red-400/25" };
  return { label: "Fix", cls: "bg-amber-400/10 text-amber-400 border-amber-400/25" };
}

function scopeToActionGroup(scope: string): string {
  const s = scope.toLowerCase();
  if (s.includes("budget") || s.includes("campaign")) return "Budget actions";
  if (s.includes("creative")) return "Creative actions";
  if (s.includes("funnel") || s.includes("strategy")) return "Strategy updates";
  if (s.includes("placement")) return "Strategy updates";
  if (s.includes("brief")) return "Brief updates";
  if (s.includes("mst")) return "MST setup actions";
  if (s.includes("account") || s.includes("setup")) return "Account setup";
  return "Budget actions";
}

function fmtImpact(card: RecommendationCard): string {
  if (typeof card.impact === "object" && card.impact !== null) {
    const imp = card.impact as { value?: string | number; label?: string };
    return `${imp.value ?? ""} ${imp.label ?? ""}`.trim();
  }
  const s = String(card.impact);
  if (!s || s === "undefined") return "";
  return s.charAt(0).toUpperCase() + s.slice(1) + " impact";
}

// ─── Queue section pills ───────────────────────────────────────────────

type QueueTab = "pending" | "approved" | "dismissed";

// ─── L2 inline drawer ─────────────────────────────────────────────────

function InlineDrawer({
  card,
  onClose,
}: {
  card: RecommendationCard;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-[hsl(var(--border-default))] bg-[var(--void-navy-3)] p-4 space-y-3 text-left">
      {/* Close handle */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50">
          Full Detail
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-white/5 transition-colors"
          aria-label="Collapse"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* Rationale */}
      <div className="space-y-1">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">Rationale</p>
        <DenseText text={card.rationale} className="text-[12px] text-foreground/80 leading-relaxed" />
      </div>

      {/* Recommended action */}
      {card.recommended_action && (
        <div className="space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
            Recommended action
          </p>
          <p className="text-[12px] text-foreground/75 leading-relaxed italic">
            {card.recommended_action}
          </p>
        </div>
      )}

      {/* Safety notice */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-400/80 leading-relaxed">
          Approving adds a manual implementation task to the Task Tray. No changes are applied automatically.
        </p>
      </div>
    </div>
  );
}

// ─── Single queue card ─────────────────────────────────────────────────

function QueueCard({
  card,
  adAccountId,
}: {
  card: RecommendationCard;
  adAccountId: string;
}) {
  useDecisions(); // subscribe to store changes
  const [expanded, setExpanded] = useState(false);
  const decision = getDecision(adAccountId, card.id);
  const verb = actionVerb(card.recommended_action);
  const impactLabel = fmtImpact(card);

  const approve = useCallback(() => {
    setDecision(adAccountId, card.id, "approved", {
      title: card.title,
      recommendedAction: card.recommended_action,
      actionGroup: scopeToActionGroup(card.scope),
      descriptor: card.manager_card_descriptor,
      scopeLabel: card.scope,
    });
  }, [adAccountId, card]);

  const dismiss = useCallback(() => {
    setDecision(adAccountId, card.id, "rejected");
    setExpanded(false);
  }, [adAccountId, card.id]);

  const restore = useCallback(() => {
    setDecision(adAccountId, card.id, "pending");
  }, [adAccountId, card.id]);

  const isDismissed = decision === "rejected";
  const isApproved = decision === "approved";

  return (
    <div
      className={cn(
        "rounded-xl border transition-all",
        isApproved
          ? "border-emerald-400/25 bg-emerald-400/[0.04]"
          : isDismissed
          ? "border-[hsl(var(--border))] bg-white/[0.01] opacity-50"
          : "border-[hsl(var(--border))] bg-[var(--void-navy-3)]"
      )}
    >
      {/* Card header — clickable to expand */}
      <button
        type="button"
        onClick={() => !isDismissed && setExpanded((v) => !v)}
        disabled={isDismissed}
        className={cn(
          "w-full text-left p-4 transition-colors",
          !isDismissed && "hover:bg-white/[0.02]",
          isDismissed && "cursor-default"
        )}
      >
        {/* Top row: verb chip, confidence, impact */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className={cn(
              "inline-flex text-[10px] font-bold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
              verb.cls
            )}
          >
            {verb.label}
          </span>
          <ConfidenceBadge value={card.confidence} />
          {impactLabel && (
            <span className="ml-auto text-[11px] text-[var(--meta-blue-highlight)] font-semibold tabular-nums">
              {impactLabel}
            </span>
          )}
          {isApproved && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-[13px] font-semibold text-foreground leading-snug mb-1.5">
          {card.title}
        </p>

        {/* Rationale preview — always visible */}
        <p className="text-[12px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
          {card.rationale}
        </p>

        {/* Expand chevron */}
        {!isDismissed && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/40">
            {expanded ? (
              <><ChevronUp className="w-3.5 h-3.5" /> Less</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /> Full detail</>
            )}
          </div>
        )}
      </button>

      {/* L2 inline drawer */}
      {expanded && !isDismissed && (
        <div className="px-4 pb-4">
          <InlineDrawer card={card} onClose={() => setExpanded(false)} />
        </div>
      )}

      {/* Action controls */}
      {!isDismissed && !isApproved && (
        <div className="px-4 pb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="flex items-center gap-1.5 h-8 px-3 rounded border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Dismiss
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); approve(); }}
            className="flex items-center gap-1.5 h-8 px-3 rounded bg-primary/15 border border-primary/30 text-[11px] font-semibold text-interactive hover:bg-primary/25 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
        </div>
      )}

      {/* Restore for dismissed */}
      {isDismissed && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={restore}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-border/40 text-[10px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Restore
          </button>
        </div>
      )}

      {/* Restore for approved */}
      {isApproved && (
        <div className="px-4 pb-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/50">Added to Task Tray</span>
          <button
            type="button"
            onClick={restore}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-border/40 text-[10px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Undo
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────

function EmptyQueue({ reason }: { reason: "no-loop" | "all-done" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/40 py-16 text-center px-6">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
        {reason === "all-done" ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400/60" />
        ) : (
          <Zap className="w-5 h-5 text-muted-foreground/30" />
        )}
      </div>
      {reason === "all-done" ? (
        <>
          <p className="text-[13px] font-medium text-foreground/60">All caught up</p>
          <p className="text-[12px] text-muted-foreground/50 max-w-[280px]">
            All recommendations have been reviewed. Approved items are in your Task Tray.
          </p>
        </>
      ) : (
        <>
          <p className="text-[13px] font-medium text-foreground/60">No actions yet</p>
          <p className="text-[12px] text-muted-foreground/50 max-w-[280px]">
            Run analysis to generate optimization recommendations for this account.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────

export function ActionQueueView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  useDecisions(); // reactive to store changes
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<QueueTab>("pending");

  const optLoop = account?.iap?.optimization_loop ?? null;

  const allCards = useMemo(
    () =>
      [...(optLoop?.recommendation_cards ?? [])].sort(
        (a, b) => impactRank(b) - impactRank(a)
      ),
    [optLoop]
  );

  const pendingCards = allCards.filter((c) => getDecision(adAccountId ?? "", c.id) === "pending");
  const approvedCards = allCards.filter((c) => getDecision(adAccountId ?? "", c.id) === "approved");
  const dismissedCards = allCards.filter((c) => getDecision(adAccountId ?? "", c.id) === "rejected");

  // ── Unconfigured guard ────────────────────────────────────────────────
  if (!account) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-6">
        <p className="text-[13px] text-muted-foreground/70">Select an ad account to see the action queue.</p>
      </div>
    );
  }

  if (account.status !== "configured" || !account.iap) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-6">
        <h1
          className="text-2xl font-semibold text-foreground mb-6 max-w-[680px] leading-[1.22]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Set up {account.name} to get started.
        </h1>
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const TABS: { id: QueueTab; label: string; count: number }[] = [
    { id: "pending", label: "Pending", count: pendingCards.length },
    { id: "approved", label: "Approved", count: approvedCards.length },
    { id: "dismissed", label: "Dismissed", count: dismissedCards.length },
  ];

  const visibleCards =
    tab === "pending" ? pendingCards : tab === "approved" ? approvedCards : dismissedCards;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-6 py-6 space-y-5 max-w-[860px] w-full mx-auto">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="space-y-1">
          <h1
            className="text-foreground leading-[1.22]"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(20px, 1.8vw, 26px)",
              fontWeight: 600,
            }}
          >
            Action Queue
          </h1>
          <p className="text-[13px] text-muted-foreground/65 max-w-[520px] leading-relaxed">
            {allCards.length > 0
              ? `${allCards.length} recommendation${allCards.length !== 1 ? "s" : ""} from the optimization loop, sorted by impact. Approve to add to the Task Tray.`
              : "Optimization loop recommendations appear here after analysis runs."}
          </p>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        {allCards.length > 0 && (
          <div className="flex items-center gap-0 border-b border-border/40">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 h-9 px-3 text-[12px] font-medium border-b-2 transition-colors",
                  tab === t.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground/60 hover:text-foreground"
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                      t.id === "approved"
                        ? "bg-emerald-400/15 text-emerald-400"
                        : t.id === "dismissed"
                        ? "bg-muted text-muted-foreground/60"
                        : "bg-primary/15 text-interactive"
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Card list ───────────────────────────────────────────────── */}
        {allCards.length === 0 ? (
          <EmptyQueue reason="no-loop" />
        ) : visibleCards.length === 0 ? (
          <EmptyQueue reason="all-done" />
        ) : (
          <div className="space-y-3">
            {visibleCards.map((card) => (
              <QueueCard
                key={card.id}
                card={card}
                adAccountId={adAccountId ?? ""}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
