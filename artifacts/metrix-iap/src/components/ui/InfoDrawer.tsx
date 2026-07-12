// ─── Info drawer ──────────────────────────────────────────────────────
// Generic right-side detail drawer used for drill-downs across modules.
// Wider than a standard panel — 600px on large screens, full below.

import { useEffect } from "react";
import { X } from "lucide-react";

export function InfoDrawer({
  kicker,
  title,
  onClose,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
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

      {/* Slide-over panel — wider to fill more screen real estate */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[540px] lg:w-[620px] bg-[hsl(222_61%_5.5%)] border-l border-border/50 z-50 flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border/40 bg-white/[0.01] shrink-0">
            {footer}
          </div>
        )}
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
