import { useState } from "react";
import { ChevronsUpDown, Check, Building2, Briefcase, Plus, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/contexts/AccountContext";
import { AddAccountDialog } from "@/pages/metrix/AddAccountDialog";

const STATUS_DOT: Record<string, string> = {
  configured: "bg-emerald-500",
  unconfigured: "bg-muted-foreground/60",
};

export function AccountSwitcher() {
  const { manager, adAccounts, selectedAccountType, activeAdAccountId, selectManager, selectAdAccount } = useAccount();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const isManager = selectedAccountType === "manager";
  const active = adAccounts.find((a) => a.id === activeAdAccountId) ?? null;

  const triggerLabel = isManager ? manager.name : active?.name ?? manager.name;
  const triggerSub = isManager ? "Manager · Agency Overview" : active?.platform ?? "";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md",
            "hover:bg-white/[0.05] transition-colors text-left",
            "border border-transparent hover:border-border/30",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          )}
          aria-label={`Current account: ${triggerLabel}`}
        >
          <div className="shrink-0 w-6 h-6 rounded border border-primary/20 bg-primary/10 flex items-center justify-center">
            {isManager ? <Building2 className="w-3 h-3 text-primary" /> : <Briefcase className="w-3 h-3 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-medium text-foreground truncate leading-tight">{triggerLabel}</span>
              {!isManager && active && (
                <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full", STATUS_DOT[active.status] ?? "bg-muted-foreground/60")} />
              )}
            </div>
            <div className="text-[10px] text-muted-foreground/70 leading-tight truncate">{triggerSub}</div>
          </div>
          <ChevronsUpDown className="shrink-0 w-3 h-3 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={4} className="w-[212px] bg-[hsl(222_61%_7%)] border-border/50 shadow-2xl p-1 z-50">
        {/* Manager */}
        <DropdownMenuItem
          className={cn("flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm h-9", isManager && "bg-primary/8")}
          onClick={() => { setOpen(false); selectManager(); }}
        >
          <div className={cn("w-5 h-5 rounded border flex items-center justify-center shrink-0", isManager ? "bg-primary/15 border-primary/25" : "bg-white/[0.04] border-border/30")}>
            <Building2 className={cn("w-2.5 h-2.5", isManager ? "text-primary" : "text-muted-foreground/70")} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={cn("text-[11px] font-medium leading-tight", isManager ? "text-foreground" : "text-foreground/70")}>{manager.name}</div>
            <div className="text-[9px] text-muted-foreground/70 leading-tight">Agency Overview</div>
          </div>
          {isManager && <Check className="w-3 h-3 text-primary shrink-0" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border/30" />
        <DropdownMenuLabel className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Ad Accounts
        </DropdownMenuLabel>

        {adAccounts.map((a) => {
          const isActive = !isManager && activeAdAccountId === a.id;
          return (
            <DropdownMenuItem
              key={a.id}
              className={cn("flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm h-9", isActive && "bg-primary/8")}
              onClick={() => { setOpen(false); selectAdAccount(a.id); }}
            >
              <div className={cn("w-5 h-5 rounded border flex items-center justify-center shrink-0", isActive ? "bg-primary/15 border-primary/25" : "bg-white/[0.04] border-border/30")}>
                <Briefcase className={cn("w-2.5 h-2.5", isActive ? "text-primary" : "text-muted-foreground/70")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("text-[11px] font-medium leading-tight truncate", isActive ? "text-foreground" : "text-foreground/70")}>{a.name}</div>
                <div className="text-[9px] text-muted-foreground/60 leading-tight capitalize">{a.status}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {a.status === "unconfigured" && (
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/60 border border-border/40 px-1 py-0.5 rounded leading-none">Setup</span>
                )}
                <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[a.status] ?? "bg-muted-foreground/60")} />
                {isActive && <Check className="w-3 h-3 text-primary" />}
              </div>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator className="my-1 bg-border/30" />
        <DropdownMenuItem
          className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm h-8 text-muted-foreground/60"
          onSelect={(e) => {
            // Defer opening the dialog until the dropdown has fully closed —
            // avoids the Radix dropdown→dialog focus/pointer-events trap.
            e.preventDefault();
            setOpen(false);
            setTimeout(() => setAddOpen(true), 0);
          }}
        >
          <div className="w-5 h-5 rounded border border-dashed border-border/40 flex items-center justify-center shrink-0">
            <Plus className="w-2.5 h-2.5" />
          </div>
          <span className="text-[11px] font-medium">Add Ad Account</span>
          <Plug className="w-2.5 h-2.5 ml-auto text-muted-foreground/60" />
        </DropdownMenuItem>
      </DropdownMenuContent>
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </DropdownMenu>
  );
}
