// ─── Action Queue ─────────────────────────────────────────────────────
// /app/act/queue — renders all recommendation_cards from the scoped
// optimization_loop. Each card can be approved (→ TaskTray) or dismissed
// (session-level). Clicking a card expands an L2 inline drawer with the
// full rationale and recommended_action.

import { useState, useMemo, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TabRail } from "@/components/nav/TabRail";
import { RevealPanel } from "@/components/widgets/LayeredDisclosure";
import { DUR_MED, EASE, motionOr, staggerDelay } from "@/lib/motion";
import { cn } from "@workspace/command-deck/lib/utils";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import {
  useDecisions,
  getDecision,
  setDecision,
} from "@/lib/data/decisionStore";
import { addToTray, removeFromTray } from "@/lib/data/trayStore";
import { ConfidenceBadge, CrossLink, DenseText, ModuleHeader, StageNotRunState, UnconfiguredState } from "@/pages/metrix/shared";
import { impactRank } from "@/components/deck/RecommendationDeck";
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
import { deriveRecommendations, toLoopCards } from "@/lib/data/recommendations";

// ─── Helpers ──────────────────────────────────────────────────────────
// Impact ranking (for sorting cards highest-impact first) comes from the
// shared `impactRank` in RecommendationDeck, the one definition every
// recommendation surface reads, so no two surfaces can disagree on priority.

function actionVerb(recommended_action: string): { label: string; cls: string } {
  const a = recommended_action.toLowerCase();
  if (a.includes("scale")) return { label: "Scale", cls: "bg-status-success/10 text-status-success border-status-success/25" };
  if (a.includes("pause") || a.includes("kill") || a.includes("stop"))
    return { label: "Retire", cls: "bg-status-danger/10 text-status-danger border-status-danger/25" };
  return { label: "Optimize", cls: "bg-status-warning/10 text-status-warning border-status-warning/25" };
}

