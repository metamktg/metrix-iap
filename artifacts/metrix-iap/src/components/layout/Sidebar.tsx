import { useLocation } from "wouter";
import { useState, useRef, useCallback, useEffect, useId } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
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
import { navTree, sectionLandingRoute } from "@/navigation/navTree";
import { useNavBadges } from "@/navigation/useNavBadges";
import { useAuth } from "@/contexts/AuthContext";
import { useDragResize } from "@/hooks/useDragResize";
import { AccountSwitcher } from "./AccountSwitcher";
import type { NavSection, NavChild, NavIconName } from "@/navigation/navTree";

// The sidebar never expands past this width by dragging — 216px is the
// fixed "full" size; the slide handle can only shrink it down to the
// collapsed rail. Expanding back to 216px happens via click, not drag.
const EXPANDED_WIDTH = 216;
const COLLAPSED_WIDTH = 56;
// Drop below this width mid-drag and releasing snaps to the collapsed rail.
const COLLAPSE_SNAP_WIDTH = 150;

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
  signals:     "text-status-warning bg-status-warning/10 border-status-warning/20",
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
  navigateTo(href);
}

function navigateTo(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// ─── Single-click vs double-click dispatch ─────────────────────────────
// Nav click model (Metrix v1 design handoff): a single click on an
// expandable section toggles its children open/closed (accordion); a
// double click within ~220ms instead navigates straight to that section's
// Command Center. The first click's toggle is deferred behind the window
// so a fast second click can still cancel it and navigate instead.
const DOUBLE_CLICK_MS = 220;

function useSingleOrDoubleClick(onSingle: () => void, onDouble: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  return useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      onDouble();
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onSingle();
    }, DOUBLE_CLICK_MS);
  }, [onSingle, onDouble]);
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
          "flex items-center gap-1.5 pl-3 pr-2 h-8 rounded-r text-[12px] transition-[color,background-color,border-color,box-shadow,opacity,transform]",
          active
            ? "font-semibold text-foreground bg-primary/8"
            : "text-foreground/65 hover:text-foreground hover:bg-primary/10"
        )}
      >
        <span className="flex-1 truncate leading-tight">{child.label}</span>
        {child.placeholder && !active && (
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/75 border border-border/40 px-1 py-0.5 rounded leading-none shrink-0">
            Soon
          </span>
        )}
        {!child.placeholder && child.dataSource && (
          <Database className="w-2 h-2 shrink-0 text-muted-foreground/75 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        {child.badgeKey && !child.placeholder && (
          <NavBadge count={count} badgeKey={child.badgeKey} />
        )}
      </a>
    </li>
  );
}

// ─── Collapsed icon item ────────────────────────────────────────────────
// No flyout/hover behavior (Metrix v1 design handoff: "that was tried and
// removed for being unreliable on a scrolling rail"). Clicking an
// expandable section's icon reopens the full rail on that section instead;
// clicking a leaf section's icon navigates directly, same as expanded mode.

const COLLAPSED_DIVIDER_AFTER = new Set(["overview", "analysis", "mst", "exports"]);

