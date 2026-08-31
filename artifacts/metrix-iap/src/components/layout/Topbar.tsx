import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "next-themes";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  ChevronRight, Bell, CheckCircle2, PanelRightOpen, PanelRightClose,
  Settings, CreditCard, Users, LogOut, User, Moon, Sun,
} from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTaskTray } from "@/contexts/TaskTrayContext";
import { useTaskTrayCount } from "./TaskTray";
import { buildBreadcrumbs } from "./breadcrumbs";

// ─── Account menu dropdown ─────────────────────────────────────────────

export function AccountMenu({
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
  const { theme, setTheme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const isLight =
    theme === "light" ||
    (theme === undefined && document.documentElement.classList.contains("light"));

  function toggleTheme() {
    // The applied document class is the visual source of truth. Reading it at
    // activation also handles the brief hydration window where next-themes has
    // restored a saved light class but its React state is not available yet.
    const lightIsApplied = document.documentElement.classList.contains("light");
    setTheme(lightIsApplied ? "dark" : "light");
  }

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
        "absolute right-0 top-full mt-1.5 w-56 z-50",
        "bg-surface-sidebar border border-border/60 rounded-xl elevation-floating",
        "flex flex-col overflow-hidden"
      )}
    >
      {/* Identity */}
      <div className="px-3.5 py-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <span className="text-label font-bold text-interactive leading-none">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-caption font-semibold text-foreground/90 truncate leading-tight">
              {email ?? "My account"}
            </p>
            <p className="text-micro text-muted-foreground/75 uppercase leading-tight mt-0.5">
              Workspace member
            </p>
          </div>
        </div>
      </div>

      {/* Settings links */}
      <div className="py-1.5">
        <MenuItem icon={User} label="Account" onClick={() => go("/app/settings/account")} />
        <MenuItem icon={Settings} label="Integrations" onClick={() => go("/app/settings/integrations")} />
        <MenuItem icon={Users} label="Team & Access" onClick={() => go("/app/settings/team")} />
        <MenuItem icon={CreditCard} label="Billing" onClick={() => go("/app/settings/billing")} />
        <MenuItem icon={Settings} label="Settings" onClick={() => go("/app/settings")} />
      </div>

      {/* Explicit theme preference — text and current state stay visible. */}
      <div className="border-t border-border/60 py-1.5">
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={isLight}
          aria-label={`Theme: ${isLight ? "Light" : "Dark"}. Switch to ${isLight ? "Dark" : "Light"} theme`}
          data-testid="button-theme-toggle"
          onClick={toggleTheme}
          className="pressable-lg w-full min-h-11 flex items-center gap-2.5 px-3.5 py-2 text-left text-foreground/85 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
        >
          {isLight ? (
            <Sun className="w-4 h-4 shrink-0 text-interactive" />
          ) : (
            <Moon className="w-4 h-4 shrink-0 text-interactive" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold leading-tight">Theme</span>
            <span className="block text-caption text-muted-foreground mt-0.5">
              {isLight ? "Light" : "Dark"}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors",
              isLight
                ? "bg-primary border-primary"
                : "bg-input border-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background border border-border/60 elevation-raised transition-transform",
                isLight ? "translate-x-[17px]" : "translate-x-0.5"
              )}
            />
          </span>
        </button>
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
        "pressable-lg w-full flex items-center gap-2.5 px-3.5 py-1.5 text-body font-medium transition-colors text-left",
        danger
          ? "text-status-danger/80 hover:text-status-danger hover:bg-status-danger/[0.06]"
          : "text-foreground/70 hover:text-foreground hover:bg-foreground/[0.04]"
      )}
    >
      <Icon className={cn("w-3.5 h-3.5 shrink-0", danger ? "text-status-danger/70" : "text-muted-foreground/75")} />
      {label}
    </button>
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
  const crumbs = buildBreadcrumbs(location, isManager);

  const unconfigured = !isManager && activeAdAccount?.status === "unconfigured";
  const initials = leadLabel.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  // The landing route's single breadcrumb ("Agency Overview"/"Account
  // Overview") duplicates that page's own header verbatim with no
  // navigational value (it isn't even a link) — suppress it there only.
  // Every other route keeps its breadcrumb trail.
  const isLandingRoute = location === "/" || location === "";

  return (
    <header className="h-[var(--topbar-h)] flex items-center gap-2 px-3 shrink-0 mx-topbar">
      {/* Breadcrumb */}
      {!isLandingRoute && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-0 flex-1 min-w-0">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={i} className="flex items-center min-w-0">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0 mx-0.5" />}
                {!isLast && crumb.to ? (
                  <Link
                    href={crumb.to}
                    className="text-body truncate text-muted-foreground/75 hover:text-foreground focus-visible:text-foreground rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn("text-body truncate", isLast ? "text-foreground font-medium" : "text-muted-foreground/75")}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      )}
      {isLandingRoute && <div className="flex-1 min-w-0" />}

      {/* Status */}
      {isManager ? (
        <div className="flex items-center gap-1 text-caption font-medium text-muted-foreground/75 shrink-0">
          <span className="hidden sm:inline">Agency</span>
        </div>
      ) : unconfigured ? (
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground border border-border/50 rounded px-2 py-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
          <span>Setup required</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-caption font-medium text-status-success shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Connected</span>
        </div>
      )}

      <div className="w-px h-4 bg-border/50 shrink-0" />

      {/* Task tray toggle — Nocturne labeled pill; the count moves into the
          label instead of a floating badge. */}
      <button
        aria-label={open ? "Close task tray" : "Open task tray"}
        title={open ? "Close task tray" : `Pending workflow actions${trayCount > 0 ? ` (${trayCount} items)` : ""}`}
        onClick={toggle}
        className={cn(
          "pressable relative h-7 px-2.5 rounded-md border flex items-center gap-1.5 transition-colors text-caption font-medium",
          open
            ? "bg-primary/15 border-primary/25 text-interactive hover:bg-primary/20"
            : trayCount > 0
            ? "border-primary/40 text-interactive hover:bg-primary/10"
            : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
        )}
      >
        {open ? (
          <PanelRightClose className="w-3.5 h-3.5" />
        ) : (
          <PanelRightOpen className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Tray</span>
        {trayCount > 0 && (
          <span className="tabular-nums font-semibold">{trayCount > 9 ? "9+" : trayCount}</span>
        )}
      </button>

      <div className="w-px h-4 bg-border/50 shrink-0" />

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          aria-label="Notifications"
          className="relative w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
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
              "pressable w-7 h-7 rounded flex items-center justify-center transition-colors",
              menuOpen
                ? "bg-primary/25 border border-primary/40 text-interactive"
                : "bg-primary/15 border border-primary/20 text-interactive hover:bg-primary/20"
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
