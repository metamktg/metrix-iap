import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ChevronRight, ChevronDown, Bell, CheckCircle2, PanelRightOpen, PanelRightClose,
  Settings, CreditCard, Users, LogOut, User, Zap,
  Database, BarChart3, Layers, FileText, FileBarChart,
} from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/brand/BrandMark";
import { DateRangePicker } from "./DateRangePicker";
import { useTaskTray } from "@/contexts/TaskTrayContext";
import { useTaskTrayCount } from "./TaskTray";
import { buildBreadcrumbs } from "./breadcrumbs";

// ─── Account menu dropdown ─────────────────────────────────────────────

function AccountMenu({
  initials,
  email,
  onClose,
}: {
  initials: string;
  email: string | undefined;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function go(path: string) {
    navigate(path);
    onClose();
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Account menu"
      className={cn(
        "absolute right-0 top-full mt-1.5 w-52 z-50",
        "bg-surface-sidebar border border-border/60 rounded-xl elevation-floating",
        "flex flex-col overflow-hidden"
      )}
    >
      {/* Identity */}
      <div className="px-3.5 py-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <span className="text-label font-bold text-primary leading-none">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-caption font-semibold text-foreground/90 truncate leading-tight">
              {email ?? "My account"}
            </p>
            <p className="text-[9px] text-muted-foreground/50 font-mono uppercase tracking-wide leading-tight mt-0.5">
              Workspace member
            </p>
          </div>
        </div>
      </div>

      {/* Settings links */}
      <div className="py-1.5">
        <MenuItem icon={User} label="Account" onClick={() => go("/app/settings/account")} />
        <MenuItem icon={Zap} label="Integrations" onClick={() => go("/app/settings/integrations")} />
        <MenuItem icon={Users} label="Team & Access" onClick={() => go("/app/settings/team")} />
        <MenuItem icon={CreditCard} label="Billing" onClick={() => go("/app/settings/billing")} />
        <MenuItem icon={Settings} label="Settings" onClick={() => go("/app/settings")} />
      </div>

      {/* Sign out */}
      <div className="border-t border-border/40 py-1.5">
        <MenuItem
          icon={LogOut}
          label="Sign out"
          onClick={() => { void logout(); onClose(); }}
          danger
          data-testid="button-signout"
        />
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  "data-testid": testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  "data-testid"?: string;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "w-full flex items-center gap-2.5 px-3.5 py-1.5 text-body font-medium transition-colors text-left",
        danger
          ? "text-red-400/80 hover:text-red-400 hover:bg-red-400/[0.06]"
          : "text-foreground/70 hover:text-foreground hover:bg-white/[0.04]"
      )}
    >
      <Icon className={cn("w-3.5 h-3.5 shrink-0", danger ? "text-red-400/70" : "text-muted-foreground/50")} />
      {label}
    </button>
  );
}

// ─── IAP Loop nav ──────────────────────────────────────────────────────

const LOOP_STAGES = [
  {
    stage: "data",
    icon: Database,
    label: "Data",
    routes: [
      { label: "Account Setup", path: "/app/settings/account" },
      { label: "Integrations",  path: "/app/settings/integrations" },
    ],
  },
  {
    stage: "analysis",
    icon: BarChart3,
    label: "Analysis",
    routes: [
      { label: "Overview",    path: "/app/analysis/overview" },
      { label: "Library",     path: "/app/analysis/library" },
      { label: "Audience",    path: "/app/analysis/audience" },
      { label: "Placements",  path: "/app/analysis/placements" },
      { label: "Budget",      path: "/app/analysis/budget" },
    ],
  },
  {
    stage: "strategy",
    icon: Layers,
    label: "Strategy",
    routes: [
      { label: "Overview",     path: "/app/strategy/overview" },
      { label: "Strategy Map", path: "/app/strategy/map" },
      { label: "Avatars",      path: "/app/strategy/avatars" },
      { label: "Hypotheses",   path: "/app/strategy/hypotheses" },
    ],
  },
  {
    stage: "briefs",
    icon: FileText,
    label: "Briefs",
    routes: [
      { label: "Builder", path: "/app/briefs/builder" },
      { label: "History", path: "/app/briefs/history" },
    ],
  },
  {
    stage: "report",
    icon: FileBarChart,
    label: "Report",
    routes: [
      { label: "New Report",      path: "/app/reports/new" },
      { label: "Report History",  path: "/app/reports/history" },
    ],
  },
] as const;

type LoopStage = typeof LOOP_STAGES[number]["stage"];

