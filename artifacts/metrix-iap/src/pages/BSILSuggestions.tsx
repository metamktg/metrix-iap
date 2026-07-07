import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCheck,
  X,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  DollarSign,
  AlertTriangle,
  InboxIcon,
  ClipboardList,
  Slash,
} from "lucide-react";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { BSIL_SUGGESTIONS } from "@/lib/mock-data";
import type { BSILSuggestion } from "@/lib/types";

// ─── Helpers ───────────────────────────────────────────────────────────

type CardAction = "pending" | "approved" | "rejected";

interface ActionState {
  actions: Record<string, CardAction>;
  lastAction: { id: string; prev: CardAction } | null;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high:                "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  medium:              "bg-amber-400/10 text-amber-400 border-amber-400/20",
  validation_required: "bg-blue-400/10 text-blue-300 border-blue-400/20",
  insufficient:        "bg-muted text-muted-foreground/50 border-border/40",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high:                "High confidence",
  medium:              "Medium confidence",
  validation_required: "Validate first",
  insufficient:        "Insufficient data",
};

const SUGGESTION_LABEL: Record<string, string> = {
  scale_up:        "Scale up budget",
  scale_down:      "Scale back budget",
  increase_budget: "Scale up budget",
  decrease_budget: "Scale back budget",
  reallocate:      "Reallocate budget",
  reallocate_budget: "Reallocate budget",
  kill:            "Pause / kill",
  pause:           "Pause",
  retest:          "Retest",
};

const SCOPE_STYLE: Record<string, string> = {
  campaign: "bg-primary/10 text-primary border-primary/20",
  ad_set:   "bg-purple-400/10 text-purple-300 border-purple-400/20",
};

function formatDelta(s: BSILSuggestion): string {
  const sign = (s.suggested_delta_usd ?? 0) > 0 ? "+" : "";
  const usd  = s.suggested_delta_usd != null ? `${sign}$${Math.abs(s.suggested_delta_usd).toLocaleString()}` : "";
  const pct  = s.suggested_delta_pct != null ? `${sign}${s.suggested_delta_pct.toFixed(0)}%` : "";
  return [usd, pct].filter(Boolean).join(" / ");
}

// ─── Detail Drawer ─────────────────────────────────────────────────────

