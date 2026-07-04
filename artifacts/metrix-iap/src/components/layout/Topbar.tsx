import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ChevronRight, Search, Bell, User, ExternalLink,
  AlertCircle, CheckCircle2,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { workspaceNeedsOnboarding } from "@/lib/workspace-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Breadcrumb builder ────────────────────────────────────────────────

function buildBreadcrumbs(location: string, workspaceName?: string): { label: string; href?: string }[] {
  if (location === "/" || location === "/app") {
    return [{ label: "Master Command Center" }];
  }

  const crumbs: { label: string; href?: string }[] = [];

  if (workspaceName) {
    crumbs.push({ label: workspaceName, href: location.includes("/app/workspaces/") ? location.split("/").slice(0, 4).join("/") : undefined });
  }

  if (location.includes("/imports")) crumbs.push({ label: "Import Center" });
  else if (location.includes("/ad-accounts") && !location.includes("/ad-accounts/")) crumbs.push({ label: "Ad Accounts" });
  else if (location.includes("/ad-accounts/")) crumbs.push({ label: "Ad Accounts" }, { label: "Account Intelligence" });
  else if (location.includes("/iap/new")) crumbs.push({ label: "IAP Run Builder" });
  else if (location.includes("/iap/runs/")) crumbs.push({ label: "IAP Runs" }, { label: "Analysis Run" });
  else if (location.includes("/creative-library")) crumbs.push({ label: "Creative Library" });
  else if (location.includes("/briefs/")) crumbs.push({ label: "Briefs" }, { label: "Brief Detail" });
  else if (location.includes("/briefs")) crumbs.push({ label: "Brief Engine" });
  else if (location.includes("/reports")) crumbs.push({ label: "Reports" });
  else if (location.includes("/settings")) crumbs.push({ label: "Settings" });
  else if (location.includes("/benchmarks")) crumbs.push({ label: "Benchmark Memory" });
  else if (location.includes("/change-watch")) crumbs.push({ label: "Change Watch" });

  return crumbs;
}

// ─── Health status badge ───────────────────────────────────────────────

const HEALTH_CONFIG = {
  Healthy: { icon: CheckCircle2, class: "text-[hsl(var(--metrix-success))]", label: "Healthy" },
  Watch: { icon: AlertCircle, class: "text-yellow-400", label: "Watch" },
  "Needs Action": { icon: AlertCircle, class: "text-orange-400", label: "Needs Action" },
  Critical: { icon: AlertCircle, class: "text-destructive", label: "Critical" },
};

// ─── Topbar ────────────────────────────────────────────────────────────

export function Topbar() {
  const [location] = useLocation();
  const { currentWorkspace, currentUser } = useWorkspace();
  const crumbs = buildBreadcrumbs(location, currentWorkspace?.name);
  const needsOnboarding = currentWorkspace ? workspaceNeedsOnboarding(currentWorkspace.id) : false;

  return (
    <header className="h-12 flex items-center gap-3 px-4 border-b border-border/60 bg-background/95 backdrop-blur-sm shrink-0">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-xs text-muted-foreground/60 font-mono">MMA</span>
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            {crumb.href ? (
              <a
                href={crumb.href}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, "", crumb.href);
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
              >
                {crumb.label}
              </a>
            ) : (
              <span className="text-xs font-medium text-foreground truncate">{crumb.label}</span>
            )}
          </span>
        ))}
      </div>

      {/* Workspace health indicator */}
      {currentWorkspace && !needsOnboarding && (() => {
        const hc = HEALTH_CONFIG[currentWorkspace.health_status];
        const HIcon = hc.icon;
        return (
          <div className={cn("flex items-center gap-1 text-xs font-medium", hc.class)}>
            <HIcon className="w-3.5 h-3.5" />
            <span>{hc.label}</span>
          </div>
        );
      })()}

      {/* Onboarding indicator */}
      {currentWorkspace && needsOnboarding && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border/60 rounded px-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
          <span>Setup required</span>
        </div>
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-border/60" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors relative">
          <Bell className="w-3.5 h-3.5" />
          {currentWorkspace?.id === "ws_bookster" && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-destructive" />
          )}
        </button>

        {/* User avatar */}
        <button className="w-7 h-7 rounded flex items-center justify-center bg-primary/15 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
          <span className="text-[10px] font-bold leading-none">AC</span>
        </button>
      </div>
    </header>
  );
}
