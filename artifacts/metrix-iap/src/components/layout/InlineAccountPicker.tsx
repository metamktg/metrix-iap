// ─── Inline ad account picker ─────────────────────────────────────────
// Compact dropdown rendered inside account-scoped empty states so users
// can pick an ad account in place — no trip back to the global switcher.
// Uses setActiveAdAccountId (no navigation), so the current page simply
// populates once an account is chosen. Selection flows through the same
// AccountContext persistence (sessionStorage + ?account= URL param), so
// the global AccountSwitcher stays in sync automatically.

import { useState } from "react";
import { ChevronsUpDown, Check, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/contexts/AccountContext";

const STATUS_DOT: Record<string, string> = {
  configured: "bg-emerald-500",
  unconfigured: "bg-muted-foreground/60",
};

export function InlineAccountPicker({
  label = "Choose ad account",
  excludeAccountId,
}: {
  label?: string;
  /** Hide this account from the list (e.g. the currently selected, unconfigured one). */
  excludeAccountId?: string;
}) {
  const { adAccounts, activeAdAccountId, selectedAccountType, setActiveAdAccountId } = useAccount();
  const [open, setOpen] = useState(false);

  const options = adAccounts.filter((a) => a.id !== excludeAccountId);
  if (options.length === 0) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-md",
            "border border-border/50 bg-white/[0.03] hover:bg-white/[0.06] transition-colors",
            "text-[12px] font-medium text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          )}
        >
          <Briefcase className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{label}</span>
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground/70 shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="center" sideOffset={4} className="w-[232px] bg-[hsl(222_61%_7%)] border-border/50 shadow-2xl p-1 z-50">
        <DropdownMenuLabel className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Ad Accounts
        </DropdownMenuLabel>
        {options.map((a) => {
          const isActive = selectedAccountType === "ad_account" && activeAdAccountId === a.id;
          return (
            <DropdownMenuItem
              key={a.id}
              className={cn("flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm h-9", isActive && "bg-primary/8")}
              onClick={() => { setOpen(false); setActiveAdAccountId(a.id); }}
            >
              <div className={cn("w-5 h-5 rounded border flex items-center justify-center shrink-0", isActive ? "bg-primary/15 border-primary/25" : "bg-white/[0.04] border-border/30")}>
                <Briefcase className={cn("w-2.5 h-2.5", isActive ? "text-primary" : "text-muted-foreground/70")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("text-[11px] font-medium leading-tight truncate", isActive ? "text-foreground" : "text-foreground/80")}>{a.name}</div>
                <div className="text-[9px] text-muted-foreground/70 leading-tight capitalize">{a.status}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {a.status === "unconfigured" && (
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/70 border border-border/40 px-1 py-0.5 rounded leading-none">Setup</span>
                )}
                <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[a.status] ?? "bg-muted-foreground/60")} />
                {isActive && <Check className="w-3 h-3 text-primary" />}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
