import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronsUpDown, Check, Building2, Briefcase, Beaker, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { Workspace, WorkspaceHealthStatus } from "@/lib/types";

const HEALTH_DOT: Record<WorkspaceHealthStatus, string> = {
  Healthy:       "bg-emerald-500",
  Watch:         "bg-amber-400",
  "Needs Action":"bg-orange-400",
  Critical:      "bg-red-500",
};

const TYPE_ICON: Record<Workspace["type"], React.ComponentType<{ className?: string }>> = {
  Agency:   Building2,
  Brand:    Globe,
  Client:   Briefcase,
  Internal: Beaker,
};

export function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const grouped = {
    Agency:   workspaces.filter(w => w.type === "Agency"),
    Brand:    workspaces.filter(w => w.type === "Brand"),
    Client:   workspaces.filter(w => w.type === "Client"),
    Internal: workspaces.filter(w => w.type === "Internal"),
  };

  function handleSelect(ws: Workspace) {
    setOpen(false);
    switchWorkspace(ws.id);
  }

  const Icon = TYPE_ICON[currentWorkspace.type] ?? Building2;
  const health = currentWorkspace.health_status;

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
          aria-label={`Current workspace: ${currentWorkspace.name}`}
        >
          {/* Workspace icon */}
          <div className="shrink-0 w-6 h-6 rounded border border-primary/20 bg-primary/10 flex items-center justify-center">
            <Icon className="w-3 h-3 text-primary" />
          </div>

          {/* Name + type */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-medium text-foreground truncate leading-tight">
                {currentWorkspace.name}
              </span>
              <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full", HEALTH_DOT[health])} />
            </div>
            <div className="text-[10px] text-muted-foreground/50 leading-tight">
              {currentWorkspace.type}
            </div>
          </div>

          <ChevronsUpDown className="shrink-0 w-3 h-3 text-muted-foreground/40" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-[200px] bg-[hsl(222_61%_7%)] border-border/50 shadow-2xl p-1 z-50"
      >
        {/* Master Command Center */}
        <DropdownMenuItem
          className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm h-9"
          onClick={() => { setOpen(false); navigate("/"); }}
        >
          <div className="w-5 h-5 rounded border border-border/40 bg-white/5 flex items-center justify-center shrink-0">
            <Building2 className="w-2.5 h-2.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-foreground leading-tight">
              Master Command Center
            </div>
            <div className="text-[9px] text-muted-foreground/50 leading-tight">All workspaces</div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border/30" />

        {(["Agency", "Brand", "Client", "Internal"] as const).map((type) => {
          const group = grouped[type];
          if (!group.length) return null;
          const TypeIcon = TYPE_ICON[type];
          return (
            <div key={type}>
              <DropdownMenuLabel className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                {type}
              </DropdownMenuLabel>
              {group.map((ws) => {
                const isActive = currentWorkspace.id === ws.id;
                const WsIcon = TYPE_ICON[ws.type];
                return (
                  <DropdownMenuItem
                    key={ws.id}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm h-9",
                      isActive && "bg-primary/8"
                    )}
                    onClick={() => handleSelect(ws)}
                  >
                    {/* Icon */}
                    <div className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center shrink-0",
                      isActive
                        ? "bg-primary/15 border-primary/25"
                        : "bg-white/[0.04] border-border/30"
                    )}>
                      <WsIcon className={cn(
                        "w-2.5 h-2.5",
                        isActive ? "text-primary" : "text-muted-foreground/50"
                      )} />
                    </div>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-[11px] font-medium leading-tight truncate",
                        isActive ? "text-foreground" : "text-foreground/70"
                      )}>
                        {ws.name}
                      </div>
                      {ws.client_name && (
                        <div className="text-[9px] text-muted-foreground/40 leading-tight truncate">
                          {ws.client_name}
                        </div>
                      )}
                    </div>

                    {/* Status + check */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full", HEALTH_DOT[ws.health_status])} />
                      {isActive && <Check className="w-3 h-3 text-primary" />}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
