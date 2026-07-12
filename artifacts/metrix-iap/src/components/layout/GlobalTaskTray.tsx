// ─── Global Task Tray Panel ────────────────────────────────────────────
// Slide-in right panel showing all approved tasks across all scopes.
// Accessible from the Topbar button at any time.

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { X, Check, RotateCcw, ClipboardList, ExternalLink } from "lucide-react";
import {
  useDecisions,
  getAllApproved,
  toggleDone,
  setDecision,
} from "@/lib/data/decisionStore";

const GROUP_ORDER = [
  "Budget actions",
  "Creative actions",
  "Strategy updates",
  "Brief updates",
  "MST setup actions",
  "Account setup",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function useApprovedCount() {
  useDecisions();
  return getAllApproved().length;
}

export function GlobalTaskTray({ open, onClose }: Props) {
  useDecisions();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const items = getAllApproved();
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const groups = GROUP_ORDER.map((g) => ({
    label: g,
    rows: pending.filter((i) => i.meta.actionGroup === g),
  })).filter((g) => g.rows.length);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-background/30 backdrop-blur-[2px] z-40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Task tray"
        className={cn(
          "fixed right-0 top-0 h-full w-[360px] max-w-full z-50",
          "bg-[hsl(222_61%_6%)] border-l border-border/50 shadow-2xl",
          "flex flex-col overflow-hidden",
          "transition-transform duration-250 ease-out focus-visible:outline-none",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
            <ClipboardList className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
              Task Tray
            </div>
            <div className="text-[13px] font-semibold text-foreground leading-tight">
              {pending.length === 0
                ? "All caught up"
                : `${pending.length} action${pending.length !== 1 ? "s" : ""} to implement`}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close task tray"
            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="w-12 h-12 rounded-xl border border-border/40 bg-white/[0.02] flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-foreground/60">No approved tasks yet</p>
                <p className="text-[11px] text-muted-foreground/50 mt-1 max-w-[220px] leading-snug">
                  Approve recommendations from the deck — they'll land here as manual tasks.
                </p>
              </div>
              <a
                href="/app/listen/recommendations"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, "", "/app/listen/recommendations");
                  window.dispatchEvent(new PopStateEvent("popstate"));
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary border border-primary/25 bg-primary/[0.06] hover:bg-primary/10 rounded-md px-3 py-1.5 transition-colors mt-1"
              >
                <ExternalLink className="w-3 h-3" />
                Go to Recommendations
              </a>
            </div>
          ) : (
            <>
              {/* Pending tasks by group */}
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-2">
                    {g.label}
                  </div>
                  <div className="space-y-2">
                    {g.rows.map((item) => (
                      <TaskItem
                        key={`${item.scopeId}::${item.cardId}`}
                        item={item}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Done section */}
              {done.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2">
                    Done ({done.length})
                  </div>
                  <div className="space-y-1.5">
                    {done.map((item) => (
                      <TaskItem
                        key={`${item.scopeId}::${item.cardId}`}
                        item={item}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        {items.length > 0 && (
          <div className="px-4 py-3 border-t border-border/30 shrink-0">
            <p className="text-[10px] text-muted-foreground/40 leading-snug">
              Approved recommendations become manual tasks — they are never auto-applied.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function TaskItem({
  item,
}: {
  item: { scopeId: string; cardId: string; meta: import("@/lib/data/decisionStore").CardMeta; done: boolean };
}) {
  const { scopeId, cardId, meta, done } = item;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        done
          ? "border-emerald-400/15 bg-white/[0.01] opacity-50"
          : "border-border/40 bg-white/[0.02] hover:border-border/60"
      )}
    >
      {/* Done toggle */}
      <button
        onClick={() => toggleDone(scopeId, cardId)}
        className={cn(
          "mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
          done
            ? "bg-emerald-400/20 border-emerald-400/40 text-emerald-400"
            : "border-border/50 text-transparent hover:border-primary/50 hover:bg-primary/5"
        )}
        aria-label={done ? "Mark not done" : "Mark done"}
      >
        <Check className="w-2.5 h-2.5" />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[12px] font-medium leading-tight",
            done ? "text-foreground/40 line-through" : "text-foreground"
          )}
        >
          {meta.title}
        </p>
        {!done && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-snug line-clamp-2">
            {meta.recommendedAction}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {meta.descriptor && (
            <span className="text-[8px] font-semibold border border-border/40 px-1.5 py-0.5 rounded text-foreground/50 leading-none">
              {meta.descriptor}
            </span>
          )}
          {meta.scopeLabel && (
            <span className="text-[8px] text-muted-foreground/40 font-mono">
              {meta.scopeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Restore */}
      <button
        onClick={() => setDecision(scopeId, cardId, "pending")}
        title="Return to deck"
        className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-colors shrink-0"
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    </div>
  );
}
