// ─── Recommendation Deck ──────────────────────────────────────────────
// Reusable decision swiper used by Manager Overview and Ad Account Overview.
// Inputs: mouse drag, touch drag, keyboard arrows (after focus), buttons.
//   swipe right / →  = Approve  → Task Tray (manual implementation task)
//   swipe left  / ←  = Reject   → Dismissed Log (restorable)
//   tap / Space / ↑  = Open details
//   Ctrl/Cmd+Z       = Undo last decision
// Approved cards NEVER auto-edit campaigns.

import { useCallback, useEffect, useRef, useState } from "react";
import { TabRail } from "@/components/nav/TabRail";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  Check,
  X,
  RotateCcw,
  Info,
  ClipboardList,
  Slash,
  Layers,
  LayoutGrid,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  useDecisions,
  getDecision,
  setDecision,
  undoLast,
  toggleDone,
  isDone,
} from "@/lib/data/decisionStore";
import { addToTray, removeFromTray } from "@/lib/data/trayStore";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { deriveLabel } from "@/pages/metrix/shared";
import { TYPE } from "@/pages/metrix/typography";
import { SwipeDeck } from "@/components/widgets/SwipeDeck";

export interface DeckCard {
  id: string;
  title: string;
  rationale: string;
  recommendedAction: string;
  impact: string;
  confidence: string;
  scope: string;
  descriptor?: string;
  actionGroup: string; // "Budget actions" | "Creative actions" | ...
}

const IMPACT_STYLE: Record<string, string> = {
  high: "bg-status-danger/10 text-status-danger border-status-danger/20",
  medium: "bg-status-warning/10 text-status-warning border-status-warning/20",
  low: "bg-muted text-muted-foreground/75 border-border/40",
  setup: "bg-primary/10 text-interactive border-primary/20",
};

// Single source of truth for how impact tiers rank against each other —
// shared by every surface that sorts DeckCard-shaped recommendations by
// impact (NextBestActionCard, ActionQueueView, …) so they can never
// silently diverge on what "impact" means as an absolute rank.
export const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, setup: 0 };

/**
 * Numeric priority for sorting by impact, highest first. Case-insensitive;
 * an unrecognized value ranks with "setup" (0).
 */
export function impactRank(impact: string): number {
  return IMPACT_RANK[String(impact).toLowerCase()] ?? 0;
}