function LoopNav() {
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(path: string) { navigate(path); setOpen(false); }

  const activeStage: LoopStage | null =
    (LOOP_STAGES.find((s) =>
      s.routes.some((r) => location === r.path || location.startsWith(r.path + "/"))
    )?.stage ?? null) as LoopStage | null;

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Trigger */}
      <button
        aria-label="IAP Loop navigation"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-caption font-medium transition-all",
          open
            ? "bg-primary/15 border-primary/30 text-primary"
            : "border-border/40 text-muted-foreground/65 hover:text-foreground hover:border-border/60 hover:bg-white/[0.04]"
        )}
      >
        <Zap className="w-3 h-3 shrink-0" />
        <span>Loop</span>
        {activeStage && (
          <span className={cn(
            "text-[8px] font-mono uppercase tracking-wide px-1 py-px rounded leading-none border shrink-0",
            open
              ? "text-primary bg-primary/10 border-primary/25"
              : "text-primary/70 bg-primary/[0.07] border-primary/15"
          )}>
            {LOOP_STAGES.find((s) => s.stage === activeStage)?.label}
          </span>
        )}
        <ChevronDown className={cn(
          "w-3 h-3 shrink-0 transition-transform text-muted-foreground/40",
          open && "rotate-180"
        )} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          aria-label="IAP Loop navigation"
          className={cn(
            "absolute left-0 top-full mt-1.5 z-50 w-64",
            "bg-surface-sidebar border border-border/60 rounded-xl elevation-floating overflow-hidden"
          )}
        >
          {/* Header strip */}
          <div className="px-3.5 pt-3 pb-2.5 border-b border-border/30">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 leading-none">
              IAP Loop
            </p>
            <p className="text-caption text-muted-foreground/60 mt-1 leading-snug">
              Data → Analysis → Strategy → Briefs → Report
            </p>
          </div>

          {/* Stage list */}
          <div className="py-1.5">
            {LOOP_STAGES.map((s, si) => {
              const Icon = s.icon;
              const isActiveStage = activeStage === s.stage;

              return (
                <div key={s.stage}>
                  {/* Divider between stages (not before first) */}
                  {si > 0 && (
                    <div className="mx-3.5 my-1 border-t border-border/20" />
                  )}

                  {/* Stage label row */}
                  <div className={cn(
                    "flex items-center gap-2 px-3.5 py-1",
                    isActiveStage ? "text-primary" : "text-foreground/50"
                  )}>
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="text-[9px] font-mono uppercase tracking-widest font-semibold">
                      {s.label}
                    </span>
                    {isActiveStage && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>

                  {/* Sub-routes */}
                  {s.routes.map((r) => {
                    const isCurrent = location === r.path || location.startsWith(r.path + "/");
                    return (
                      <button
                        key={r.path}
                        role="menuitem"
                        onClick={() => go(r.path)}
                        className={cn(
                          "w-full flex items-center gap-2 pl-8 pr-3.5 py-1 text-body transition-colors text-left",
                          isCurrent
                            ? "text-primary/90 bg-primary/[0.08] font-medium"
                            : "text-muted-foreground/65 hover:text-foreground hover:bg-white/[0.04]"
                        )}
                      >
                        {isCurrent && (
                          <span className="w-1 h-1 rounded-full bg-primary shrink-0 -ml-3 mr-1" />
                        )}
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer — IAP overview shortcut */}
          <div className="border-t border-border/30 px-3.5 py-2">
            <button
              role="menuitem"
              onClick={() => go("/app/overview")}
              className="w-full flex items-center gap-2 text-caption text-muted-foreground/55 hover:text-foreground transition-colors text-left"
            >
              <span className="flex-1">Ad Account Overview</span>
              <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/30" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Topbar ────────────────────────────────────────────────────────────

export function Topbar() {
  const [location] = useLocation();
  const { manager, selectedAccountType, activeAdAccount } = useAccount();
  const { user } = useAuth();
  const { open, toggle } = useTaskTray();
  const trayCount = useTaskTrayCount();
  const [menuOpen, setMenuOpen] = useState(false);

  const isManager = selectedAccountType === "manager";
  const leadLabel = isManager ? manager.name : activeAdAccount?.name ?? manager.name;
  const crumbs = buildBreadcrumbs(location, leadLabel, isManager);

  const unconfigured = !isManager && activeAdAccount?.status === "unconfigured";
  const initials = leadLabel.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header className="h-[var(--topbar-h)] flex items-center gap-3 px-4 shrink-0 mx-topbar">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-0 flex-1 min-w-0">
        <BrandLogo className="w-4 h-4 shrink-0 mr-1" />
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center min-w-0">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mx-0.5" />
              {!isLast && crumb.to ? (
                <Link
                  href={crumb.to}
                  className="text-body truncate text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn("text-body truncate", isLast ? "text-foreground font-medium" : "text-muted-foreground/60")}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {/* IAP Loop nav — only shown when an ad account is active */}
      {!isManager && <LoopNav />}

      {/* Global date range */}
      <DateRangePicker />

      {/* Status */}
      {isManager ? (
        <div className="flex items-center gap-1 text-caption font-medium text-muted-foreground/60 shrink-0">
          <span className="hidden sm:inline">Agency</span>
        </div>
      ) : unconfigured ? (
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground border border-border/50 rounded px-2 py-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
          <span>Setup required</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-caption font-medium text-emerald-400 shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Connected</span>
        </div>
      )}

      <div className="w-px h-4 bg-border/50 shrink-0" />

      {/* Task tray toggle */}
      <button
        aria-label={open ? "Close task tray" : "Open task tray"}
        title={open ? "Close task tray" : `Pending workflow actions${trayCount > 0 ? ` (${trayCount} items)` : ""}`}
        onClick={toggle}
        className={cn(
          "relative w-7 h-7 rounded flex items-center justify-center transition-colors",
          open
            ? "bg-primary/15 border border-primary/25 text-primary hover:bg-primary/20"
            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        )}
      >
        {open ? (
          <PanelRightClose className="w-3.5 h-3.5" />
        ) : (
          <PanelRightOpen className="w-3.5 h-3.5" />
        )}
        {!open && trayCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center text-[8px] font-bold text-primary-foreground leading-none px-0.5">
            {trayCount > 9 ? "9+" : trayCount}
          </span>
        )}
      </button>

      <div className="w-px h-4 bg-border/50 shrink-0" />

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          aria-label="Notifications"
          className="relative w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <Bell className="w-3.5 h-3.5" />
        </button>

        {/* Avatar → account menu */}
        <div className="relative">
          <button
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              "w-7 h-7 rounded flex items-center justify-center transition-colors",
              menuOpen
                ? "bg-primary/25 border border-primary/40 text-primary"
                : "bg-primary/15 border border-primary/20 text-primary hover:bg-primary/20"
            )}
          >
            <span className="text-label font-bold leading-none">{initials}</span>
          </button>

          {menuOpen && (
            <AccountMenu
              initials={initials}
              email={user?.email}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </header>
  );
}
