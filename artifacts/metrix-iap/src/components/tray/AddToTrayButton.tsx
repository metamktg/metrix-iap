// ─── Add to Tray button ───────────────────────────────────────────────
// Consistent affordance placed next to any actionable strategy/brief item
// across the platform. Clicking adds the item to the right Task Tray
// (open state); clicking again removes it. Once an item has been completed
// or archived from the tray, the button offers to re-add it.

import { ClipboardList, Check } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  addToTray,
  removeFromTray,
  getTrayItem,
  useTrayItems,
  type TrayItemInput,
} from "@/lib/data/trayStore";

export function AddToTrayButton({
  scopeId,
  item,
  className,
  compact = false,
}: {
  scopeId: string;
  item: TrayItemInput;
  className?: string;
  /** Icon-only variant for dense rows. */
  compact?: boolean;
}) {
  useTrayItems();
  const existing = getTrayItem(scopeId, item.id);
  const inTray = existing?.status === "open";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inTray) {
      removeFromTray(scopeId, item.id);
    } else {
      addToTray(scopeId, item);
    }
  };

  const label = inTray ? "In Tray" : "Add to Tray";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={inTray}
      aria-label={inTray ? `Remove "${item.title}" from tray` : `Add "${item.title}" to tray`}
      title={inTray ? "Remove from tray" : "Add to tray"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border text-caption font-semibold transition-colors shrink-0",
        compact ? "h-7 w-7 justify-center" : "h-7 px-2.5",
        inTray
          ? "bg-emerald-400/15 border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/25"
          : "bg-white/[0.04] border-border/50 text-foreground/70 hover:bg-primary/15 hover:border-primary/30 hover:text-interactive",
        className,
      )}
    >
      {inTray ? <Check className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
      {!compact && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}
