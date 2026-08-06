import { useLocation } from "wouter";
import { useState, useRef, useCallback, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Radio,
  BarChart2,
  Compass,
  FileText,
  FileBarChart,
  Layers,
  Download,
  Zap,
  Settings2,
} from "lucide-react";
import { AccountSwitcher } from "./AccountSwitcher";
import { DataSourceBadgeToggle } from "@/components/ui/DataSourceBadge";
import { navTree, sectionLandingRoute } from "@/navigation/navTree";
import { useNavBadges } from "@/navigation/useNavBadges";
import { useAuth } from "@/contexts/AuthContext";
import type { NavSection, NavChild, NavIconName } from "@/navigation/navTree";

// ─── Icon map ──────────────────────────────────────────────────────────

const ICONS: Record<NavIconName, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Radio,
  BarChart2,
  Compass,
  FileText,
  FileBarChart,
  Layers,
  Download,
  Zap,
  Settings2,
};

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}

// ─── Collapse state persistence ────────────────────────────────────────

const STORAGE_KEY = "metrix_sidebar_collapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // default: expanded
  }
}

function saveCollapsed(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

// ─── Badge pill ────────────────────────────────────────────────────────

const BADGE_STYLE: Record<string, string> = {
  alerts:      "bg-destructive/15 text-destructive border-destructive/20",
  signals:     "text-amber-400 bg-amber-400/10 border-amber-400/20",
  suggestions: "bg-primary/15 text-interactive border-primary/20",
  briefs:      "bg-primary/15 text-interactive border-primary/20",
  mst:         "bg-muted text-muted-foreground border-border/40",
  agent:       "bg-muted text-muted-foreground border-border/40",
};

function NavBadge({ count, badgeKey }: { count: number | null; badgeKey: string }) {
  if (count == null || count <= 0) return null;
  return (
    <span className={cn(
      "ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none tabular-nums shrink-0",
      BADGE_STYLE[badgeKey] ?? "bg-muted text-muted-foreground border-border/40"
    )}>
      {count}
    </span>
  );
}

// ─── Active checks ─────────────────────────────────────────────────────

function isChildActive(to: string, location: string): boolean {
  return location === to || location.startsWith(to + "/");
}

function matchesExtraPaths(section: NavSection, location: string): boolean {
  return (section.matchPaths ?? []).some(
    (p) => location === p || location.startsWith(p + "/")
  );
}

function isSectionActive(section: NavSection, location: string): boolean {
  if (matchesExtraPaths(section, location)) return true;
  if (section.to) return location === section.to || location.startsWith(section.to + "/");
  const landing = sectionLandingRoute(section);
  if (landing && isChildActive(landing, location)) return true;
  return (section.children ?? []).some(c => isChildActive(c.to, location));
}

// ─── wouter navigation helper ─────────────────────────────────────────

function navigate(href: string, e: React.MouseEvent) {
  e.preventDefault();
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// ─── Tooltip (collapsed-mode hover label for leaf sections) ────────────

function CollapseTooltip({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className={cn(
      "absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[100]",
      "pointer-events-none select-none",
      "bg-[hsl(222_61%_10%)] border border-border/50 rounded-md shadow-xl",
      "px-2.5 py-1.5 whitespace-nowrap",
    )}>
      <div className="text-[12px] font-semibold text-foreground leading-tight">{label}</div>
      {sub && <div className="text-[9px] text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Child row (used in both expanded sidebar and hover flyout) ─────────

function ChildRow({
  child,
  count,
  onNavigate,
}: {
  child: NavChild;
  count: number | null;
  onNavigate?: () => void;
}) {
  const [location] = useLocation();
  const active = isChildActive(child.to, location);

  return (
    <li className="relative">
      {active && (
        <span className="absolute left-0 top-[5px] bottom-[5px] w-0.5 bg-primary rounded-full" />
      )}
      <a
        href={child.to}
        onClick={(e) => {
          navigate(child.to, e);
          onNavigate?.();
        }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-1.5 pl-3 pr-2 h-8 rounded-r text-[12px] transition-all",
          active
            ? "font-semibold text-foreground bg-primary/8"
            : "text-foreground/65 hover:text-foreground hover:bg-[rgba(20,55,110,0.45)]"
        )}
      >
        <span className="flex-1 truncate leading-tight">{child.label}</span>
        {child.placeholder && !active && (
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/70 border border-border/40 px-1 py-0.5 rounded leading-none shrink-0">
            Soon
          </span>
        )}
        {!child.placeholder && child.dataSource && (
          <Database className="w-2 h-2 shrink-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        {child.badgeKey && !child.placeholder && (
          <NavBadge count={count} badgeKey={child.badgeKey} />
        )}
      </a>
    </li>
  );
}

// ─── Hover flyout (collapsed mode) ────────────────────────────────────
// Rendered via createPortal to document.body so it escapes the sidebar's
// overflow-hidden / overflow-y-auto ancestors and paints outside the rail.

function HoverFlyout({
  section,
  badgeCounts,
  top,
  left,
  onMouseEnter,
  onMouseLeave,
  onClose,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  top: number;
  left: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
}) {
  const children = section.children ?? [];

  const panel = (
    <div
      style={{ position: "fixed", top, left, zIndex: 9999 }}
      className={cn(
        "w-48 rounded-lg shadow-xl",
        "bg-[hsl(222_61%_10%)] border border-border/50",
        "py-1",
      )}
      role="dialog"
      aria-label={`${section.label} pages`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Section title */}
      <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 border-b border-border/30 mb-0.5">
        {section.label}
        {section.number && (
          <span className="ml-1.5 font-mono opacity-50">{section.number}</span>
        )}
      </div>
      <ul
        className="list-none p-0 m-0 px-1 space-y-0.5 pt-0.5"
        aria-label={`${section.label} pages`}
      >
        {children.map(child => (
          <ChildRow
            key={child.id}
            child={child}
            count={child.badgeKey ? badgeCounts[child.badgeKey] ?? null : null}
            onNavigate={onClose}
          />
        ))}
      </ul>
    </div>
  );

  return createPortal(panel, document.body);
}

// ─── Collapsed icon item with hover flyout ─────────────────────────────

const COLLAPSED_DIVIDER_AFTER = new Set(["overview", "analysis", "mst", "exports"]);

function CollapsedItem({
  section,
  badgeCounts,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
}) {
  const [location] = useLocation();
  const [hovered, setHovered] = useState(false);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liRef = useRef<HTMLLIElement>(null);
  const active = isSectionActive(section, location);
  const landing = sectionLandingRoute(section) ?? section.to ?? "#";
  const badgeCount = section.badgeKey ? badgeCounts[section.badgeKey] ?? null : null;
  const hasChildren = (section.children?.length ?? 0) > 0;

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setHovered(false), 120);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const handleIconEnter = useCallback(() => {
    cancelClose();
    if (liRef.current) {
      const rect = liRef.current.getBoundingClientRect();
      setFlyoutPos({ top: rect.top, left: rect.right + 4 });
    }
    setHovered(true);
  }, [cancelClose]);

  const handleIconLeave = useCallback(() => {
    if (hasChildren) {
      scheduleClose();
    } else {
      setHovered(false);
    }
  }, [hasChildren, scheduleClose]);

  return (
    <>
      <li
        ref={liRef}
        className="relative"
        onMouseEnter={handleIconEnter}
        onMouseLeave={handleIconLeave}
      >
        <a
          href={landing}
          onClick={(e) => {
            navigate(landing, e);
            setHovered(false);
          }}
          aria-current={active ? "page" : undefined}
          aria-label={section.label}
          className={cn(
            "flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all relative overflow-hidden",
            active
              ? "bg-primary/25 text-interactive border border-primary/35 shadow-sm shadow-primary/20"
              : "text-foreground/45 hover:text-foreground/90 hover:bg-white/[0.07]",
            section.placeholder && "opacity-50"
          )}
        >
          {active && (
            <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-r-full" />
          )}
          <NavIcon name={section.icon} className={cn("w-4 h-4 transition-transform", active && "scale-105")} />
          {badgeCount != null && badgeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-[7px] font-bold text-white flex items-center justify-center leading-none">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </a>

        {hovered && hasChildren && (
          <HoverFlyout
            section={section}
            badgeCounts={badgeCounts}
            top={flyoutPos.top}
            left={flyoutPos.left}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClose={() => setHovered(false)}
          />
        )}
        {hovered && !hasChildren && (
          <CollapseTooltip label={section.label} sub={section.number} />
        )}
      </li>

      {COLLAPSED_DIVIDER_AFTER.has(section.id) && (
        <li aria-hidden="true" className="flex items-center justify-center py-0.5">
          <span className="w-5 h-px bg-border/35 rounded-full" />
        </li>
      )}
    </>
  );
}

// ─── Expandable section (expanded mode) ────────────────────────────────

function ExpandableSection({
  section,
  badgeCounts,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
}) {
  const [location] = useLocation();
  const sectionActive = isSectionActive(section, location);
  const landing = sectionLandingRoute(section);
  const landingActive = landing != null && isChildActive(landing, location);
  const [open, setOpen] = useState(sectionActive);
  const controlsId = useId();

  useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [location, sectionActive]);
  const children = section.children ?? [];

  return (
    <li>
      <div
        className={cn(
          "flex items-center rounded-lg text-[11px] font-semibold uppercase tracking-widest transition-all select-none",
          landingActive
            ? "mx-nav-active"
            : sectionActive
              ? "text-foreground bg-white/[0.03]"
              : "text-foreground/70 hover:text-foreground hover:bg-[rgba(20,55,110,0.4)]"
        )}
      >
        <a
          href={landing ?? "#"}
          aria-current={landingActive ? "page" : undefined}
          onClick={(e) => {
            if (!landing) {
              e.preventDefault();
              setOpen(v => !v);
              return;
            }
            navigate(landing, e);
            setOpen(true);
          }}
          className="flex-1 min-w-0 flex items-center gap-2 pl-2.5 pr-1 h-9"
        >
          <NavIcon
            name={section.icon}
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              landingActive ? "text-white" : sectionActive ? "text-foreground/80" : "text-muted-foreground/70"
            )}
          />
          <span className="flex-1 text-left truncate">{section.label}</span>
        </a>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={controlsId}
          aria-label={`${open ? "Collapse" : "Expand"} ${section.label} section`}
          onClick={() => setOpen(v => !v)}
          className={cn(
            "shrink-0 h-9 w-7 flex items-center justify-center rounded transition-colors",
            landingActive
              ? "text-white/80 hover:text-white"
              : "text-muted-foreground/60 hover:text-foreground"
          )}
        >
          <ChevronDown
            className={cn("w-3 h-3 transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </div>

      <ul
        id={controlsId}
        aria-label={`${section.label} pages`}
        className={cn(
          "mt-0.5 ml-3 pl-0 border-l border-border/20 space-y-0.5 pb-1",
          open ? "block" : "hidden"
        )}
      >
        {children.map(child => (
          <ChildRow
            key={child.id}
            child={child}
            count={child.badgeKey ? badgeCounts[child.badgeKey] ?? null : null}
          />
        ))}
      </ul>
    </li>
  );
}

// ─── Leaf section (single direct link, expanded mode) ──────────────────

function LeafSection({
  section,
  badgeCounts,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
}) {
  const [location] = useLocation();
  const active = isSectionActive(section, location);
  const to = section.to!;

  return (
    <li className="relative">
      {active && (
        <span className="absolute left-0 top-[6px] bottom-[6px] w-0.5 bg-primary rounded-full" />
      )}
      <a
        href={to}
        onClick={(e) => navigate(to, e)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 px-2.5 h-9 rounded-lg text-[11px] font-semibold uppercase tracking-widest transition-all",
          active
            ? "mx-nav-active"
            : "text-foreground/70 hover:text-foreground hover:bg-[rgba(20,55,110,0.45)]",
          section.placeholder && "opacity-60"
        )}
      >
        <NavIcon
          name={section.icon}
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            active ? "text-white" : "text-muted-foreground/70"
          )}
        />
        <span className="flex-1">{section.label}</span>
        {section.placeholder && (
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/70 border border-border/40 px-1 py-0.5 rounded leading-none normal-case shrink-0">
            Soon
          </span>
        )}
        {section.badgeKey && !section.placeholder && (
          <NavBadge
            count={badgeCounts[section.badgeKey] ?? null}
            badgeKey={section.badgeKey}
          />
        )}
      </a>
    </li>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────

export function Sidebar() {
  const badgeCounts = useNavBadges();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  function toggleCollapse() {
    setCollapsed(v => {
      saveCollapsed(!v);
      return !v;
    });
  }

  const isAdmin = user?.role === "admin";
  const visibleTree = isAdmin
    ? navTree
    : navTree.map((section) =>
        section.children?.length
          ? { ...section, children: section.children.filter((c) => c.id !== "settings-team") }
          : section
      );

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "flex flex-col shrink-0 h-full overflow-hidden mx-sidebar",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[56px]" : "w-[216px]"
      )}
      aria-label="Workspace sidebar"
    >
      {/* Logo */}
      <div className={cn(
        "border-b border-border/40 shrink-0 transition-all duration-200",
        collapsed ? "px-0 pt-3.5 pb-3 flex items-center justify-center" : "px-4 pt-4 pb-3"
      )}>
        {collapsed ? (
          <img
            src={`${import.meta.env.BASE_URL}metrix-logo.png`}
            alt="Metrix"
            className="w-6 h-6 object-contain mx-logo-glow"
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <img
                src={`${import.meta.env.BASE_URL}metrix-logo.png`}
                alt="Metrix"
                className="w-5 h-5 object-contain shrink-0 mx-logo-glow"
              />
              <span className="text-[13px] font-bold tracking-tight text-foreground">METRIX</span>
              <span className="text-[9px] font-mono text-muted-foreground/60 border border-border/50 px-1.5 py-0.5 rounded leading-none ml-0.5">
                IAP
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground/55 mt-1 leading-tight tracking-wide">
              Not more data. Better decisions.
            </p>
          </>
        )}
      </div>

      {/* Account switcher */}
      <div className={cn(
        "border-b border-border/40 shrink-0",
        collapsed ? "py-2 flex items-center justify-center" : "px-2 py-2"
      )}>
        <AccountSwitcher compact={collapsed} />
      </div>

      {/* Nav */}
      <nav
        className={cn("flex-1 overflow-y-auto py-2", collapsed ? "px-1" : "px-2")}
        aria-label="Main workspace navigation"
      >
        {collapsed ? (
          <ol className="space-y-1 list-none p-0 m-0">
            {visibleTree.map((section) => (
              <CollapsedItem
                key={section.id}
                section={section}
                badgeCounts={badgeCounts}
              />
            ))}
          </ol>
        ) : (
          <ol className="space-y-0.5 list-none p-0 m-0">
            {visibleTree.map((section) =>
              section.children?.length ? (
                <ExpandableSection
                  key={section.id}
                  section={section}
                  badgeCounts={badgeCounts}
                />
              ) : (
                <LeafSection
                  key={section.id}
                  section={section}
                  badgeCounts={badgeCounts}
                />
              )
            )}
          </ol>
        )}
      </nav>

      {/* Footer */}
      <div className={cn(
        "border-t border-border/40 shrink-0",
        collapsed ? "py-3 flex flex-col items-center gap-2" : "px-3 py-3 space-y-2.5"
      )}>
        {!collapsed && <DataSourceBadgeToggle />}
        {!collapsed && (
          <div className="space-y-0.5">
            <div className="text-[9px] text-muted-foreground/50 font-mono tracking-wider">
              METRIX IAP v2.0-rc
            </div>
            <div className="text-[9px] text-muted-foreground/50 font-mono">
              SAMPLE / DEMO DATA
            </div>
          </div>
        )}

        {/* Expand / Collapse toggle — prominent, always visible */}
        <button
          onClick={toggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg transition-all",
            "bg-primary/10 hover:bg-primary/20 border border-primary/25 hover:border-primary/45",
            "text-interactive hover:text-white",
            "shadow-sm shadow-primary/10",
            collapsed
              ? "w-10 h-9"
              : "w-full h-8 text-[10px] font-semibold"
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-3.5 h-3.5 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
