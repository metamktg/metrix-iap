// ─── Task Tray Panel ──────────────────────────────────────────────────
// Persistent right-side panel showing approved recommendation tasks.
// Used in AdAccountOverview (right column) and in the InfoDrawer
// when a cell detail is open.

import { Check, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDecisions, getDecision, toggleDone, isDone } from "@/lib/data/decisionStore";
import type { DeckCard } from "@/components/deck/RecommendationDeck";

export function TaskTrayPanel({
  scopeId,
  cards,
  compact = false,
}: {
  scopeId: string;
  cards: DeckCard[];
  compact?: boolean;
}) {
  useDecisions();
  const approved = cards.filter((c) => getDecision(scopeId, c.id) === "approved");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-2 border-b border-border/40 shrink-0 bg-white/[0.01]",
        compact ? "px-3 py-2.5" : "px-4 py-3"
      )}>
        <ClipboardList className={cn("text-primary/80 shrink-0", compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
        <span className={cn(
          "font-bold uppercase tracking-widest text-foreground/70",
          compact ? "text-[9px]" : "text-[10px]"
        )}>
          Task Tray
        </span>
        {approved.length > 0 && (
          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 border border-emerald-400/25 tabular-nums shrink-0">
            {approved.length}
          </span>
        )}
      </div>

      {/* Tasks */}
      <div className={cn(
        "flex-1 overflow-y-auto min-h-0",
        compact ? "px-2.5 py-2.5" : "px-3 py-3"
      )}>
        {approved.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center px-2">
            <div className={cn(
              "rounded-xl border border-border/30 bg-white/[0.02] flex items-center justify-center",
              compact ? "w-7 h-7" : "w-9 h-9"
            )}>
              <ClipboardList className={cn("text-muted-foreground/25", compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
            </div>
            <p className="text-[10px] text-muted-foreground/50 font-medium leading-tight">No approved tasks</p>
            <p className="text-[9px] text-muted-foreground/35 leading-relaxed max-w-[140px]">
              Approve recommendations from the loop to add tasks here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {approved.map((s) => {
              const done = isDone(scopeId, s.id);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border bg-white/[0.02] transition-opacity",
                    compact ? "p-2" : "p-2.5",
                    done ? "border-emerald-400/20 opacity-55" : "border-border/40 hover:border-border/60"
                  )}
                >
                  <button
                    onClick={() => toggleDone(scopeId, s.id)}
                    className={cn(
                      "mt-[1px] w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                      done
                        ? "bg-emerald-400/20 border-emerald-400/40 text-emerald-400"
                        : "border-border/50 text-transparent hover:border-primary/50"
                    )}
                    aria-label={done ? "Mark not done" : "Mark done"}
                  >
                    <Check className="w-2 h-2" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium leading-tight",
                      compact ? "text-[10px]" : "text-[11px]",
                      done ? "text-foreground/40 line-through" : "text-foreground"
                    )}>
                      {s.title}
                    </p>
                    {!compact && (
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5 leading-tight line-clamp-2">
                        {s.recommendedAction}
                      </p>
                    )}
                    <span className="inline-flex mt-1 text-[8px] font-semibold border border-border/30 bg-white/[0.03] px-1 py-0.5 rounded text-muted-foreground/55 uppercase tracking-wide">
                      {s.actionGroup.replace(" actions", "").replace(" updates", "")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={cn(
        "shrink-0 border-t border-border/30 bg-white/[0.005]",
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      )}>
        <p className="text-[8.5px] text-muted-foreground/30 leading-relaxed text-center">
          Approve from loop · never auto-applied
        </p>
      </div>
    </div>
  );
}