const SCOPE_STYLE: Record<string, string> = {
  creative: "bg-status-warning/10 text-status-warning border-status-warning/20",
  funnel: "bg-metrix-cyan/10 text-metrix-cyan border-metrix-cyan/20",
  placement: "bg-status-success/10 text-status-success border-status-success/20",
  ad_account: "bg-primary/10 text-interactive border-primary/20",
  campaign: "bg-primary/10 text-interactive border-primary/20",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={cn("text-micro font-semibold border px-1.5 py-0.5 rounded uppercase leading-none", cls)}>
      {text}
    </span>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────

function DetailDrawer({
  card,
  onClose,
  onApprove,
  onReject,
  onSegments,
}: {
  card: DeckCard;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSegments?: (card: DeckCard) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-background/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[400px] max-w-full bg-surface-deep border-l border-border/50 z-50 flex flex-col overflow-hidden elevation-floating">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <div className="text-label text-muted-foreground/75 uppercase tracking-widest mb-1">
              Recommendation
            </div>
            <p className="text-title font-bold text-foreground leading-tight">{card.title}</p>
          </div>
          <button
            onClick={onClose}
            className="pressable w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {card.descriptor && <Badge text={card.descriptor} cls="bg-foreground/[0.04] text-foreground/70 border-border/40" />}
            <Badge text={card.scope} cls={SCOPE_STYLE[card.scope] ?? "bg-muted text-muted-foreground/75 border-border/40"} />
            <Badge text={`${card.impact} impact`} cls={IMPACT_STYLE[card.impact] ?? IMPACT_STYLE.low} />
          </div>

          <div className="space-y-1.5">
            <label className="text-label uppercase tracking-widest text-muted-foreground/75">Rationale</label>
            <p className="text-body text-foreground/80 leading-relaxed"><TokenizedConceptText text={card.rationale} /></p>
          </div>

          <div className="space-y-1.5">
            <label className="text-label uppercase tracking-widest text-muted-foreground/75">Recommended action</label>
            <p className="text-body text-foreground/80 leading-relaxed"><TokenizedConceptText text={card.recommendedAction} /></p>
          </div>

          <div className="space-y-1.5">
            <label className="text-label uppercase tracking-widest text-muted-foreground/75">Confidence</label>
            <p className="text-body text-foreground/80 capitalize">{card.confidence}</p>
          </div>

          {onSegments && (
            <div className="space-y-1.5">
              <label className="text-label uppercase tracking-widest text-muted-foreground/75">Evidence segments</label>
              <div>
                <button
                  onClick={() => onSegments(card)}
                  className="inline-flex items-center gap-1.5 text-caption font-medium text-interactive border border-primary/30 hover:bg-primary/10 active:bg-primary/20 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Avatar × placement drill-down
                </button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg border border-status-warning/15 bg-status-warning/[0.04]">
            <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
            <p className="text-label text-status-warning/80 leading-relaxed">
              Approving adds a manual implementation task. No auto-changes are applied to live campaigns.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border/40 flex items-center gap-2">
          <button
            onClick={() => { onReject(); onClose(); }}
            className="pressable flex-1 flex items-center justify-center gap-1.5 h-9 rounded border border-border/50 text-body font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Reject
          </button>
          <button
            onClick={() => { onApprove(); onClose(); }}
            className="pressable flex-1 flex items-center justify-center gap-1.5 h-9 rounded bg-primary/15 border border-primary/30 text-body font-medium text-interactive hover:bg-primary/25 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Add to Tray
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Card face ────────────────────────────────────────────────────────
// Presentation only. The gesture, the thresholds, the rotation, the intent
// stamps and the commit sequencing all live in SwipeDeck now — this used to
// be 120 lines of pointer bookkeeping wrapped around 20 lines of card.

function RecommendationCardFace({ card }: { card: DeckCard }) {
  return (
    <div className="h-full flex flex-col gap-3 p-5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {card.descriptor && <Badge text={card.descriptor} cls="bg-foreground/[0.04] text-foreground/70 border-border/40" />}
        <Badge text={card.scope} cls={SCOPE_STYLE[card.scope] ?? "bg-muted text-muted-foreground/75 border-border/40"} />
        <Badge text={`${card.impact} impact`} cls={IMPACT_STYLE[card.impact] ?? IMPACT_STYLE.low} />
      </div>

      {/* Was `text-sm font-semibold` — 14px, the same size as the rationale
          under it, so the card had a title and a body at one size and no
          hierarchy between them. TYPE.title is the role for a card title. */}
      <p className={cn(TYPE.title, "line-clamp-2")}>{card.title}</p>

      <p className="text-body text-muted-foreground/75 leading-snug line-clamp-2">{deriveLabel(card.rationale, 110)}</p>

      <div className="mt-auto pt-2 border-t border-border/20">
        <p className={cn(TYPE.microLabel, "tracking-widest mb-1")}>Recommended</p>
        <p className="text-caption text-foreground/75 leading-snug line-clamp-1">{deriveLabel(card.recommendedAction, 90)}</p>
      </div>
    </div>
  );
}

// ─── Main deck ────────────────────────────────────────────────────────

const TRAY_GROUP_ORDER = [
  "Budget actions",
  "Creative actions",
  "Strategy updates",
  "Brief updates",
  "MST setup actions",
  "Account setup",
];

type TabId = "deck" | "tray" | "dismissed";

export function RecommendationDeck({
  scopeId,
  cards,
  emptyLabel = "All recommendations reviewed",
  onSegments,
}: {
  scopeId: string;
  cards: DeckCard[];
  emptyLabel?: string;
  /** When provided, each card exposes an avatar × placement drill-down. */
  onSegments?: (card: DeckCard) => void;
}) {
  useDecisions();
  const [tab, setTab] = useState<TabId>("deck");
  const [detailId, setDetailId] = useState<string | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  const decisionOf = (id: string) => getDecision(scopeId, id);
  const pending = cards.filter((c) => decisionOf(c.id) === "pending");
  const approved = cards.filter((c) => decisionOf(c.id) === "approved");
  const rejected = cards.filter((c) => decisionOf(c.id) === "rejected");

  const approve = useCallback(
    (id: string) => {
      // "Add to Tray": local decision drives the deck tabs; the durable
      // tray store is what the right Task Tray panel renders.
      setDecision(scopeId, id, "approved");
      const card = cards.find((c) => c.id === id);
      if (card) {
        addToTray(scopeId, {
          id: card.id,
          kind: "recommendation",
          title: card.title,
          sub: card.recommendedAction,
          href: "/app/listen/recommendations",
        });
      }
    },
    [scopeId, cards]
  );
  const reject = useCallback((id: string) => setDecision(scopeId, id, "rejected"), [scopeId]);
  const restore = useCallback(
    (id: string) => {
      setDecision(scopeId, id, "pending");
      removeFromTray(scopeId, id);
    },
    [scopeId]
  );

  // Keyboard on deck.
  //
  // This is a WINDOW listener, and it was completely unguarded: while the
  // Deck tab was selected, ArrowRight anywhere on the page approved the top
  // recommendation and wrote it to the tray. Put the caret in the account
  // search box, press ArrowRight to move one character, and you have
  // silently approved a recommendation you never read. The date picker, the
  // account switcher and every dialog on an Overview route are all in that
  // blast radius. A keystroke meant for a text field must not mutate a
  // decision store — that is a data defect wearing an interaction bug's
  // clothes.
  //
  // Two guards, both necessary:
  //
  //   · Ignore events whose target is an editable field. Arrow keys, space
  //     and Enter all mean something inside an input, a textarea, a select
  //     or a contenteditable, and none of those meanings is "approve".
  //   · Ignore events aimed at another interactive control. Space on a
  //     focused button activates it; stealing that makes every button on
  //     the page open a recommendation detail instead.
  //
  // The card itself also handles arrows when focused (SwipeDeck), which is
  // the correct scoped path. This listener stays because the deck is a
  // queue you clear without hunting for focus first — but it now only fires
  // when nothing else has a claim on the key.
  useEffect(() => {
    if (tab !== "deck") return;
    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      // A focused control that has its own meaning for Space/Enter.
      return el.closest("button, a[href], [role='button'], [role='tab'], [role='menuitem']") !== null;
    }
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const top = pending[0];
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undoLast(); return; }
      if (!top) return;
      if (e.key === "ArrowRight") { e.preventDefault(); approve(top.id); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); reject(top.id); }
      else if (e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailId(top.id); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, pending, approve, reject]);

  const detailCard = detailId ? cards.find((c) => c.id === detailId) ?? null : null;

  const TABS = [
    { id: "deck" as TabId, label: "Deck", count: pending.length, Icon: Layers },
    { id: "tray" as TabId, label: "Task Tray", count: approved.length, Icon: ClipboardList },
    { id: "dismissed" as TabId, label: "Dismissed", count: rejected.length, Icon: Slash },
  ];

  return (
    <div className="flex flex-col">
      <TabRail
        tabs={TABS}
        active={tab}
        onChange={setTab as (id: TabId) => void}
        label="Recommendation state"
        className="mb-4"
      />

      {tab === "deck" && (
        pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="w-10 h-10 rounded-xl border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-status-success/60" />
            </div>
            <p className="text-title font-bold text-foreground/60">{emptyLabel}</p>
            <p className="text-caption text-muted-foreground/75">Check the Task Tray for items you added.</p>
          </div>
        ) : (
          <div>
            {/* Card stack */}
            <div
              ref={deckRef}
              className="relative w-full max-w-md mx-auto h-[300px]"
              aria-label="Recommendation deck. Use arrow keys to decide."
            >
              <SwipeDeck
                items={pending}
                keyOf={(c) => c.id}
                renderCard={(c) => <RecommendationCardFace card={c} />}
                onCommit={(c, dir) => (dir === "right" ? approve(c.id) : reject(c.id))}
                onTap={(c) => setDetailId(c.id)}
                right={{ label: "Add to Tray", tone: "success" }}
                left={{ label: "Reject", tone: "danger" }}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={() => reject(pending[0].id)}
                className="pressable w-11 h-11 rounded-full flex items-center justify-center border border-status-danger/30 text-status-danger hover:bg-status-danger/10 transition-colors"
                aria-label="Reject"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={() => setDetailId(pending[0].id)}
                className="pressable w-9 h-9 rounded-full flex items-center justify-center border border-border/40 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                aria-label="Details"
              >
                <Info className="w-4 h-4" />
              </button>
              <button
                onClick={() => approve(pending[0].id)}
                className="pressable w-11 h-11 rounded-full flex items-center justify-center border border-status-success/30 text-status-success hover:bg-status-success/10 transition-colors"
                aria-label="Add to Tray"
              >
                <Check className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 mt-3 text-caption text-muted-foreground/75">
              <span>← reject</span>
              <span>→ add to tray</span>
              <span>↑ / space details</span>
              <span>{pending.length} left</span>
            </div>

            {onSegments && (
              <div className="flex justify-center mt-3">
                <button
                  onClick={() => onSegments(pending[0])}
                  className="pressable inline-flex items-center gap-1.5 text-caption font-medium text-interactive/90 hover:text-primary border border-primary/25 bg-primary/[0.06] hover:bg-primary/10 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Avatar × placement for this card
                </button>
              </div>
            )}
          </div>
        )
      )}

      {tab === "tray" && <TaskTray scopeId={scopeId} items={approved} onRestore={restore} />}
      {tab === "dismissed" && <DismissedLog items={rejected} onRestore={restore} />}

      {detailCard && (
        <DetailDrawer
          card={detailCard}
          onClose={() => setDetailId(null)}
          onApprove={() => { approve(detailCard.id); setDetailId(null); }}
          onReject={() => { reject(detailCard.id); setDetailId(null); }}
          onSegments={onSegments}
        />
      )}
    </div>
  );
}

// ─── Task Tray ────────────────────────────────────────────────────────

function TaskTray({
  scopeId,
  items,
  onRestore,
}: {
  scopeId: string;
  items: DeckCard[];
  onRestore: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <EmptyPanel Icon={ClipboardList} title="Nothing in the tray yet" sub="Recommendations you add to the tray appear here as manual implementation tasks." />
    );
  }
  const groups = TRAY_GROUP_ORDER.map((g) => ({ label: g, rows: items.filter((i) => i.actionGroup === g) })).filter((g) => g.rows.length);

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="text-label uppercase tracking-widest text-muted-foreground/75 mb-2">{g.label}</div>
          <div className="space-y-2">
            {g.rows.map((s) => {
              const done = isDone(scopeId, s.id);
              return (
                <div key={s.id} className={cn("flex items-start gap-3 p-3 rounded-lg border bg-foreground/[0.02]", done ? "border-status-success/20 opacity-60" : "border-border/40")}>
                  <button
                    onClick={() => toggleDone(scopeId, s.id)}
                    className={cn("pressable mt-0.5 w-4 hit-target-24 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", done ? "bg-status-success/20 border-status-success/40 text-status-success" : "border-border/50 text-transparent hover:border-border/70")}
                    aria-label={done ? "Mark not done" : "Mark done"}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-body font-medium leading-tight", done ? "text-foreground/55 line-through" : "text-foreground")}>{s.title}</p>
                    <p className="text-label text-muted-foreground/75 mt-0.5 leading-tight line-clamp-1">{deriveLabel(s.recommendedAction, 90)}</p>
                    {s.descriptor && <span className="inline-flex mt-1.5 text-caption font-semibold border border-border/40 px-1 py-0.5 rounded text-foreground/60">{s.descriptor}</span>}
                  </div>
                  <button onClick={() => onRestore(s.id)} className="pressable h-6 px-2 rounded text-label font-medium text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/50 transition-colors shrink-0" title="Restore to deck">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Dismissed Log ────────────────────────────────────────────────────

function DismissedLog({ items, onRestore }: { items: DeckCard[]; onRestore: (id: string) => void }) {
  if (!items.length) {
    return <EmptyPanel Icon={Slash} title="No dismissed recommendations" sub="Rejected recommendations are kept here with a restore option." />;
  }
  return (
    <div className="space-y-2">
      {items.map((s) => (
        <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-foreground/[0.01] opacity-70">
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-foreground/60 leading-tight">{s.title}</p>
            <p className="text-label text-muted-foreground/75 mt-0.5 leading-tight line-clamp-1">{deriveLabel(s.rationale, 90)}</p>
          </div>
          <button onClick={() => onRestore(s.id)} className="pressable h-6 px-2 rounded text-label font-medium text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/50 transition-colors shrink-0" title="Restore to deck">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ Icon, title, sub }: { Icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground/75" />
      </div>
      <p className="text-title font-bold text-foreground/60">{title}</p>
      <p className="text-caption text-muted-foreground/75 max-w-xs">{sub}</p>
    </div>
  );
}

// ─── Helper: map a recommendation card to an action group ──────────────

export function actionGroupForScope(scope: string): string {
  switch (scope) {
    case "creative": return "Creative actions";
    case "funnel": return "Strategy updates";
    case "placement": return "Strategy updates";
    case "ad_account": return "Account setup";
    default: return "Budget actions";
  }
}
