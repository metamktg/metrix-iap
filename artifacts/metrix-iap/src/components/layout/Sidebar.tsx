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
import { DataSourceBadgeToggle } from "@/components/ui/DataSourceBadge";
import { navTree, sectionLandingRoute } from "@/navigation/navTree";
import { useNavBadges } from "@/navigation/useNavBadges";
import { useAuth } from "@/contexts/AuthContext";
import { AccountSwitcher } from "./AccountSwitcher";
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

  // Handle leaf sections (no children) — these show a tooltip, not a flyout,
  // so this component is only rendered when hasChildren is true.
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
    closeTimer.current = setTimeout(() => setHovered(false), 150);
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
      // Estimate flyout height: header (32px) + each child (34px) + padding (12px)
      const estHeight = 32 + (section.children?.length ?? 0) * 34 + 12;
      const rawTop = rect.top;
      // Clamp so the flyout doesn't overflow the bottom of the viewport
      const clampedTop = Math.min(rawTop, window.innerHeight - estHeight - 8);
      setFlyoutPos({ top: Math.max(8, clampedTop), left: rect.right + 6 });
    }
    setHovered(true);
  }, [cancelClose, section.children?.length]);

  const handleIconLeave = useCallback(() => {
    if (hasChildren) {
      scheduleClose();
    } else {
      setHovered(false);
    }
  }, [hasChildren, scheduleClose]);

  // Escape key closes the flyout
  useEffect(() => {
    if (!hovered) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHovered(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hovered]);

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
          title={!hasChildren ? section.label : undefined}
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
// open / onToggle are controlled by the parent Sidebar (accordion mode).

function ExpandableSection({
  section,
  badgeCounts,
  open,
  onToggle,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  open: boolean;
  onToggle: () => void;
}) {
  const [location] = useLocation();
  const sectionActive = isSectionActive(section, location);
  const landing = sectionLandingRoute(section);
  const landingActive = landing != null && isChildActive(landing, location);
  const controlsId = useId();
  const children = section.children ?? [];

  return (
    <li>
      {/* Single row: icon + label navigates to landing; chevron toggles list */}
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
        {/* Icon + label: navigates to landing page */}
        <a
          href={landing ?? "#"}
          aria-current={landingActive ? "page" : undefined}
          onClick={(e) => {
            if (!landing) {
              e.preventDefault();
              onToggle();
              return;
            }
            navigate(landing, e);
            // Ensure this section stays open when navigated to
            if (!open) onToggle();
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

        {/* Chevron-only toggle — expands/collapses child list without navigating */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={controlsId}
          aria-label={`${open ? "Collapse" : "Expand"} ${section.label} section`}
          onClick={onToggle}
          className={cn(
            "shrink-0 h-9 w-7 flex items-center justify-center rounded transition-colors",
            landingActive
              ? "text-white/70 hover:text-white"
              : "text-muted-foreground/40 hover:text-muted-foreground"
          )}
        >
          <ChevronDown
            className={cn("w-3 h-3 transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </div>

      {/* Animated child list — grid 0fr→1fr trick animates height:auto cleanly */}
      <div
        id={controlsId}
        aria-hidden={!open}
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 220ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <ul
          aria-label={`${section.label} pages`}
          className="overflow-hidden mt-0.5 ml-3 pl-0 border-l border-border/20 space-y-0.5 pb-1"
        >
          {children.map(child => (
            <ChildRow
              key={child.id}
              child={child}
              count={child.badgeKey ? badgeCounts[child.badgeKey] ?? null : null}
            />
          ))}
        </ul>
      </div>
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
  const [location] = useLocation();
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
          ? { ...section, children: section.children.filter((c) => c.id !== "settings-users") }
          : section
      );

  // ─── Accordion state ──────────────────────────────────────────────────
  // Find the currently active section to open by default.
  const activeSection = visibleTree.find(s => isSectionActive(s, location));
  const [openSectionId, setOpenSectionId] = useState<string | null>(
    activeSection?.id ?? null
  );

  // When the user navigates (e.g. via topbar breadcrumb or link click),
  // auto-open the section that contains the new active page.
  useEffect(() => {
    const nowActive = visibleTree.find(s => isSectionActive(s, location));
    if (nowActive) {
      setOpenSectionId(nowActive.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  function handleSectionToggle(id: string) {
    setOpenSectionId(prev => (prev === id ? null : id));
  }

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
      {/* Logo row — collapse toggle lives here as a small icon button */}
      <div className={cn(
        "border-b border-border/40 shrink-0 transition-all duration-200",
        collapsed
          ? "px-0 pt-3 pb-2.5 flex flex-col items-center gap-2"
          : "px-4 pt-4 pb-3"
      )}>
        {collapsed ? (
          <>
            <img
              src={`${import.meta.env.BASE_URL}metrix-logo.png`}
              alt="Metrix"
              className="w-6 h-6 object-contain mx-logo-glow"
            />
            {/* Expand button beneath logo in collapsed mode */}
            <button
              onClick={toggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/[0.05] transition-colors"
            >
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <img
                src={`${import.meta.env.BASE_URL}metrix-logo.png`}
                alt="Metrix"
                className="w-5 h-5 object-contain shrink-0 mx-logo-glow"
              />
              <span className="text-[14px] font-semibold tracking-tight text-foreground/90">metrix</span>
              {/* IAP badge — hover reveals the tagline */}
              <span className="relative group ml-0.5">
                <span className="text-[9px] font-mono text-muted-foreground/60 border border-border/50 px-1.5 py-0.5 rounded leading-none cursor-default select-none">
                  IAP
                </span>
                <span className={cn(
                  "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5",
                  "rounded-lg bg-[hsl(222_61%_10%)] border border-border/50 shadow-xl",
                  "text-[10px] text-muted-foreground/70 whitespace-nowrap italic",
                  "opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50"
                )}>
                  Not more data. Better decisions.
                </span>
              </span>
              {/* Collapse button — right-aligned in logo row */}
              <button
                onClick={toggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="ml-auto w-6 h-6 flex items-center justify-center rounded text-muted-foreground/35 hover:text-muted-foreground hover:bg-white/[0.05] transition-colors"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Account switcher — expanded mode, full-width row */}
            <div className="mt-2.5 border-t border-border/30 pt-2.5">
              <AccountSwitcher />
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <nav
        className={cn("flex-1 overflow-y-auto py-2", collapsed ? "px-1" : "px-2")}
        aria-label="Main workspace navigation"
      >
        {collapsed ? (
          <ol className="space-y-1 list-none p-0 m-0">
            {/* Compact account switcher at top of icon rail */}
            <li className="pb-0.5">
              <AccountSwitcher compact />
            </li>
            <li aria-hidden="true" className="flex items-center justify-center py-0.5">
              <span className="w-5 h-px bg-border/35 rounded-full" />
            </li>
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
                  open={openSectionId === section.id}
                  onToggle={() => handleSectionToggle(section.id)}
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

      {/* Footer — data source badge + version only */}
      <div className={cn(
        "border-t border-border/40 shrink-0",
        collapsed ? "py-3 flex flex-col items-center gap-2" : "px-3 py-3 space-y-2"
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
      </div>
    </aside>
  );
}
