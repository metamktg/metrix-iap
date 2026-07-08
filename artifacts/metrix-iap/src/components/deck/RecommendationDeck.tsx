// ─── Recommendation Deck ──────────────────────────────────────────────
// Reusable decision swiper used by Manager Overview and Ad Account Overview.
// Inputs: mouse drag, touch drag, keyboard arrows (after focus), buttons.
//   swipe right / →  = Approve  → Task Tray (manual implementation task)
//   swipe left  / ←  = Reject   → Dismissed Log (restorable)
//   tap / Space / ↑  = Open details
//   Ctrl/Cmd+Z       = Undo last decision
// Approved cards NEVER auto-edit campaigns.

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
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
  high: "bg-red-400/10 text-red-300 border-red-400/20",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  low: "bg-muted text-muted-foreground/60 border-border/40",
  setup: "bg-primary/10 text-primary border-primary/20",
};

const SCOPE_STYLE: Record<string, string> = {
  creative: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  funnel: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  placement: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  ad_account: "bg-primary/10 text-primary border-primary/20",
  campaign: "bg-primary/10 text-primary border-primary/20",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", cls)}>
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
      <div className="fixed right-0 top-0 h-full w-[400px] max-w-full bg-[hsl(222_61%_6%)] border-l border-border/50 z-50 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest mb-1">
              Recommendation
            </div>
            <p className="text-[13px] font-semibold text-foreground leading-tight">{card.title}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {card.descriptor && <Badge text={card.descriptor} cls="bg-white/[0.04] text-foreground/70 border-border/40" />}
            <Badge text={card.scope} cls={SCOPE_STYLE[card.scope] ?? "bg-muted text-muted-foreground/60 border-border/40"} />
            <Badge text={`${card.impact} impact`} cls={IMPACT_STYLE[card.impact] ?? IMPACT_STYLE.low} />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Rationale</label>
            <p className="text-[12px] text-foreground/80 leading-relaxed">{card.rationale}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Recommended action</label>
            <p className="text-[12px] text-foreground/80 leading-relaxed">{card.recommendedAction}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Confidence</label>
            <p className="text-[12px] text-foreground/80 capitalize">{card.confidence}</p>
          </div>

          {onSegments && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Evidence segments</label>
              <div>
                <button
                  onClick={() => onSegments(card)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary border border-primary/30 bg-primary/10 hover:bg-primary/15 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <LayoutGrid className="w-3 h-3" />
                  Avatar × placement drill-down
                </button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-400/80 leading-relaxed">
              Approving adds a manual implementation task. No auto-changes are applied to live campaigns.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border/40 flex items-center gap-2">
          <button
            onClick={() => { onReject(); onClose(); }}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded border border-border/50 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Reject
          </button>
          <button
            onClick={() => { onApprove(); onClose(); }}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded bg-primary/15 border border-primary/30 text-[12px] font-medium text-primary hover:bg-primary/25 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Swipe card (interactive, top of stack) ───────────────────────────

function SwipeCard({
  card,
  onApprove,
  onReject,
  onDetails,
  depth,
}: {
  card: DeckCard;
  onApprove: () => void;
  onReject: () => void;
  onDetails: () => void;
  depth: number; // 0 = top, deeper = behind
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const moved = useRef(0);
  const isTop = depth === 0;

  const THRESHOLD = 110;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTop) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startX.current = e.clientX;
    moved.current = 0;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !isTop) return;
    const delta = e.clientX - startX.current;
    moved.current = Math.max(moved.current, Math.abs(delta));
    setDx(delta);
  };

  const commit = (dir: "left" | "right") => {
    setDx(dir === "right" ? 600 : -600);
    window.setTimeout(() => {
      if (dir === "right") onApprove();
      else onReject();
      setDx(0);
    }, 160);
  };

  const onPointerUp = () => {
    if (!isTop) return;
    setDragging(false);
    if (dx > THRESHOLD) commit("right");
    else if (dx < -THRESHOLD) commit("left");
    else if (moved.current < 6) onDetails();
    else setDx(0);
  };

  const rot = dx / 22;
  const approveOpacity = Math.min(Math.max(dx / THRESHOLD, 0), 1);
  const rejectOpacity = Math.min(Math.max(-dx / THRESHOLD, 0), 1);

  return (
    <div
      className={cn(
        "absolute inset-0 select-none",
        !isTop && "pointer-events-none"
      )}
      style={{
        transform: isTop
          ? `translateX(${dx}px) rotate(${rot}deg)`
          : `scale(${1 - depth * 0.04}) translateY(${depth * 10}px)`,
        transition: dragging ? "none" : "transform 0.18s ease-out",
        zIndex: 10 - depth,
        opacity: depth > 2 ? 0 : 1,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { setDragging(false); setDx(0); }}
    >
      <div
        className={cn(
          "relative h-full flex flex-col gap-3 p-5 rounded-2xl border bg-[hsl(222_50%_7%)]",
          isTop ? "border-border/60 shadow-2xl cursor-grab active:cursor-grabbing" : "border-border/40"
        )}
      >
        {/* Swipe intent overlays */}
        {isTop && (
          <>
            <div
              className="absolute top-4 left-4 text-[11px] font-bold uppercase tracking-widest text-emerald-400 border-2 border-emerald-400 rounded px-2 py-1 rotate-[-12deg]"
              style={{ opacity: approveOpacity }}
            >
              Approve
            </div>
            <div
              className="absolute top-4 right-4 text-[11px] font-bold uppercase tracking-widest text-red-400 border-2 border-red-400 rounded px-2 py-1 rotate-[12deg]"
              style={{ opacity: rejectOpacity }}
            >
              Reject
            </div>
          </>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          {card.descriptor && <Badge text={card.descriptor} cls="bg-white/[0.04] text-foreground/70 border-border/40" />}
          <Badge text={card.scope} cls={SCOPE_STYLE[card.scope] ?? "bg-muted text-muted-foreground/60 border-border/40"} />
          <Badge text={`${card.impact} impact`} cls={IMPACT_STYLE[card.impact] ?? IMPACT_STYLE.low} />
        </div>

        <div>
          <p className="text-[14px] font-semibold text-foreground leading-snug">{card.title}</p>
        </div>

        <p className="text-[12px] text-muted-foreground/70 leading-relaxed line-clamp-3">{card.rationale}</p>

        <div className="mt-auto pt-2 border-t border-border/20">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-1">Recommended</p>
          <p className="text-[11px] text-foreground/75 leading-relaxed line-clamp-2">{card.recommendedAction}</p>
        </div>
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

  const approve = useCallback((id: string) => setDecision(scopeId, id, "approved"), [scopeId]);
  const reject = useCallback((id: string) => setDecision(scopeId, id, "rejected"), [scopeId]);
  const restore = useCallback((id: string) => setDecision(scopeId, id, "pending"), [scopeId]);

  // Keyboard on deck
  useEffect(() => {
    if (tab !== "deck") return;
    function onKey(e: KeyboardEvent) {
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
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border/40 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 text-[12px] font-medium border-b-2 transition-colors",
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground/60 hover:text-foreground"
            )}
          >
            <t.Icon className="w-3 h-3" />
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                t.id === "tray" ? "bg-emerald-400/15 text-emerald-400"
                  : t.id === "dismissed" ? "bg-muted text-muted-foreground/60"
                  : "bg-primary/15 text-primary"
              )}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "deck" && (
        pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400/60" />
            </div>
            <p className="text-[13px] font-medium text-foreground/60">{emptyLabel}</p>
            <p className="text-[11px] text-muted-foreground/60">Check the Task Tray for approved items.</p>
          </div>
        ) : (
          <div>
            {/* Card stack */}
            <div
              ref={deckRef}
              tabIndex={0}
              className="relative w-full max-w-md mx-auto h-[300px] focus-visible:outline-none"
              aria-label="Recommendation deck. Use arrow keys to decide."
            >
              {pending.slice(0, 3).map((c, i) => (
                <SwipeCard
                  key={c.id}
                  card={c}
                  depth={i}
                  onApprove={() => approve(c.id)}
                  onReject={() => reject(c.id)}
                  onDetails={() => setDetailId(c.id)}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={() => reject(pending[0].id)}
                className="w-11 h-11 rounded-full flex items-center justify-center border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors"
                aria-label="Reject"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={() => setDetailId(pending[0].id)}
                className="w-9 h-9 rounded-full flex items-center justify-center border border-border/40 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                aria-label="Details"
              >
                <Info className="w-4 h-4" />
              </button>
              <button
                onClick={() => approve(pending[0].id)}
                className="w-11 h-11 rounded-full flex items-center justify-center border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                aria-label="Approve"
              >
                <Check className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 mt-3 text-[9px] text-muted-foreground/60 font-mono">
              <span>← reject</span>
              <span>→ approve</span>
              <span>↑ / space details</span>
              <span>{pending.length} left</span>
            </div>

            {onSegments && (
              <div className="flex justify-center mt-3">
                <button
                  onClick={() => onSegments(pending[0])}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary/90 hover:text-primary border border-primary/25 bg-primary/[0.06] hover:bg-primary/10 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  <LayoutGrid className="w-3 h-3" />
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
      <EmptyPanel Icon={ClipboardList} title="No approved tasks yet" sub="Approved recommendations appear here as manual implementation tasks." />
    );
  }
  const groups = TRAY_GROUP_ORDER.map((g) => ({ label: g, rows: items.filter((i) => i.actionGroup === g) })).filter((g) => g.rows.length);

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">{g.label}</div>
          <div className="space-y-2">
            {g.rows.map((s) => {
              const done = isDone(scopeId, s.id);
              return (
                <div key={s.id} className={cn("flex items-start gap-3 p-3 rounded-lg border bg-white/[0.02]", done ? "border-emerald-400/20 opacity-60" : "border-border/40")}>
                  <button
                    onClick={() => toggleDone(scopeId, s.id)}
                    className={cn("mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", done ? "bg-emerald-400/20 border-emerald-400/40 text-emerald-400" : "border-border/50 text-transparent hover:border-border/70")}
                    aria-label={done ? "Mark not done" : "Mark done"}
                  >
                    <Check className="w-2.5 h-2.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[12px] font-medium leading-tight", done ? "text-foreground/50 line-through" : "text-foreground")}>{s.title}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight line-clamp-2">{s.recommendedAction}</p>
                    {s.descriptor && <span className="inline-flex mt-1.5 text-[8px] font-semibold border border-border/40 px-1 py-0.5 rounded text-foreground/60">{s.descriptor}</span>}
                  </div>
                  <button onClick={() => onRestore(s.id)} className="h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/50 transition-colors shrink-0" title="Restore to deck">
                    <RotateCcw className="w-3 h-3" />
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
        <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.01] opacity-70">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground/60 leading-tight">{s.title}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight line-clamp-1">{s.rationale}</p>
          </div>
          <button onClick={() => onRestore(s.id)} className="h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/50 transition-colors shrink-0" title="Restore to deck">
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ Icon, title, sub }: { Icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground/60" />
      </div>
      <p className="text-[13px] font-medium text-foreground/60">{title}</p>
      <p className="text-[11px] text-muted-foreground/60 max-w-xs">{sub}</p>
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
