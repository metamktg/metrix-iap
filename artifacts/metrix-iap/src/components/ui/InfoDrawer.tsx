// ─── Info drawer ──────────────────────────────────────────────────────
// Generic right-side slide-over used for drill-downs across modules.
// When a `taskTray` node is passed, a narrow right column hosts it so
// the tray stays visible alongside the detail content.

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function InfoDrawer({
  kicker,
  title,
  onClose,
  children,
  footer,
  taskTray,
}: {
  kicker: string;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  taskTray?: React.ReactNode;
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
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/50 backdrop-blur-[2px] z-40" onClick={onClose} />

      {/* Slide-over panel — widens automatically when a task tray is present */}
      <div className={cn(
        "fixed right-0 top-0 h-full bg-[hsl(222_61%_5.5%)] border-l border-border/50 z-50 flex flex-col overflow-hidden shadow-2xl transition-[width]",
        taskTray
          ? "w-full sm:w-[760px] lg:w-[860px]"
          : "w-full sm:w-[540px] lg:w-[620px]"
      )}>

        {/* ── Full-width header ── */}
        <div className="flex items-start gap-3 px-6 py-5 border-b border-border/40 shrink-0 bg-white/[0.01]">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest mb-1.5 leading-none">{kicker}</div>
            <p className="text-[16px] font-bold text-foreground leading-snug">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.06] border border-transparent hover:border-border/30 transition-all shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Two-column body (or single column when no tray) ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Main content */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">{children}</div>
            {footer && (
              <div className="px-6 py-4 border-t border-border/40 bg-white/[0.01] shrink-0">
                {footer}
              </div>
            )}
          </div>

          {/* Task Tray right column — auto-loads when the drawer opens */}
          {taskTray && (
            <div className="w-[240px] shrink-0 border-l border-border/40 flex flex-col min-h-0">
              {taskTray}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function DrawerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</label>
      <div className="text-[13px] text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}
