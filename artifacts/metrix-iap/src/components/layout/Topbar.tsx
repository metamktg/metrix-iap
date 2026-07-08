import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ChevronRight, Bell, CheckCircle2, LogOut } from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { navTree } from "@/navigation/navTree";

// ─── Derive breadcrumb from navTree ────────────────────────────────────

type BreadcrumbEntry = { label: string; to?: string };

// Exported for tests (src/navigation/__tests__/breadcrumbs.test.ts).
export function buildBreadcrumbs(location: string, leadLabel: string, isManager: boolean): BreadcrumbEntry[] {
  const crumbs: BreadcrumbEntry[] = [{ label: leadLabel, to: "/" }];

  if (location === "/" || location === "") {
    crumbs.push({ label: isManager ? "Agency Overview" : "Account Overview" });
    return crumbs;
  }

  for (const section of navTree) {
    const matchesExtra = (section.matchPaths ?? []).some(
      (p) => location === p || location.startsWith(p + "/")
    );
    if (matchesExtra) {
      crumbs.push({ label: isManager ? "Agency Overview" : "Account Overview" });
      return crumbs;
    }
    if (!section.children?.length && section.to) {
      if (location === section.to || location.startsWith(section.to + "/")) {
        crumbs.push({ label: section.label, to: section.to });
        return crumbs;
      }
    }
    for (const child of section.children ?? []) {
      if (location === child.to || location.startsWith(child.to + "/")) {
        crumbs.push({ label: section.label, to: section.children![0]!.to });
        crumbs.push({ label: child.label, to: child.to });
        return crumbs;
      }
    }
  }

  return crumbs;
}

// ─── Topbar ────────────────────────────────────────────────────────────

export function Topbar() {
  const [location] = useLocation();
  const { manager, selectedAccountType, activeAdAccount } = useAccount();
  const { user, logout } = useAuth();

  const isManager = selectedAccountType === "manager";
  const leadLabel = isManager ? manager.name : activeAdAccount?.name ?? manager.name;
  const crumbs = buildBreadcrumbs(location, leadLabel, isManager);

  const unconfigured = !isManager && activeAdAccount?.status === "unconfigured";
  const initials = leadLabel.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header className="h-11 flex items-center gap-3 px-4 shrink-0 mx-topbar">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-0 flex-1 min-w-0">
        <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0 pr-1">MX</span>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center min-w-0">
              <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0 mx-0.5" />
              {!isLast && crumb.to ? (
                <Link
                  href={crumb.to}
                  className="text-[12px] truncate text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn("text-[12px] truncate", isLast ? "text-foreground font-medium" : "text-muted-foreground/60")}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {/* Status */}
      {isManager ? (
        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60 shrink-0">
          <span className="hidden sm:inline">Agency</span>
        </div>
      ) : unconfigured ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border/50 rounded px-2 py-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
          <span>Setup required</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 shrink-0">
          <CheckCircle2 className="w-3 h-3" />
          <span className="hidden sm:inline">Connected</span>
        </div>
      )}

      <div className="w-px h-4 bg-border/50 shrink-0" />

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          aria-label="Notifications"
          className="relative w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <Bell className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label={`Account: ${leadLabel}`}
          className="w-7 h-7 rounded flex items-center justify-center bg-primary/15 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
        >
          <span className="text-[10px] font-bold leading-none">{initials}</span>
        </button>
        <button
          aria-label={user ? `Sign out (${user.email})` : "Sign out"}
          title={user ? `Sign out (${user.email})` : "Sign out"}
          onClick={() => void logout()}
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          data-testid="button-signout"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