function SuggestionDetailDrawer({
  suggestion,
  onClose,
  onApprove,
  onReject,
}: {
  suggestion: BSILSuggestion;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = SUGGESTION_LABEL[suggestion.suggestion_type] ?? suggestion.suggestion_type;

  return (
    <>
      <div className="fixed inset-0 bg-background/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[400px] max-w-full bg-[hsl(222_61%_6%)] border-l border-border/50 z-50 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-1">Suggestion Detail</div>
            <p className="text-[13px] font-semibold text-foreground leading-tight">{label}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">Entity</label>
            <p className="text-[12px] font-medium text-foreground">{suggestion.entity_name}</p>
            <div className="flex items-center gap-2">
              <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide", SCOPE_STYLE[suggestion.budget_scope_object])}>{suggestion.budget_scope_object}</span>
              <span className="text-[9px] font-mono text-muted-foreground/40">{suggestion.entity_id}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">Recommendation</label>
            <div className="text-[12px] font-semibold text-foreground">{label}</div>
            {(suggestion.suggested_delta_usd != null || suggestion.suggested_delta_pct != null) && (
              <div className="text-[11px] text-amber-400 font-mono">{formatDelta(suggestion)}</div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">Rationale</label>
            <p className="text-[12px] text-foreground/80 leading-relaxed">{suggestion.rationale}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">Signal quality</label>
            <span className={cn("inline-flex text-[10px] font-semibold border px-2 py-1 rounded", CONFIDENCE_STYLE[suggestion.confidence_grade])}>
              {CONFIDENCE_LABEL[suggestion.confidence_grade] ?? suggestion.confidence_grade}
            </span>
          </div>

          <div className="space-y-1.5 border-t border-border/30 pt-4">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">Source</label>
            <div className="space-y-1 text-[10px] font-mono text-muted-foreground/50">
              <div>Run: <span className="text-muted-foreground/70">{suggestion.run_id}</span></div>
              <div>Cohort: <span className="text-muted-foreground/70">{suggestion.cohort_key}</span></div>
              <div>Table: <span className="text-muted-foreground/70">bsil_suggestions</span></div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-400/80 leading-relaxed">
              Approved suggestions become manual implementation tasks. No auto-changes are applied to live campaigns.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border/40 flex items-center gap-2">
          <button onClick={() => { onReject(); onClose(); }} className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded border border-border/50 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <X className="w-3.5 h-3.5" /> Reject
          </button>
          <button onClick={() => { onApprove(); onClose(); }} className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded bg-primary/15 border border-primary/30 text-[12px] font-medium text-primary hover:bg-primary/25 transition-colors">
            <CheckCheck className="w-3.5 h-3.5" /> Approve
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Suggestion Card ───────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  isFocused,
  onFocus,
  onApprove,
  onReject,
  onDetails,
}: {
  suggestion: BSILSuggestion;
  isFocused: boolean;
  onFocus: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDetails: () => void;
}) {
  const label = SUGGESTION_LABEL[suggestion.suggestion_type] ?? suggestion.suggestion_type;
  const delta = formatDelta(suggestion);

  return (
    <div
      role="article"
      tabIndex={0}
      onClick={onFocus}
      onFocus={onFocus}
      className={cn(
        "relative flex flex-col gap-3 p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-none",
        isFocused
          ? "border-primary/40 bg-primary/[0.04] shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
          : "border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.03]"
      )}
    >
      {isFocused && (
        <div className="absolute top-2 right-2 flex items-center gap-2 text-[9px] text-muted-foreground/25 font-mono">
          <span><span className="border border-border/30 rounded px-1">←</span> reject</span>
          <span><span className="border border-border/30 rounded px-1">→</span> approve</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide", SCOPE_STYLE[suggestion.budget_scope_object])}>
          {suggestion.budget_scope_object}
        </span>
        <span className={cn("text-[9px] font-medium border px-1.5 py-0.5 rounded", CONFIDENCE_STYLE[suggestion.confidence_grade])}>
          {CONFIDENCE_LABEL[suggestion.confidence_grade]}
        </span>
      </div>

      <div>
        <p className="text-[12px] font-semibold text-foreground leading-tight">{label}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-tight truncate">{suggestion.entity_name}</p>
      </div>

      {delta && (
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3 h-3 text-amber-400/70 shrink-0" />
          <span className="text-[11px] font-mono text-amber-400">{delta}</span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-2">{suggestion.rationale}</p>

      <div className="flex items-center gap-2 pt-1 border-t border-border/20">
        <button onClick={(e) => { e.stopPropagation(); onReject(); }} className="flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium text-muted-foreground hover:text-red-400 hover:bg-red-400/5 border border-transparent hover:border-red-400/20 transition-colors">
          <X className="w-3 h-3" /> Reject
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDetails(); }} className="flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent hover:border-border/40 transition-colors">
          <ChevronDown className="w-3 h-3" /> Details
        </button>
        <button onClick={(e) => { e.stopPropagation(); onApprove(); }} className="ml-auto flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors">
          <CheckCheck className="w-3 h-3" /> Approve
        </button>
      </div>
    </div>
  );
}

// ─── Task Tray ─────────────────────────────────────────────────────────

const TRAY_GROUPS: Record<string, string[]> = {
  "Budget actions":   ["scale_up", "scale_down", "kill", "pause"],
  "Strategy updates": ["retest"],
};

function TaskTray({ items, onRestore }: { items: BSILSuggestion[]; onRestore: (id: string) => void; }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center mx-auto">
          <ClipboardList className="w-4 h-4 text-muted-foreground/40" />
        </div>
        <p className="text-[13px] font-medium text-foreground/60">No approved tasks yet</p>
        <p className="text-[11px] text-muted-foreground/40">Approved suggestions appear here as manual implementation tasks.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {Object.entries(TRAY_GROUPS).map(([groupLabel, types]) => {
        const group = items.filter(s => types.includes(s.suggestion_type));
        if (!group.length) return null;
        return (
          <div key={groupLabel}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2">{groupLabel}</div>
            <div className="space-y-2">
              {group.map(s => (
                <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground leading-tight">{SUGGESTION_LABEL[s.suggestion_type]} — {s.entity_name}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-tight line-clamp-2">{s.rationale}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={cn("text-[8px] font-semibold border px-1 py-0.5 rounded uppercase", SCOPE_STYLE[s.budget_scope_object])}>{s.budget_scope_object}</span>
                      {formatDelta(s) && <span className="text-[9px] font-mono text-amber-400/70">{formatDelta(s)}</span>}
                    </div>
                  </div>
                  <button onClick={() => onRestore(s.id)} className="h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/50 transition-colors shrink-0" title="Restore to pending">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dismissed Log ─────────────────────────────────────────────────────

function DismissedLog({ items, onRestore }: { items: BSILSuggestion[]; onRestore: (id: string) => void; }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center mx-auto">
          <Slash className="w-4 h-4 text-muted-foreground/40" />
        </div>
        <p className="text-[13px] font-medium text-foreground/60">No rejected suggestions</p>
        <p className="text-[11px] text-muted-foreground/40">Rejected suggestions appear here with a restore option.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(s => (
        <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.01] opacity-70">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground/60 leading-tight">{SUGGESTION_LABEL[s.suggestion_type]} — {s.entity_name}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5 leading-tight line-clamp-1">{s.rationale}</p>
            <span className={cn("inline-flex mt-1.5 text-[8px] font-semibold border px-1 py-0.5 rounded uppercase opacity-60", SCOPE_STYLE[s.budget_scope_object])}>{s.budget_scope_object}</span>
          </div>
          <button onClick={() => onRestore(s.id)} className="h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/50 transition-colors shrink-0" title="Restore to pending">
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────

type TabId = "pending" | "tray" | "dismissed";

export function BSILSuggestions() {
  const { currentWorkspace } = useWorkspace();

  const suggestions = BSIL_SUGGESTIONS.filter(s => s.workspace_id === currentWorkspace.id);

  const [state, setState] = useState<ActionState>({ actions: {}, lastAction: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("pending");
  const [focusIndex, setFocusIndex] = useState(0);

  const getAction = (id: string): CardAction => state.actions[id] ?? "pending";

  const pending  = suggestions.filter(s => getAction(s.id) === "pending");
  const approved = suggestions.filter(s => getAction(s.id) === "approved");
  const rejected = suggestions.filter(s => getAction(s.id) === "rejected");

  const act = useCallback((id: string, next: CardAction) => {
    setState(prev => ({
      actions: { ...prev.actions, [id]: next },
      lastAction: { id, prev: prev.actions[id] ?? "pending" },
    }));
  }, []);

  const undo = useCallback(() => {
    if (!state.lastAction) return;
    const { id, prev } = state.lastAction;
    setState(prev2 => ({ actions: { ...prev2.actions, [id]: prev }, lastAction: null }));
  }, [state.lastAction]);

  // Keyboard shortcuts on pending deck
  useEffect(() => {
    if (tab !== "pending" || !pending.length) return;
    function onKey(e: KeyboardEvent) {
      const card = pending[focusIndex];
      if (!card) return;
      if (e.key === "ArrowRight") { e.preventDefault(); act(card.id, "approved"); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); act(card.id, "rejected"); }
      if (e.key === "ArrowUp" || e.key === "Enter") { e.preventDefault(); setDetailId(card.id); }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, pending, focusIndex, act, undo]);

  const detailSuggestion = detailId ? suggestions.find(s => s.id === detailId) ?? null : null;

  const TABS = [
    { id: "pending"   as TabId, label: "Pending",   count: pending.length,  Icon: InboxIcon,      activeCls: "bg-primary/20 text-primary" },
    { id: "tray"      as TabId, label: "Task Tray", count: approved.length, Icon: ClipboardList,  activeCls: "bg-emerald-400/15 text-emerald-400" },
    { id: "dismissed" as TabId, label: "Dismissed", count: rejected.length, Icon: Slash,          activeCls: "bg-muted text-muted-foreground/50" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/40">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest block mb-1">Listen · 01</span>
            <h1 className="text-[18px] font-semibold text-foreground leading-tight">Suggestions</h1>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5">Signal intake, alerts, and decision-ready suggestions.</p>
          </div>
          <div className="shrink-0 pt-1">
            <DataSourceBadge table="bsil_suggestions" collapsible />
          </div>
        </div>
        <div className="flex items-start gap-2 mt-4 p-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04]">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-400/80 leading-relaxed">
            BSIL operates at <strong>campaign</strong> and <strong>ad_set</strong> scope only. No creative-level budget suggestions are generated.
            Approved suggestions create manual implementation tasks — no auto-changes are applied.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-6 border-b border-border/40 flex items-center gap-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 h-10 px-3 text-[12px] font-medium border-b-2 transition-colors",
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground/60 hover:text-foreground"
            )}
          >
            <t.Icon className="w-3 h-3" />
            {t.label}
            {t.count > 0 && (
              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", t.activeCls)}>{t.count}</span>
            )}
          </button>
        ))}
        {state.lastAction && (
          <button
            onClick={undo}
            className="ml-auto flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/60 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Undo
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "pending" && (
          pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center mx-auto">
                <InboxIcon className="w-4 h-4 text-muted-foreground/40" />
              </div>
              <p className="text-[13px] font-medium text-foreground/60">All suggestions reviewed</p>
              <p className="text-[11px] text-muted-foreground/40">Check the Task Tray for approved items.</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground/30 font-mono mb-1">
                <span className="flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> reject</span>
                <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3" /> approve</span>
                <span>↑ / Enter  details</span>
              </div>
              {pending.map((s, i) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  isFocused={focusIndex === i}
                  onFocus={() => setFocusIndex(i)}
                  onApprove={() => act(s.id, "approved")}
                  onReject={() => act(s.id, "rejected")}
                  onDetails={() => setDetailId(s.id)}
                />
              ))}
            </div>
          )
        )}
        {tab === "tray" && (
          <div className="max-w-2xl">
            <TaskTray items={approved} onRestore={(id) => act(id, "pending")} />
          </div>
        )}
        {tab === "dismissed" && (
          <div className="max-w-2xl">
            <DismissedLog items={rejected} onRestore={(id) => act(id, "pending")} />
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {detailSuggestion && (
        <SuggestionDetailDrawer
          suggestion={detailSuggestion}
          onClose={() => setDetailId(null)}
          onApprove={() => { act(detailSuggestion.id, "approved"); setDetailId(null); }}
          onReject={() => { act(detailSuggestion.id, "rejected"); setDetailId(null); }}
        />
      )}
    </div>
  );
}