/** The queue's groups, in the loop's order. A card's index in the flat list keeps its stagger slot. */
function groupByVerb(cards: RecommendationCard[]): { label: string; cls: string; cards: { card: RecommendationCard; index: number }[] }[] {
  const order = ["Retire", "Scale", "Optimize"];
  const groups = new Map<string, { label: string; cls: string; cards: { card: RecommendationCard; index: number }[] }>();
  cards.forEach((card, index) => {
    const verb = actionVerb(card.recommended_action);
    const g = groups.get(verb.label) ?? { label: verb.label, cls: verb.cls, cards: [] };
    g.cards.push({ card, index });
    groups.set(verb.label, g);
  });
  return [...groups.values()].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
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
    <div className="mt-2 rounded-xl border border-[hsl(var(--border-default))] bg-secondary p-4 space-y-3 text-left">
      {/* Close handle */}
      <div className="flex items-center justify-between">
        <span className="text-label font-semibold uppercase text-muted-foreground/75">
          Full Detail
        </span>
        <button
          type="button"
          onClick={onClose}
          className="pressable w-6 h-6 rounded flex items-center justify-center text-muted-foreground/75 hover:text-foreground hover:bg-foreground/5 transition-colors"
          aria-label="Collapse"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* Rationale */}
      <div className="space-y-1">
        <p className="text-label font-semibold uppercase text-muted-foreground/75">Rationale</p>
        <DenseText text={card.rationale} className="text-body text-foreground/80 leading-relaxed" />
      </div>

      {/* Recommended action */}
      {card.recommended_action && (
        <div className="space-y-1">
          <p className="text-label font-semibold uppercase text-muted-foreground/75">
            Recommended action
          </p>
          <p className="text-body text-foreground/75 leading-relaxed italic">
            {card.recommended_action}
          </p>
        </div>
      )}

      {/* Safety notice */}
      <div className="flex items-start gap-2 rounded-lg border border-status-warning/15 bg-status-warning/[0.04] px-3 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
        <p className="text-caption text-status-warning/80 leading-relaxed">
          Adding to the tray files a manual implementation task in the Task Tray. No changes are applied automatically.
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
    // "Add to Tray": records the local decision (drives the tab lists) and
    // files the item into the durable tray store the Task Tray renders.
    setDecision(adAccountId, card.id, "approved", {
      title: card.title,
      recommendedAction: card.recommended_action,
      actionGroup: scopeToActionGroup(card.scope),
      descriptor: card.manager_card_descriptor,
      scopeLabel: card.scope,
    });
    addToTray(adAccountId, {
      id: card.id,
      kind: "recommendation",
      title: card.title,
      sub: card.recommended_action,
      href: "/app/listen/recommendations",
    });
  }, [adAccountId, card]);

  const dismiss = useCallback(() => {
    setDecision(adAccountId, card.id, "rejected");
    setExpanded(false);
  }, [adAccountId, card.id]);

  const restore = useCallback(() => {
    setDecision(adAccountId, card.id, "pending");
    removeFromTray(adAccountId, card.id);
  }, [adAccountId, card.id]);

  const isDismissed = decision === "rejected";
  const isApproved = decision === "approved";

  return (
    <div
      className={cn(
        "rounded-xl border transition-[color,background-color,border-color,box-shadow,opacity,transform]",
        isApproved
          ? "border-status-success/25 bg-status-success/[0.04]"
          : isDismissed
          ? "border-[hsl(var(--border))] bg-foreground/[0.01] opacity-50"
          : "border-[hsl(var(--border))] bg-secondary"
      )}
    >
      {/* Card header — clickable to expand */}
      <button
        type="button"
        onClick={() => !isDismissed && setExpanded((v) => !v)}
        disabled={isDismissed}
        className={cn(
          "pressable-lg w-full text-left p-4 transition-colors",
          !isDismissed && "hover:bg-foreground/[0.02]",
          isDismissed && "cursor-default"
        )}
      >
        {/* Top row: verb chip, confidence, impact */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className={cn(
              "inline-flex text-label font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
              verb.cls
            )}
          >
            {verb.label}
          </span>
          <ConfidenceBadge value={card.confidence} />
          {impactLabel && (
            <span className="ml-auto text-caption text-interactive font-semibold tabular-nums">
              {impactLabel}
            </span>
          )}
          {isApproved && (
            <span className="flex items-center gap-1 text-label text-status-success font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> In Tray
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-title font-bold text-foreground leading-snug mb-1.5">
          {card.title}
        </p>

        {/* Rationale preview — always visible */}
        <p className="text-body text-muted-foreground/75 line-clamp-2 leading-relaxed">
          {card.rationale}
        </p>

        {/* Expand chevron */}
        {!isDismissed && (
          <div className="mt-2 flex items-center gap-1 text-label text-muted-foreground/75">
            {expanded ? (
              <><ChevronUp className="w-3.5 h-3.5" /> Less</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /> Full detail</>
            )}
          </div>
        )}
      </button>

      {/* L2 inline drawer — arrives with the one reveal signature instead
          of hard-mounting. */}
      <RevealPanel open={expanded && !isDismissed}>
        <div className="px-4 pb-4">
          <InlineDrawer card={card} onClose={() => setExpanded(false)} />
        </div>
      </RevealPanel>

      {/* Action controls */}
      {!isDismissed && !isApproved && (
        <div className="px-4 pb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="pressable flex items-center gap-1.5 h-8 px-3 rounded border border-border/50 text-caption font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Dismiss
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); approve(); }}
            className="pressable flex items-center gap-1.5 h-8 px-3 rounded bg-primary/15 border border-primary/30 text-caption font-semibold text-interactive hover:bg-primary/25 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Add to Tray
          </button>
        </div>
      )}

      {/* Restore for dismissed */}
      {isDismissed && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={restore}
            className="pressable flex items-center gap-1.5 h-7 px-2.5 rounded border border-border/40 text-label font-medium text-muted-foreground/75 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Restore
          </button>
        </div>
      )}

      {/* Restore for approved */}
      {isApproved && (
        <div className="px-4 pb-3 flex items-center justify-between">
          <span className="text-label text-muted-foreground/75">Added to Task Tray</span>
          <button
            type="button"
            onClick={restore}
            className="pressable flex items-center gap-1.5 h-7 px-2.5 rounded border border-border/40 text-label font-medium text-muted-foreground/75 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Undo
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Section eyebrow ───────────────────────────────────────────────────
// Not one of the six numbered loop stages (see App.tsx's un-numbered
// "Act section" comment) — reached only via the "Open full queue"
// cross-link from Account Overview, so the eyebrow is the bare label.

const SECTION = "Action · 07";

// ─── Empty state ──────────────────────────────────────────────────────

function AllCaughtUp() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/40 py-16 text-center px-6">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
        <CheckCircle2 className="w-5 h-5 text-status-success/60" />
      </div>
      <p className="text-title font-bold text-foreground/60">All caught up</p>
      <p className="text-body text-muted-foreground/75 max-w-[280px]">
        All recommendations have been reviewed. Approved items are in your Task Tray.
      </p>
    </div>
  );
}

// The other branch used to read "No actions yet — Run analysis to generate
// optimization recommendations for this account." That instruction could
// never be satisfied: optimization_loop is a hardcoded null in seed assembly
// and nothing writes it, so the user was being sent to run analysis, told
// again to run analysis, indefinitely. StageNotRunState reads the stage's
// own loop_status note instead, which is real, account-specific and names
// the actual blocker.

// ─── Main export ──────────────────────────────────────────────────────

