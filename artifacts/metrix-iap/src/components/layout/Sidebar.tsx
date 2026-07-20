import { useLocation } from "wouter";
import { useState, useEffect, useId } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
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
  Bot,
  Settings2,
  Info,
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
  Bot,
  Settings2,
};

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}

// ─── Collapse state ────────────────────────────────────────────────────

const STORAGE_KEY = "metrix_sidebar_collapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
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

const BADGE_STYLE: Record<string, { base: string; shape: string }> = {
  alerts:      { base: "bg-destructive/15 text-destructive border-destructive/20",        shape: "rounded" },
  signals:     { base: "bg-amber-400 text-amber-950 border-amber-400/80",                  shape: "rounded-full" },
  suggestions: { base: "bg-primary/15 text-primary border-primary/30",                     shape: "rounded-full" },
  briefs:      { base: "bg-primary/12 text-primary border-primary/30",                     shape: "rounded-full" },
  mst:         { base: "bg-white/[0.04] text-muted-foreground/55 border-border/35",        shape: "rounded" },
  agent:       { base: "bg-white/[0.04] text-muted-foreground/55 border-border/35",        shape: "rounded" },
};

const BADGE_FALLBACK = { base: "bg-muted text-muted-foreground border-border/40", shape: "rounded" };

function NavBadge({ count, badgeKey }: { count: number | null; badgeKey: string }) {
  if (count == null || count <= 0) return null;
  const style = BADGE_STYLE[badgeKey] ?? BADGE_FALLBACK;
  return (
    <span className={cn(
      "ml-auto text-[9px] font-bold px-1.5 py-0.5 border leading-none tabular-nums shrink-0",
      style.base,
      style.shape,
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

// ─── Tooltip (collapsed-mode hover label) ─────────────────────────────

function CollapseTooltip({
  label,
  teaser,
}: {
  label: string;
  teaser?: string;
}) {
  return (
    <div className={cn(
      "absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[100]",
      "pointer-events-none select-none",
      "bg-surface border border-border/50 rounded-md elevation-raised",
      "px-2.5 py-1.5 max-w-[220px]",
    )}>
      <div className="text-body font-semibold text-foreground leading-tight whitespace-nowrap">{label}</div>
      {teaser && (
        <div className="text-label text-muted-foreground/65 mt-1 leading-snug whitespace-normal">{teaser}</div>
      )}
    </div>
  );
}

// ─── Footer info tooltip (version / data mode) ─────────────────────────

function FooterInfoTip() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label="Build info"
        className="flex items-center gap-1 text-muted-foreground/35 hover:text-muted-foreground/65 transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
      {hovered && (
        <div className={cn(
          "absolute left-5 bottom-0 z-[100]",
          "pointer-events-none select-none",
          "bg-surface border border-border/50 rounded-md elevation-raised",
          "px-2.5 py-1.5 whitespace-nowrap",
        )}>
          <div className="text-[9px] font-mono text-muted-foreground/60 tracking-wider">METRIX IAP v2.0-rc</div>
          <div className="text-[9px] font-mono text-muted-foreground/50">SAMPLE / DEMO DATA</div>
        </div>
      )}
    </div>
  );
}

// ─── Tooltip for expanded placeholder items ────────────────────────────

function ExpandedPlaceholderTooltip({ label, teaser }: { label: string; teaser: string }) {
  return (
    <div className={cn(
      "absolute left-2 right-2 top-full mt-0.5 z-[100]",
      "pointer-events-none select-none",
      "bg-surface border border-border/50 rounded-md elevation-raised",
      "px-2.5 py-2",
    )}>
      <span className="inline-block text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/55 border border-border/35 px-1 py-0.5 rounded leading-none mb-1.5">
        Coming Soon
      </span>
      <div className="text-caption font-semibold text-foreground leading-tight">{label}</div>
      <div className="text-label text-muted-foreground/65 mt-1 leading-snug">{teaser}</div>
    </div>
  );
}

// ─── Collapsed icon button ─────────────────────────────────────────────

// IDs after which a thin section divider is inserted in collapsed mode
const COLLAPSED_DIVIDER_AFTER = new Set(["overview", "analysis", "reports", "mst"]);

function CollapsedItem({
  section,
  badgeCounts,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
}) {
  const [location] = useLocation();
  const [hovered, setHovered] = useState(false);
  const active = isSectionActive(section, location);
  const landing = sectionLandingRoute(section) ?? section.to ?? "#";
  const badgeCount = section.badgeKey ? badgeCounts[section.badgeKey] ?? null : null;

  return (
    <>
      <li className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <a
          href={section.placeholder ? undefined : landing}
          onClick={section.placeholder ? (e) => e.preventDefault() : (e) => navigate(landing, e)}
          aria-current={active ? "page" : undefined}
          aria-disabled={section.placeholder || undefined}
          aria-label={section.placeholder ? `${section.label} — coming soon` : section.label}
          tabIndex={section.placeholder ? -1 : undefined}
          className={cn(
            "flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all relative overflow-hidden",
            active
              ? "bg-primary/25 text-primary border border-primary/35 shadow-sm shadow-primary/20"
              : "text-foreground/45 hover:text-foreground/90 hover:bg-white/[0.07]",
            section.placeholder && "opacity-40 cursor-not-allowed pointer-events-none"
          )}
        >
          {/* Active left accent bar */}
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
        {hovered && (
          <CollapseTooltip
            label={section.label}
            teaser={section.teaser}
          />
        )}
      </li>
      {/* Section group divider */}
      {COLLAPSED_DIVIDER_AFTER.has(section.id) && (
        <li aria-hidden="true" className="flex items-center justify-center py-0.5">
          <span className="w-5 h-px bg-border/35 rounded-full" />
        </li>
      )}
    </>
  );
}

// ─── Child row (expanded) ──────────────────────────────────────────────

function ChildRow({ child, count }: { child: NavChild; count: number | null }) {
  const [location] = useLocation();
  const active = isChildActive(child.to, location);
  const [hovered, setHovered] = useState(false);

  return (
    <li
      className="relative"
      onMouseEnter={child.placeholder ? () => setHovered(true) : undefined}
      onMouseLeave={child.placeholder ? () => setHovered(false) : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-[5px] w-0.5 bg-primary rounded-full" />
      )}
      <a
        href={child.placeholder ? undefined : child.to}
        onClick={child.placeholder ? (e) => e.preventDefault() : (e) => navigate(child.to, e)}
        aria-current={active ? "page" : undefined}
        aria-disabled={child.placeholder || undefined}
        tabIndex={child.placeholder ? -1 : undefined}
        className={cn(
          "flex items-center gap-1.5 pl-3 pr-2 h-8 rounded-r text-body transition-all",
          active
            ? "font-semibold text-foreground bg-primary/8"
            : "text-foreground/65 hover:text-foreground hover:bg-[rgba(20,55,110,0.45)]",
          child.placeholder && "opacity-40 cursor-not-allowed pointer-events-none"
        )}
      >
        <span className="flex-1 truncate leading-tight">{child.label}</span>
        {child.placeholder && !active && (
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/70 border border-border/40 px-1 py-0.5 rounded leading-none shrink-0">
            Soon
          </span>
        )}
        {!child.placeholder && child.dataSource && (
          <Database className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        {child.badgeKey && !child.placeholder && (
          <NavBadge count={count} badgeKey={child.badgeKey} />
        )}
      </a>
      {hovered && child.teaser && (
        <ExpandedPlaceholderTooltip label={child.label} teaser={child.teaser} />
      )}
    </li>
  );
}

// ─── Expandable section (expanded) ────────────────────────────────────

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
          "flex items-center rounded-lg text-caption font-semibold uppercase tracking-widest transition-all select-none",
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
            className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")}
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

// ─── Leaf section (single direct link, expanded) ────────────────────────

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
  const [hovered, setHovered] = useState(false);

  return (
    <li
      className="relative"
      onMouseEnter={section.placeholder ? () => setHovered(true) : undefined}
      onMouseLeave={section.placeholder ? () => setHovered(false) : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-[6px] w-0.5 bg-primary rounded-full" />
      )}
      <a
        href={section.placeholder ? undefined : to}
        onClick={section.placeholder ? (e) => e.preventDefault() : (e) => navigate(to, e)}
        aria-current={active ? "page" : undefined}
        aria-disabled={section.placeholder || undefined}
        tabIndex={section.placeholder ? -1 : undefined}
        className={cn(
          "flex items-center gap-2 px-2.5 h-9 rounded-lg text-caption font-semibold uppercase tracking-widest transition-all",
          active
            ? "mx-nav-active"
            : "text-foreground/70 hover:text-foreground hover:bg-[rgba(20,55,110,0.45)]",
          section.placeholder && "opacity-40 cursor-not-allowed pointer-events-none"
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
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/55 border border-border/35 px-1 py-0.5 rounded leading-none normal-case shrink-0">
            Coming Soon
          </span>
        )}
        {section.badgeKey && !section.placeholder && (
          <NavBadge
            count={badgeCounts[section.badgeKey] ?? null}
            badgeKey={section.badgeKey}
          />
        )}
      </a>
      {hovered && section.teaser && (
        <ExpandedPlaceholderTooltip label={section.label} teaser={section.teaser} />
      )}
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
        collapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-expanded)]"
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
          <div className="flex items-center gap-2">
            <img
              src={`${import.meta.env.BASE_URL}metrix-logo.png`}
              alt="Metrix"
              className="w-5 h-5 object-contain shrink-0 mx-logo-glow"
            />
            <span className="text-title font-bold tracking-tight text-foreground">METRIX</span>
            <span className="text-[9px] font-mono text-muted-foreground/60 border border-border/50 px-1.5 py-0.5 rounded leading-none ml-0.5">
              IAP
            </span>
          </div>
        )}
      </div>

      {/* Account context header — distinct zone so the workspace selector
          reads as "what am I scoped to" rather than generic nav chrome.
          Collapsed: compact icon-only button. Expanded: labelled zone. */}
      {collapsed ? (
        <div className="shrink-0 border-b border-border/40 bg-white/[0.015] flex items-center justify-center py-1">
          <AccountSwitcher compact />
        </div>
      ) : (
        <div className="shrink-0 border-b border-border/40 bg-white/[0.015]">
          <div className="px-2 pt-2 pb-2">
            <AccountSwitcher />
          </div>
        </div>
      )}

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
          <FooterInfoTip />
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center justify-center rounded-lg transition-all",
            "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.06]",
            collapsed ? "w-10 h-8" : "w-full h-7 gap-1.5 text-label font-medium border border-border/20"
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          ) : (
            <>
              <PanelLeftClose className="w-3.5 h-3.5" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
