import { useLocation } from "wouter";
import { useState, useEffect, useId } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Database } from "lucide-react";
import { AccountSwitcher } from "./AccountSwitcher";
import { DataSourceBadgeToggle } from "@/components/ui/DataSourceBadge";
import { navTree, sectionLandingRoute } from "@/navigation/navTree";
import { useNavBadges } from "@/navigation/useNavBadges";
import { useAuth } from "@/contexts/AuthContext";
import type { NavSection, NavChild } from "@/navigation/navTree";

// ─── Badge pill ────────────────────────────────────────────────────────

const BADGE_STYLE: Record<string, string> = {
  alerts:      "bg-destructive/15 text-destructive border-destructive/20",
  signals:     "text-amber-400 bg-amber-400/10 border-amber-400/20",
  suggestions: "bg-primary/15 text-primary border-primary/20",
  briefs:      "bg-primary/15 text-primary border-primary/20",
  mst:         "bg-muted text-muted-foreground border-border/40",
  agent:       "bg-muted text-muted-foreground border-border/40",
};

function NavBadge({ count, badgeKey }: { count: number | null; badgeKey: string }) {
  if (count == null || count <= 0) return null;
  return (
    <span className={cn(
      "ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none tabular-nums",
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

// ─── Child row ─────────────────────────────────────────────────────────

function ChildRow({ child, count }: { child: NavChild; count: number | null }) {
  const [location] = useLocation();
  const active = isChildActive(child.to, location);

  return (
    <li className="relative">
      {active && (
        <span className="absolute left-0 top-[5px] bottom-[5px] w-0.5 bg-primary rounded-full" />
      )}
      <a
        href={child.to}
        onClick={(e) => navigate(child.to, e)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-1.5 pl-3 pr-2 h-8 rounded-r text-[12px] transition-colors",
          active
            ? "font-medium mx-nav-child-active"
            : "text-foreground/70 hover:text-foreground hover:bg-[rgba(20,55,110,0.4)]"
        )}
      >
        <span className="flex-1 truncate leading-tight">{child.label}</span>
        {child.placeholder && !active && (
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/80 border border-border/40 px-1 py-0.5 rounded leading-none shrink-0">
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

// ─── Expandable section ────────────────────────────────────────────────

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
          "flex items-center rounded text-[11px] font-semibold uppercase tracking-widest transition-colors select-none",
          landingActive
            ? "mx-nav-active"
            : sectionActive
              ? "text-foreground"
              : "text-foreground/75 hover:text-foreground hover:bg-[rgba(20,55,110,0.4)]"
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
          className="flex-1 min-w-0 flex items-center gap-2 pl-3 pr-1 h-9"
        >
          <span className={cn(
            "w-4 shrink-0 text-[8px] font-mono tabular-nums",
            landingActive ? "text-white/80" : "text-muted-foreground/80"
          )}>
            {section.number}
          </span>
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
              : "text-muted-foreground/80 hover:text-foreground"
          )}
        >
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform duration-200",
              open && "rotate-180"
            )}
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

// ─── Leaf section (single direct link) ────────────────────────────────

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
          "flex items-center gap-2 px-3 h-9 rounded-lg text-[11px] font-semibold uppercase tracking-widest transition-colors",
          active
            ? "mx-nav-active"
            : "text-foreground/75 hover:text-foreground hover:bg-[rgba(20,55,110,0.5)]"
        )}
      >
        <span className={cn(
          "w-4 shrink-0 text-[8px] font-mono tabular-nums",
          active ? "text-white/80" : "text-muted-foreground/80"
        )}>
          {section.number}
        </span>
        <span className="flex-1">{section.label}</span>
        {section.placeholder && (
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/80 border border-border/40 px-1 py-0.5 rounded leading-none shrink-0 normal-case">
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

  // Team & Access is admin-only (the API 403s members); hide it from the nav
  // for non-admin users so there are no dead links.
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
      className="flex flex-col w-[216px] shrink-0 h-full overflow-hidden mx-sidebar"
      aria-label="Workspace sidebar"
    >
      {/* Logo */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
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
        <p className="text-[9px] text-muted-foreground/60 mt-1 leading-tight tracking-wide">
          Not more data. Better decisions.
        </p>
      </div>

      {/* Account switcher */}
      <div className="px-2 py-2 border-b border-border/40">
        <AccountSwitcher />
      </div>

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto px-2 py-2"
        aria-label="Main workspace navigation"
      >
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
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border/40 space-y-2.5">
        <DataSourceBadgeToggle />
        <div className="space-y-0.5">
          <div className="text-[9px] text-muted-foreground/60 font-mono tracking-wider">
            METRIX IAP v2.0-rc
          </div>
          <div className="text-[9px] text-muted-foreground/60 font-mono">
            SAMPLE / DEMO DATA
          </div>
        </div>
      </div>
    </aside>
  );
}
