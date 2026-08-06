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

export function AccountSwitcher({ compact = false }: { compact?: boolean }) {
  const { manager, adAccounts, selectedAccountType, activeAdAccountId, selectManager, selectAdAccount } = useAccount();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const isManager = selectedAccountType === "manager";
  const active = adAccounts.find((a) => a.id === activeAdAccountId) ?? null;

  const triggerLabel = isManager ? manager.name : active?.name ?? manager.name;
  const triggerSub = isManager ? "Agency Overview" : "";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {compact ? (
          /* Collapsed sidebar: icon-only button — shows active account type */
          <button
            className={cn(
              "w-10 h-10 mx-auto rounded-lg flex items-center justify-center relative",
              "hover:bg-primary/10 transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            )}
            aria-label={`Switch account — currently: ${triggerLabel}`}
            title={triggerLabel}
          >
            <div className="w-6 h-6 rounded border border-primary/20 bg-primary/10 flex items-center justify-center">
              {isManager ? <Building2 className="w-3.5 h-3.5 text-interactive" /> : <Briefcase className="w-3.5 h-3.5 text-interactive" />}
            </div>
            {/* Status dot for ad accounts */}
            {!isManager && active && (
              <span
                className={cn(
                  "absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full ring-1 ring-background",
                  STATUS_DOT[active.status] ?? "bg-muted-foreground/60"
                )}
              />
            )}
          </button>
        ) : (
          <button
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md",
              "hover:bg-white/[0.05] transition-colors text-left",
              "border border-transparent hover:border-border/30",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            )}
            aria-label={`Current account: ${triggerLabel}`}
          >
            <div className="shrink-0 w-6 h-6 rounded border border-primary/20 bg-primary/10 flex items-center justify-center">
              {isManager ? <Building2 className="w-3.5 h-3.5 text-interactive" /> : <Briefcase className="w-3.5 h-3.5 text-interactive" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-body font-medium text-foreground truncate leading-tight">{triggerLabel}</span>
                {!isManager && active && (
                  <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full", STATUS_DOT[active.status] ?? "bg-muted-foreground/60")} />
                )}
              </div>
              {triggerSub && (
                <div className="text-label text-muted-foreground/70 leading-tight truncate">{triggerSub}</div>
              )}
            </div>
            <ChevronsUpDown className="shrink-0 w-3.5 h-3.5 text-muted-foreground/60" />
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={4} className="w-[212px] bg-surface-overlay border-border/50 elevation-floating p-1 z-50">
        {/* Manager */}
        <DropdownMenuItem
          className={cn("flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm h-9", isManager && "bg-primary/8")}
          onClick={() => { setOpen(false); selectManager(); }}
        >
          <div className={cn("w-5 h-5 rounded border flex items-center justify-center shrink-0", isManager ? "bg-primary/15 border-primary/25" : "bg-white/[0.04] border-border/30")}>
            <Building2 className={cn("w-3.5 h-3.5", isManager ? "text-interactive" : "text-muted-foreground/70")} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={cn("text-caption font-medium leading-tight", isManager ? "text-foreground" : "text-foreground/70")}>{manager.name}</div>
            <div className="text-[9px] text-muted-foreground/70 leading-tight">Agency Overview</div>
          </div>
          {isManager && <Check className="w-3.5 h-3.5 text-interactive shrink-0" />}
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
                <Briefcase className={cn("w-3.5 h-3.5", isActive ? "text-interactive" : "text-muted-foreground/70")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("text-caption font-medium leading-tight truncate", isActive ? "text-foreground" : "text-foreground/70")}>{a.name}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {a.status === "unconfigured" && (
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/60 border border-border/40 px-1 py-0.5 rounded leading-none">Setup</span>
                )}
                <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[a.status] ?? "bg-muted-foreground/60")} />
                {isActive && <Check className="w-3.5 h-3.5 text-interactive" />}
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
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span className="text-caption font-medium">Add Ad Account</span>
          <Plug className="w-3.5 h-3.5 ml-auto text-muted-foreground/60" />
        </DropdownMenuItem>
      </DropdownMenuContent>
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </DropdownMenu>
  );
}
