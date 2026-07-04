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
  Healthy: "bg-emerald-500",
  Watch: "bg-yellow-400",
  "Needs Action": "bg-orange-400",
  Critical: "bg-red-500",
};

const HEALTH_LABEL: Record<WorkspaceHealthStatus, string> = {
  Healthy: "Healthy",
  Watch: "Watch",
  "Needs Action": "Action needed",
  Critical: "Critical",
};

const TYPE_ICON: Record<Workspace["type"], React.ComponentType<{ className?: string }>> = {
  Agency: Building2,
  Brand: Globe,
  Client: Briefcase,
  Internal: Beaker,
};

export function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const grouped = {
    Agency: workspaces.filter(w => w.type === "Agency"),
    Brand: workspaces.filter(w => w.type === "Brand"),
    Client: workspaces.filter(w => w.type === "Client"),
    Internal: workspaces.filter(w => w.type === "Internal"),
  };

  function handleSelect(ws: Workspace) {
    setOpen(false);
    switchWorkspace(ws.id);
  }

  const activeHealth = currentWorkspace?.health_status ?? "Healthy";
  const Icon = currentWorkspace ? TYPE_ICON[currentWorkspace.type] : Building2;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-md",
            "hover:bg-white/5 transition-colors text-left group",
            "border border-transparent hover:border-border/40"
          )}
        >
          <div className="shrink-0 w-7 h-7 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground truncate leading-tight">
                {currentWorkspace ? currentWorkspace.name : "Select workspace"}
              </span>
              <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full", HEALTH_DOT[activeHealth])} />
            </div>
            {currentWorkspace && (
              <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                {currentWorkspace.type}
              </div>
            )}
          </div>
          <ChevronsUpDown className="shrink-0 w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-64 bg-card border-border/60 shadow-xl p-1"
      >
        {/* Master Command Center link */}
        <DropdownMenuItem
          className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
          onClick={() => { setOpen(false); navigate("/"); }}
        >
          <div className="w-6 h-6 rounded bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="w-3 h-3 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground">Master Command Center</div>
            <div className="text-[10px] text-muted-foreground">All workspaces</div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border/40" />

        {(["Agency", "Brand", "Client", "Internal"] as const).map((type) => {
          const group = grouped[type];
          if (group.length === 0) return null;
          const TypeIcon = TYPE_ICON[type];
          return (
            <div key={type}>
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {type}
              </DropdownMenuLabel>
              {group.map((ws) => {
                const isActive = currentWorkspace?.id === ws.id;
                const WsIcon = TYPE_ICON[ws.type];
                return (
                  <DropdownMenuItem
                    key={ws.id}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded",
                      isActive && "bg-primary/10"
                    )}
                    onClick={() => handleSelect(ws)}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded border flex items-center justify-center shrink-0",
                      isActive ? "bg-primary/20 border-primary/30" : "bg-white/5 border-border/40"
                    )}>
                      <WsIcon className={cn("w-3 h-3", isActive ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-xs font-medium truncate", isActive ? "text-primary" : "text-foreground")}>
                        {ws.name}
                      </div>
                      {ws.client_name && (
                        <div className="text-[10px] text-muted-foreground truncate">{ws.client_name}</div>
                      )}
                    </div>
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
