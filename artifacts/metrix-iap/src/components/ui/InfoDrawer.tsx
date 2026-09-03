// ─── Info drawer ──────────────────────────────────────────────────────
// Generic right-side slide-over used for drill-downs across modules.
// When a `taskTray` node is passed, a narrow right column hosts it so
// the tray stays visible alongside the detail content.

import { useEffect, useRef } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { usePanelSize } from "@/lib/panel-prefs";
import { useIsCompactShell } from "@/lib/useMediaQuery";
import { cn } from "@workspace/command-deck/lib/utils";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { HEADING } from "@/pages/metrix/typography";

/** Drawer bounds: the previous 540/620px breakpoint widths become the default; 860px was the tray variant's cap. */
const INFO_DRAWER_BOUNDS = { min: 400, max: 760, default: 560 } as const;
const INFO_DRAWER_TRAY_BOUNDS = { min: 620, max: 960, default: 800 } as const;

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
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  // Width and expanded state persist per viewer (lib/panel-prefs); a drawer
  // hosting the task tray has its own, wider bounds.
  const bounds = taskTray ? INFO_DRAWER_TRAY_BOUNDS : INFO_DRAWER_BOUNDS;
  const size = usePanelSize(taskTray ? "info-drawer:tray" : "info-drawer", bounds);
  const compact = useIsCompactShell();

  // Native focus trapping: Tab/Shift+Tab cycle within the panel;
  // focus is returned to the triggering element on close.
  useFocusTrap(panelRef, true);

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
      <div className="fixed inset-0 bg-background/50 backdrop-blur-[2px] z-40" onClick={onClose} aria-hidden="true" />

      {/* Slide-over panel — widens automatically when a task tray is present */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : kicker}
        style={compact ? undefined : { width: size.width }}
        className={cn(
          "fixed right-0 top-0 h-full bg-surface-deep border-l border-border/50 z-50 flex flex-col overflow-hidden elevation-floating w-full max-w-full",
          !reducedMotion && "transition-[width]",
        )}>
        {!compact && (
          <ResizeHandle
            label="Drawer width"
            width={size.width}
            bounds={bounds}
            edge="left"
            onWidth={size.setWidth}
            onToggle={size.toggleExpanded}
            testId="info-drawer-resize"
          />
        )}

        {/* ── Full-width header ── */}
        <div className="flex items-start gap-3 px-6 py-5 border-b border-border/40 shrink-0 bg-foreground/[0.01]">
          <div className="flex-1 min-w-0">
            <div className="text-label text-muted-foreground/75 uppercase tracking-widest mb-1.5 leading-none">{kicker}</div>
            <h2 className={HEADING.h2}>{title}</h2>
          </div>
          {!compact && (
            <button
              type="button"
              onClick={size.toggleExpanded}
              aria-pressed={size.expanded}
              aria-label={size.expanded ? "Restore drawer width" : "Expand drawer"}
              title={size.expanded ? "Restore width" : "Expand"}
              data-testid="info-drawer-expand"
              className="pressable mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] border border-transparent hover:border-border/30 transition-[color,background-color,border-color,box-shadow,opacity,transform] shrink-0"
            >
              {size.expanded ? <Minimize2 className="w-4 h-4" aria-hidden /> : <Maximize2 className="w-4 h-4" aria-hidden />}
            </button>
          )}
          <button
            onClick={onClose}
            className="pressable mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] border border-transparent hover:border-border/30 transition-[color,background-color,border-color,box-shadow,opacity,transform] shrink-0"
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
              <div className="px-6 py-4 border-t border-border/40 bg-foreground/[0.01] shrink-0">
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
      <label className="text-label uppercase tracking-widest text-muted-foreground/75">{label}</label>
      <div className="text-title text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}
