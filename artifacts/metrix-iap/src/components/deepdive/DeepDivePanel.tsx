// ─── Deep-dive slide-over panel ───────────────────────────────────────
// The Nocturne "Metrix v1" right slide-over: breadcrumb trail (each crumb
// clickable to jump back), back button, Escape closes, stacked content
// blocks. Purely presentational — modules arrive fully built from
// lib/data/deepDive.ts, so opening or chaining never fetches.
//
// Rulebook: text sizes compose from TYPE roles only; full prose lives in
// notes/title attributes; ranked rows are plain <button>s (no nested
// popovers). Colors come from DS tokens / --mx-* aliases exclusively.

import { useEffect, useRef } from "react";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { useDeepDive } from "@/contexts/DeepDiveContext";
import type { DeepDiveBlock, DeepDiveRankedRow, DeepDiveStat } from "@/lib/data/deepDive";

// ─── Blocks ───────────────────────────────────────────────────────────

function StatsBlock({ title, stats }: { title: string; stats: DeepDiveStat[] }) {
  return (
    <section>
      <h4 className={cn(TYPE.microLabel, "mb-2")}>{title}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px rounded-lg overflow-hidden border border-border/40 bg-border/20">
        {stats.map((s) => (
          <div
            key={s.metricId}
            className="bg-surface-deep px-3 py-2 min-w-0"
            data-testid={`deep-dive-stat-${s.metricId}`}
            title={s.note}
          >
            <div className={cn(TYPE.microLabel, "truncate")}>{s.label}</div>
            <div
              className={cn(
                TYPE.body,
                "tabular-nums font-semibold",
                s.value === "n/a" ? "text-muted-foreground/40" : "text-foreground",
              )}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RankedBlock({
  title, metricLabel, rows, onDrill,
}: {
  title: string;
  metricLabel: string;
  rows: DeepDiveRankedRow[];
  onDrill: (row: DeepDiveRankedRow) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value ?? 0), 0);
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className={TYPE.microLabel}>{title}</h4>
        <span className={cn(TYPE.microLabel, "text-muted-foreground/40")}>{metricLabel}</span>
      </div>
      <div className="space-y-0.5" data-testid="deep-dive-ranked">
        {rows.map((r) => {
          const pct = max > 0 && r.value != null ? Math.max((r.value / max) * 100, 2) : 0;
          const inner = (
            <>
              <span className={cn(TYPE.body, "truncate min-w-0 flex-1 text-left", r.current ? "text-foreground font-semibold" : "text-foreground/85")}>
                {r.label}
              </span>
              <span className={cn(TYPE.body, "tabular-nums shrink-0", r.value == null ? "text-muted-foreground/40" : "text-foreground/75")}>
                {r.formatted}
              </span>
            </>
          );
          const barAndRow = (
            <span className="relative flex items-center gap-3 w-full px-2.5 py-1.5">
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 rounded-r bg-primary/10 pointer-events-none"
                style={{ width: `${pct}%` }}
              />
              {inner}
            </span>
          );
          if (r.current) {
            return (
              <div
                key={r.key}
                className="flex rounded-md border-l-2 border-primary bg-primary/5"
                data-testid={`deep-dive-row-current`}
                aria-current="true"
              >
                {barAndRow}
              </div>
            );
          }
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onDrill(r)}
              disabled={!r.drill}
              className={cn(
                "flex w-full rounded-md border-l-2 border-transparent transition-colors",
                r.drill && "hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
              )}
              data-testid={`deep-dive-row-${r.key}`}
              title={r.note ?? `Open the deep dive for ${r.label}`}
            >
              {barAndRow}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NoteBlock({ text }: { text: string }) {
  return (
    <p className={cn(TYPE.caption, "rounded-lg border border-border/30 bg-white/[0.02] p-3")} data-testid="deep-dive-note">
      {text}
    </p>
  );
}

function Block({ block, onDrill }: { block: DeepDiveBlock; onDrill: (row: DeepDiveRankedRow) => void }) {
  if (block.kind === "stats") return <StatsBlock title={block.title} stats={block.stats} />;
  if (block.kind === "ranked") return <RankedBlock title={block.title} metricLabel={block.metricLabel} rows={block.rows} onDrill={onDrill} />;
  return <NoteBlock text={block.text} />;
}

// ─── Panel ────────────────────────────────────────────────────────────

export function DeepDivePanel() {
  const { stack, push, pop, jumpTo, close } = useDeepDive();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = stack.length > 0;
  const current = stack[stack.length - 1];

  // Escape closes the whole panel (design handoff: Escape-to-close;
  // Back pops one module). Bound only while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Move focus into the panel when it opens or the top module changes.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, current?.id]);

  if (!open || !current) return null;

  const onDrill = (row: DeepDiveRankedRow) => {
    if (row.drill) push(row.drill());
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`Deep dive · ${current.title}`}
      data-testid="deep-dive-panel"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[560px] max-w-[760px] flex flex-col bg-surface-deep border-l border-[var(--mx-edge-strong)] shadow-[0_0_60px_rgba(0,0,0,0.5)] focus-visible:outline-none"
    >
      {/* ── Header: breadcrumbs + controls ─────────────────────────── */}
      <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-[var(--mx-edge-soft)] space-y-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {stack.length > 1 && (
            <button
              type="button"
              onClick={pop}
              aria-label="Back to previous deep dive"
              className="p-1 rounded hover:bg-white/[0.06] text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
              data-testid="deep-dive-back"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
          {/* Breadcrumb trail — every crumb but the last jumps back to it. */}
          <nav aria-label="Deep dive trail" className="flex items-center gap-1 min-w-0 overflow-hidden">
            {stack.map((m, i) => (
              <span key={`${m.id}-${i}`} className="flex items-center gap-1 min-w-0 shrink last:shrink-0">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" aria-hidden />}
                {i < stack.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => jumpTo(i)}
                    className={cn(TYPE.label, "truncate text-muted-foreground/55 hover:text-foreground transition-colors normal-case tracking-normal")}
                    data-testid={`deep-dive-crumb-${i}`}
                    title={m.title}
                  >
                    {m.title}
                  </button>
                ) : (
                  <span className={cn(TYPE.label, "truncate text-foreground/75 normal-case tracking-normal")} aria-current="page" title={m.title}>
                    {m.title}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <button
            type="button"
            onClick={close}
            aria-label="Close deep dive"
            className="ml-auto p-1 rounded hover:bg-white/[0.06] text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
            data-testid="deep-dive-close"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
        <div>
          <div className={TYPE.microLabel}>{current.kicker}</div>
          <h3 className={TYPE.title} data-testid="deep-dive-title">{current.title}</h3>
          {current.subtitle && (
            <div className={cn(TYPE.label, "font-mono text-muted-foreground/55 tracking-wide normal-case mt-0.5")}>
              {current.subtitle}
            </div>
          )}
        </div>
      </div>

      {/* ── Blocks ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {current.blocks.map((b, i) => (
          <Block key={i} block={b} onDrill={onDrill} />
        ))}
      </div>
    </div>
  );
}