export function ActionQueueView() {
  const seed = useMetrixSeed();
  const reduced = useReducedMotion();
  const adAccountId = useScopedAdAccountId();
  useDecisions(); // reactive to store changes
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<QueueTab>("pending");

  // The loop's cards when it has run, and the account's own rows when it has
  // not — `deriveRecommendations` emits the same shape, so the queue works on
  // an account whose Optimization Loop stage has never been executed (which
  // is every account today). `source_path` carries which JSON produced each.
  const allCards = useMemo(
    () =>
      toLoopCards(deriveRecommendations(account), account?.id ?? "").sort(
        (a, b) => impactRank(String(b.impact)) - impactRank(String(a.impact))
      ),
    [account]
  );

  const pendingCards = allCards.filter((c) => getDecision(adAccountId ?? "", c.id) === "pending");
  const approvedCards = allCards.filter((c) => getDecision(adAccountId ?? "", c.id) === "approved");
  const dismissedCards = allCards.filter((c) => getDecision(adAccountId ?? "", c.id) === "rejected");

  // ── Unconfigured guard ────────────────────────────────────────────────
  if (!account) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-6">
        <p className="text-title text-muted-foreground/75">Select an ad account to see the action queue.</p>
      </div>
    );
  }

  if (account.status !== "configured" || !account.iap) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={SECTION} title="Action Queue" accountName={account.name} />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const TABS: { id: QueueTab; label: string; count: number }[] = [
    { id: "pending", label: "Pending", count: pendingCards.length },
    { id: "approved", label: "In Tray", count: approvedCards.length },
    { id: "dismissed", label: "Dismissed", count: dismissedCards.length },
  ];

  const visibleCards =
    tab === "pending" ? pendingCards : tab === "approved" ? approvedCards : dismissedCards;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Action Queue"
        accountName={account.name}
        subtitle="Recommendation cards from the optimization loop, sorted by impact. Approve into the Task Tray or dismiss."
      />
      <div className="px-6 py-6 space-y-5 max-w-[1120px] w-full mx-auto">

        {/* ── Descriptive line ────────────────────────────────────────── */}
        {/* The empty half of this line said recommendations "appear here
            after analysis runs" — the same false promise as the empty
            state, in a second place. When there is nothing, the state below
            carries the real reason; the whole element is dropped rather
            than left as an empty <p> holding a line of vertical space. */}
        {allCards.length > 0 && (
          <p className="text-title text-muted-foreground/75 max-w-[520px] leading-relaxed">
            {allCards.length} recommendation{allCards.length !== 1 ? "s" : ""} from the
            optimization loop, sorted by impact. Add items to your Task Tray to implement later.
          </p>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        {allCards.length > 0 && (
          <TabRail tabs={TABS} active={tab} onChange={setTab as (id: QueueTab) => void} label="Queue status" />
        )}

        {/* ── Card list ───────────────────────────────────────────────── */}
        {allCards.length === 0 ? (
          <StageNotRunState
            title="No actions yet"
            stageLabel="Optimization Loop"
            stage="optimization_loop"
            account={account}
            icon={Zap}
            action={
              <div className="flex items-center gap-4 flex-wrap justify-center">
                <CrossLink to="/app/strategy/hypotheses" label="Queue a test" />
                <CrossLink to="/app/creative" label="Draft a brief" />
              </div>
            }
          />
        ) : visibleCards.length === 0 ? (
          <AllCaughtUp />
        ) : (
          <div className="space-y-6">
            {/* Grouped by the verb the card asks for, in the loop's order
                (retire, scale, optimize), each group a two-column grid above
                xl: twenty-three cards in one 860 px column was a 5,000 px
                scroll with nothing to scan by. Staggered arrival on tab
                entry (cards are disjoint across tabs, so a tab switch
                remounts and replays it). Departure on approve/dismiss stays
                instant by design: the card's landing tab counts up in the
                same paint, and a delayed unmount would leave a decided card
                lingering in the pending list. */}
            {groupByVerb(visibleCards).map((group) => (
              <section key={group.label} aria-label={`${group.label} (${group.cards.length})`} data-testid="queue-group">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={cn("inline-flex text-label font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none", group.cls)}>{group.label}</span>
                  <span className="text-caption text-muted-foreground/75 tabular-nums">{group.cards.length}</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
                  {group.cards.map(({ card, index }) => (
                    <motion.div
                      key={card.id}
                      initial={reduced ? false : { opacity: 0, y: -6, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{
                        ...motionOr(reduced, { duration: DUR_MED, ease: EASE }),
                        delay: reduced ? 0 : staggerDelay(index, visibleCards.length),
                      }}
                    >
                      <QueueCard card={card} adAccountId={adAccountId ?? ""} />
                    </motion.div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