function CollapsedItem({
  section,
  badgeCounts,
  onExpandToSection,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  onExpandToSection: (sectionId: string) => void;
}) {
  const [location] = useLocation();
  const active = isSectionActive(section, location);
  const landing = sectionLandingRoute(section) ?? section.to ?? "#";
  const badgeCount = section.badgeKey ? badgeCounts[section.badgeKey] ?? null : null;
  const hasChildren = (section.children?.length ?? 0) > 0;

  return (
    <>
      <li className="relative">
        <a
          href={landing}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault();
              onExpandToSection(section.id);
              return;
            }
            navigate(landing, e);
          }}
          aria-current={active ? "page" : undefined}
          aria-label={section.label}
          title={section.label}
          className={cn(
            "flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-[color,background-color,border-color,box-shadow,opacity,transform] relative overflow-hidden",
            active
              ? "bg-primary/20 text-interactive border border-primary/30"
              : "text-foreground/55 hover:text-foreground/90 hover:bg-foreground/[0.07]",
            section.placeholder && "opacity-50"
          )}
        >
          {active && (
            <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-r-full" />
          )}
          <NavIcon name={section.icon} className="w-4 h-4" />
          {badgeCount != null && badgeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-[7px] font-bold text-foreground flex items-center justify-center leading-none">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </a>
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

  // Single click toggles the accordion; double click (within 220ms)
  // navigates to the section's Command Center instead.
  const handleClick = useSingleOrDoubleClick(
    onToggle,
    () => {
      if (landing) navigateTo(landing);
    },
  );

  return (
    <li>
      {/* One row: single click toggles the child list, double click navigates
          to the section's Command Center (Metrix v1 design handoff). */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={controlsId}
        aria-current={landingActive ? "page" : undefined}
        onClick={handleClick}
        title={landing ? `Click to expand · double-click to open ${section.label}` : undefined}
        className={cn(
          "pressable-lg w-full flex items-center gap-2 pl-2.5 pr-1 h-9 rounded-lg text-[13px] tracking-[-0.005em] transition-[color,background-color,border-color,box-shadow,opacity,transform] select-none",
          landingActive
            ? "mx-nav-active font-medium"
            : sectionActive
              ? "text-foreground bg-primary/[0.09] font-medium"
              : "text-foreground/70 font-normal hover:text-foreground hover:bg-primary/10"
        )}
      >
        <NavIcon
          name={section.icon}
          className={cn(
            "w-4 h-4 shrink-0",
            landingActive ? "text-foreground" : sectionActive ? "text-interactive" : "text-muted-foreground/75"
          )}
        />
        <span className="flex-1 text-left truncate">{section.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "w-3 h-3 shrink-0 transition-transform duration-200",
            open && "rotate-180",
            landingActive ? "text-foreground/70" : "text-muted-foreground/75"
          )}
        />
      </button>

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
          "flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13px] tracking-[-0.005em] transition-[color,background-color,border-color,box-shadow,opacity,transform]",
          active
            ? "mx-nav-active font-medium"
            : "text-foreground/70 font-normal hover:text-foreground hover:bg-primary/10",
          section.placeholder && "opacity-60"
        )}
      >
        <NavIcon
          name={section.icon}
          className={cn(
            "w-4 h-4 shrink-0",
            active ? "text-foreground" : "text-muted-foreground/75"
          )}
        />
        <span className="flex-1">{section.label}</span>
        {section.placeholder && (
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/75 border border-border/40 px-1 py-0.5 rounded leading-none normal-case shrink-0">
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
  // Live width while a drag is in progress — overrides the collapsed/expanded
  // CSS width class so the rail visibly tracks the pointer. Cleared on
  // release once we've committed to a collapsed/expanded state.
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  function toggleCollapse() {
    setCollapsed(v => {
      saveCollapsed(!v);
      return !v;
    });
  }

  // Slide-to-collapse handle on the right edge. Dragging can only shrink the
  // sidebar down toward the collapsed rail — it never grows past
  // EXPANDED_WIDTH. A plain click (no drag) toggles collapsed/expanded, the
  // same as clicking the explicit expand/collapse buttons.
  const baseWidthRef = useRef(collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH);
  const handlePointerDown = useDragResize(
    (dx) => {
      const next = Math.min(EXPANDED_WIDTH, Math.max(COLLAPSED_WIDTH, baseWidthRef.current + dx));
      setDragWidth(next);
    },
    (wasDragged) => {
      if (!wasDragged) {
        toggleCollapse();
      } else {
        setDragWidth((finalWidth) => {
          const shouldCollapse = (finalWidth ?? EXPANDED_WIDTH) < COLLAPSE_SNAP_WIDTH;
          if (shouldCollapse !== collapsed) {
            setCollapsed(shouldCollapse);
            saveCollapsed(shouldCollapse);
          }
          return null;
        });
      }
    }
  );
  const onHandlePointerDown = (e: React.PointerEvent) => {
    baseWidthRef.current = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
    handlePointerDown(e);
  };

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

  // Collapsed rail: clicking an expandable section's icon reopens the full
  // rail on that section (no flyout/hover).
  function handleExpandToSection(id: string) {
    setCollapsed(false);
    saveCollapsed(false);
    setOpenSectionId(id);
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "relative flex flex-col shrink-0 h-full overflow-hidden mx-sidebar",
        dragWidth == null && "transition-[width] duration-200 ease-out",
        dragWidth == null && (collapsed ? "w-[56px]" : "w-[216px]")
      )}
      style={dragWidth != null ? { width: dragWidth } : undefined}
      aria-label="Workspace sidebar"
    >
      {/* Logo row — collapse toggle lives here as a small icon button */}
      <div className={cn(
        "border-b border-border/40 shrink-0 transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200",
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
              className="pressable w-7 h-7 flex items-center justify-center rounded text-muted-foreground/75 hover:text-muted-foreground hover:bg-foreground/[0.05] transition-colors"
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
              <span className="text-[16px] font-semibold tracking-tight text-foreground/90">metrix</span>
              {/* Collapse button — right-aligned in logo row */}
              <button
                onClick={toggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="pressable ml-auto w-6 h-6 flex items-center justify-center rounded text-muted-foreground/75 hover:text-muted-foreground hover:bg-foreground/[0.05] transition-colors"
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
                onExpandToSection={handleExpandToSection}
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

      {/* Slide-to-collapse handle — drag left to shrink toward the rail
          (never past EXPANDED_WIDTH going the other way); click to toggle. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Sidebar resize handle"
        title={collapsed ? "Click to expand" : "Drag to collapse"}
        onPointerDown={onHandlePointerDown}
        className={cn(
          "absolute top-0 right-0 h-full w-1.5 -mr-0.5 z-10 cursor-col-resize group/handle",
          "flex items-center justify-center"
        )}
      >
        <span className="w-px h-full bg-transparent group-hover/handle:bg-primary/40 transition-colors" />
      </div>

      {/* Footer — signed-in user, data source badge + version */}
      <div className={cn(
        "border-t border-border/40 shrink-0",
        collapsed ? "py-3 flex flex-col items-center gap-2" : "px-3 py-3 space-y-2"
      )}>
        {user && (
          <div
            className={cn("flex items-center gap-2 min-w-0", collapsed && "justify-center")}
            data-testid="sidebar-user-footer"
            title={user.email}
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 bg-primary/15 border border-primary/25 text-interactive text-label font-bold leading-none"
            >
              {user.email.slice(0, 2).toUpperCase()}
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-caption font-medium text-foreground/85 truncate leading-tight">{user.email}</p>
                <p className="text-label text-muted-foreground/75 leading-tight">
                  {user.role === "admin" ? "Agency (internal)" : "Member"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
