// ─── Info drawer ──────────────────────────────────────────────────────
// Generic right-side detail drawer used for drill-downs across modules.

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
      <div className="fixed inset-0 bg-background/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] max-w-full bg-[hsl(222_61%_6%)] border-l border-border/50 z-50 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-1">{kicker}</div>
            <p className="text-[13px] font-semibold text-foreground leading-tight">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">{children}</div>

        {footer && <div className="px-5 py-4 border-t border-border/40">{footer}</div>}
      </div>
    </>
  );
}

export function DrawerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">{label}</label>
      <div className="text-[12px] text-foreground/80 leading-relaxed">{children}</div>
    </div>
  );
}
