// ─── Task Tray ────────────────────────────────────────────────────────
// Persistent right panel reserved for actionable workflow items.
// Analysis / data content stays in overlay drawers — this panel shows
// only "what to do next": hypotheses ready to brief, top signals,
// draft briefs pending review, and quick module jumps.

import { useLocation } from "wouter";
import { X, ClipboardList, Sparkles, AlertCircle, FileText, ArrowRight, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "@/contexts/AccountContext";
import { useTaskTray } from "@/contexts/TaskTrayContext";
import type { SignalCard } from "@/lib/data/seedTypes";

// ─── Sub-components ───────────────────────────────────────────────────

function TraySection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50">
          {title}
        </span>
        {count != null && count > 0 && (
          <span className="text-[9px] font-mono text-primary/60 bg-primary/10 border border-primary/15 rounded px-1 leading-tight">
            {count}
          </span>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function TrayItem({
  label,
  sub,
  onAction,
  actionLabel = "Brief →",
}: {
  label: string;
  sub?: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-md border border-border/30 bg-white/[0.025] px-2.5 py-2 space-y-1.5">
      <p className="text-[12px] font-medium text-foreground/85 leading-snug line-clamp-2">{label}</p>
      {sub && (
        <p className="text-[10px] text-muted-foreground/55 font-mono uppercase tracking-wide">{sub}</p>
      )}
      {onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/25 hover:bg-primary/18 hover:border-primary/40 rounded px-2 py-0.5 transition-colors"
        >
          {actionLabel}
          <ArrowRight className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

function TrayNavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors text-left"
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      {label}
      <ArrowRight className="w-2.5 h-2.5 ml-auto opacity-40" />
    </button>
  );
}

function Divider() {
  return <div className="mx-3 h-px bg-border/30" />;
}

function EmptySlot({ message }: { message: string }) {
  return (
    <p className="text-[11px] text-muted-foreground/40 italic px-0.5 py-1">{message}</p>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function TaskTray() {
  const { open, toggle, close } = useTaskTray();
  const { activeAdAccount } = useAccount();
  const [, navigate] = useLocation();

  const hypotheses = activeAdAccount?.iap?.strategy?.active_hypotheses ?? [];
  const signals = activeAdAccount?.listen?.signal_cards ?? [];
  const drafts = activeAdAccount?.iap?.brief_builder?.draft_briefs ?? [];

  const pendingDrafts = drafts.filter((b) => b.status !== "approved");
  const topHyps = hypotheses.slice(0, 3);
  const topSignals = signals.slice(0, 2);

  const totalItems = topHyps.length + topSignals.length + pendingDrafts.length;

  // ── Minimized strip mode: always present, never intrusive ───────────
  if (!open) {
    return (
      <div className="w-8 shrink-0 border-l border-border/40 bg-[hsl(222_61%_4.5%)] flex flex-col items-center pt-3 gap-3">
        <button
          onClick={toggle}
          title="Expand task tray"
          aria-label="Expand task tray"
          className="flex flex-col items-center gap-1.5 text-muted-foreground/40 hover:text-primary/70 transition-colors group"
        >
          <ClipboardList className="w-4 h-4 group-hover:scale-110 transition-transform" />
          {totalItems > 0 && (
            <span className="text-[8px] font-bold bg-primary/20 text-primary border border-primary/25 rounded-full w-4 h-4 flex items-center justify-center tabular-nums leading-none">
              {Math.min(totalItems, 9)}
            </span>
          )}
        </button>
        <div className="w-3 h-px bg-border/25" />
        <button
          onClick={toggle}
          title="Expand"
          aria-label="Expand task tray"
          className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-[264px] shrink-0 border-l border-border/40 bg-[hsl(222_61%_4.5%)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
        <ClipboardList className="w-3.5 h-3.5 text-primary/60 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/75 flex-1">
          Task Tray
        </span>
        {totalItems > 0 && (
          <span className="text-[9px] font-mono text-primary bg-primary/12 border border-primary/20 rounded-full px-1.5 py-px leading-tight">
            {totalItems}
          </span>
        )}
        <button
          onClick={close}
          aria-label="Close task tray"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* ── Hypotheses ready to brief ──────────────────────────────── */}
        <TraySection title="Ready to Brief" count={topHyps.length}>
          {topHyps.length === 0 ? (
            <EmptySlot message="No pending hypotheses" />
          ) : (
            topHyps.map((hyp) => (
              <TrayItem
                key={hyp.id}
                label={hyp.label}
                sub={hyp.status}
                onAction={() =>
                  navigate(
                    `/app/creative?fromHyp=${encodeURIComponent(hyp.id)}&from=strategy`
                  )
                }
                actionLabel="Create Brief"
              />
            ))
          )}
          <TrayNavLink
            to="/app/strategy/hypotheses"
            label="Hypothesis Queue"
            icon={Sparkles}
          />
        </TraySection>

        <Divider />

        {/* ── Draft briefs awaiting review ───────────────────────────── */}
        <TraySection title="Briefs Pending" count={pendingDrafts.length}>
          {pendingDrafts.length === 0 ? (
            <EmptySlot message="No pending briefs" />
          ) : (
            pendingDrafts.slice(0, 2).map((brief) => (
              <TrayItem
                key={brief.id}
                label={brief.human_direction}
                sub={`${brief.asset_type} · ${brief.status}`}
                onAction={() => navigate(`/app/creative/builder?focus=${encodeURIComponent(brief.id)}`)}
                actionLabel="Review"
              />
            ))
          )}
          <TrayNavLink to="/app/creative" label="Creative" icon={FileText} />
        </TraySection>

        <Divider />

        {/* ── Top signals ────────────────────────────────────────────── */}
        <TraySection title="Top Signals" count={topSignals.length}>
          {topSignals.length === 0 ? (
            <EmptySlot message="No signals" />
          ) : (
            topSignals.map((sig: SignalCard) => (
              <TrayItem
                key={sig.id}
                label={sig.title}
                sub={`${sig.impact} impact · ${sig.confidence}`}
              />
            ))
          )}
          <TrayNavLink to="/app/listen/signal" label="Signal View" icon={AlertCircle} />
        </TraySection>

        <Divider />

        {/* ── Quick module jumps ─────────────────────────────────────── */}
        <TraySection title="Quick Jump">
          <div className={cn("space-y-px")}>
            <TrayNavLink to="/app/analysis/library" label="IAP Library" icon={Zap} />
            <TrayNavLink to="/app/strategy/map" label="Strategy Map" icon={Zap} />
            <TrayNavLink to="/app/mst/sprints" label="MST Sprints" icon={Zap} />
            <TrayNavLink to="/app/reports" label="Reports" icon={Zap} />
          </div>
        </TraySection>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border/30">
        <p className="text-[9px] text-muted-foreground/35 leading-snug">
          Action items update as you work through analysis, strategy &amp; briefs.
        </p>
      </div>
    </div>
  );
}

/** Badge count for the Topbar toggle — number of actionable items. */
export function useTaskTrayCount(): number {
  const { activeAdAccount } = useAccount();
  const hypotheses = activeAdAccount?.iap?.strategy?.active_hypotheses ?? [];
  const signals = activeAdAccount?.listen?.signal_cards ?? [];
  const drafts = activeAdAccount?.iap?.brief_builder?.draft_briefs ?? [];
  const pendingDrafts = drafts.filter((b) => b.status !== "approved");
  return Math.min(hypotheses.slice(0, 3).length + signals.slice(0, 2).length + pendingDrafts.length, 99);
}
