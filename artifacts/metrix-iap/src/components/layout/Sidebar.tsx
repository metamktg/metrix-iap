import { useLocation } from "wouter";
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  ChevronDown,
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
import { NAV_GROUP_LABEL, navTree, sectionLandingRoute, visibleChildren } from "@/navigation/navTree";
import { TYPE } from "@/pages/metrix/typography";
import { useNavBadges } from "@/navigation/useNavBadges";
import { useAuth } from "@/contexts/AuthContext";
import { useDragResize } from "@/hooks/useDragResize";
import { DUR_FAST, DUR_MED, EASE, motionOr, staggerDelay } from "@/lib/motion";
import { AccountSwitcher } from "./AccountSwitcher";
import type { NavSection, NavChild, NavIconName, NavGroup } from "@/navigation/navTree";

// ─── A collapsible sidebar whose pages disclose on intent ─────────────
//
// Two widths, one control: the sidebar is expanded (216px, labels) or a
// collapsed rail (56px, icons), toggled by the button in the logo row or by
// the resize handle on its edge, and remembered per browser. That part is
// the sidebar every reader already knows.
//
// What is different is how a section's PAGES appear. There is no chevron to
// click and no second tap: resting the pointer on a section for a moment
// (or focusing it from the keyboard) opens its page list in place — the
// section under the pointer slides open, the one that was open slides shut
// — and the label itself is still a plain link to the section's command
// center. Leave the sidebar and, after a short grace, the list returns to
// the section the reader is actually on. In the collapsed rail the same
// dwell opens the section's pages as a flyout beside its icon; the icon is
// a link to the command center, so the rail can navigate.
//
// Nothing about a section is written out in the sidebar: what a module is
// for lives in its tooltip (the title on every section and page), never as
// a line under the label. The six loop stages keep their numerals on one
// spine, and the groups keep their labels — those are structure, not prose.
//
// Owner direction (2026-09-03, second pass): a collapsible / expandable
// side navigation, with a more user-friendly way to disclose the loop's
// sub-tabs without extra clicks; tooltips back; no disclosed text surfaced
// on the main interface.
//
// Mechanics from the Watermelon references (docs/resources/watermelon):
// tooltip-navbar's dwell-then-follow (one delay to open, none to travel once
// open) and layered-progressive-disclosure's arrival (blur + 8px, never 50).

// The sidebar never expands past this width by dragging — 216px is the
// fixed "full" size; the slide handle can only shrink it down to the
// collapsed rail. Expanding back to 216px happens via click, not drag.
const EXPANDED_WIDTH = 216;
const COLLAPSED_WIDTH = 56;
// Drop below this width mid-drag and releasing snaps to the collapsed rail.
const COLLAPSE_SNAP_WIDTH = 150;
/** How long a pointer rests on a section before its pages open. */
export const OPEN_DWELL_MS = 180;
/** How long an intent-opened list stays after the pointer leaves the sidebar. */
export const CLOSE_GRACE_MS = 260;
const FLYOUT_WIDTH = 224;

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
      "ml-auto text-micro-num font-bold px-1.5 py-0.5 rounded border leading-none tabular-nums shrink-0",
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

/** A pointer that reports itself as touch has no hover; everything else (mouse, pen, jsdom's undefined) does. */
function hovers(e: { pointerType?: string }): boolean {
  return e.pointerType !== "touch";
}

type PointerPoint = { x: number; y: number };
const pointAt = (e: { clientX: number; clientY: number }): PointerPoint => ({ x: e.clientX, y: e.clientY });
/** Movement below this is a layout shift under a resting pointer, not the reader travelling. */
const FOLLOW_MIN_TRAVEL_PX = 4;

/** The rail's dividers mark the product's shape: after the account, after the loop, after the outputs. */
function dividerAfter(section: NavSection, next: NavSection | undefined): boolean {
  return next != null && next.group !== section.group;
}

// ─── Child row (expanded list and rail flyout) ──────────────────────────

function ChildRow({
  child,
  count,
  index,
  total,
  reduced,
  onNavigate,
}: {
  child: NavChild;
  count: number | null;
  index: number;
  total: number;
  reduced: boolean | null;
  onNavigate?: () => void;
}) {
  const [location] = useLocation();
  const active = isChildActive(child.to, location);

  return (
    <motion.li
      className="relative"
      initial={reduced ? false : { opacity: 0, x: -8, filter: "blur(4px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={motionOr(reduced, { duration: DUR_MED, ease: EASE, delay: staggerDelay(index, total) })}
    >
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
        // What the page proves is a tooltip, never a line under the label.
        title={child.purpose ? `${child.label} — ${child.purpose}` : child.label}
        className={cn(
          "flex items-center gap-1.5 pl-3 pr-2 min-h-8 py-1 rounded-r text-caption transition-[color,background-color,border-color,box-shadow,opacity,transform]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          active
            ? "font-semibold text-foreground bg-primary/8"
            : "text-foreground/65 hover:text-foreground hover:bg-primary/10"
        )}
      >
        <span className="flex-1 min-w-0 truncate leading-tight">{child.label}</span>
        {child.placeholder && !active && (
          <span className="text-micro font-semibold uppercase text-muted-foreground/75 border border-border/40 px-1 py-0.5 rounded leading-none shrink-0">
            Soon
          </span>
        )}
        {child.badgeKey && !child.placeholder && (
          <NavBadge count={count} badgeKey={child.badgeKey} />
        )}
      </a>
    </motion.li>
  );
}

// ─── Collapsed icon item ────────────────────────────────────────────────
// The icon is a link to the command center. Its pages open as a flyout on
// intent — rendered by the Sidebar beside the rail, outside the scrolling
// nav (which would clip anything wider than 56px), at this item's height.

function CollapsedItem({
  section,
  badgeCounts,
  open,
  flyoutId,
  onIntent,
  onLeave,
  showDivider,
  itemRef,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  open: boolean;
  flyoutId: string;
  onIntent: (sectionId: string, via: "hover" | "focus", at?: PointerPoint) => void;
  onLeave: () => void;
  showDivider: boolean;
  itemRef: (el: HTMLLIElement | null) => void;
}) {
  const [location] = useLocation();
  const active = isSectionActive(section, location);
  const landing = sectionLandingRoute(section) ?? section.to ?? "#";
  const badgeCount = section.badgeKey ? badgeCounts[section.badgeKey] ?? null : null;
  const hasPages = visibleChildren(section).length > 0;

  return (
    <>
      <li
        ref={itemRef}
        className={cn("relative", section.loopStage != null && "mx-rail-spine")}
        data-loop-stage={section.loopStage ?? undefined}
        onPointerEnter={(e) => { if (hovers(e)) onIntent(section.id, "hover", pointAt(e)); }}
        onPointerLeave={(e) => { if (hovers(e)) onLeave(); }}
      >
        <a
          href={landing}
          data-testid="rail-item"
          data-section-id={section.id}
          onFocus={() => onIntent(section.id, "focus")}
          onClick={(e) => navigate(landing, e)}
          aria-current={active ? "page" : undefined}
          aria-label={section.label}
          aria-controls={hasPages ? flyoutId : undefined}
          aria-expanded={hasPages ? open : undefined}
          title={`${section.label} · ${section.purpose}`}
          className={cn(
            "flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-[color,background-color,border-color,box-shadow,opacity,transform] relative overflow-hidden",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            active
              ? "bg-primary/20 text-interactive border border-primary/30"
              : open
                ? "bg-foreground/[0.07] text-foreground/90"
                : "text-foreground/55 hover:text-foreground/90 hover:bg-foreground/[0.07]",
            section.placeholder && "opacity-50"
          )}
        >
          {active && (
            <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-r-full" />
          )}
          <NavIcon name={section.icon} className="w-4 h-4" />
          {badgeCount != null && badgeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-micro-num font-bold text-foreground flex items-center justify-center leading-none">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </a>
      </li>

      {showDivider && (
        <li aria-hidden="true" className="flex items-center justify-center py-0.5">
          <span className="w-5 h-px bg-border/35 rounded-full" />
        </li>
      )}
    </>
  );
}

// ─── Rail flyout: the intent section's pages, beside its icon ────────────

function RailFlyout({
  section,
  badgeCounts,
  top,
  flyoutId,
  reduced,
  flyoutRef,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  top: number;
  flyoutId: string;
  reduced: boolean | null;
  flyoutRef: (el: HTMLDivElement | null) => void;
}) {
  const children = visibleChildren(section);
  return (
    <motion.div
      ref={flyoutRef}
      key={section.id}
      id={flyoutId}
      role="group"
      aria-label={`${section.label} pages`}
      data-testid="rail-flyout"
      data-section-id={section.id}
      className="absolute z-40 mx-nav-map rounded-lg py-1.5 pl-1 pr-1.5"
      style={{ left: COLLAPSED_WIDTH - 6, top, width: FLYOUT_WIDTH }}
      initial={reduced ? false : { opacity: 0, x: -8, filter: "blur(4px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -4, filter: "blur(2px)", transition: motionOr(reduced, { duration: DUR_FAST, ease: EASE }) }}
      transition={motionOr(reduced, { duration: DUR_MED, ease: EASE })}
    >
      <div className={cn(TYPE.microLabel, "px-3 pt-1 pb-1.5 text-muted-foreground/75 flex items-center gap-1.5")} title={section.purpose}>
        {section.loopStage != null && (
          <span aria-hidden="true" className="w-4 h-4 rounded-full border border-border/50 text-micro-num tabular-nums flex items-center justify-center normal-case">{section.loopStage}</span>
        )}
        <span className="truncate">{section.label}</span>
      </div>
      <ul className="mx-map-branch space-y-0.5">
        {children.map((child, i) => (
          <ChildRow
            key={child.id}
            child={child}
            count={child.badgeKey ? badgeCounts[child.badgeKey] ?? null : null}
            index={i}
            total={children.length}
            reduced={reduced}
          />
        ))}
      </ul>
    </motion.div>
  );
}

// ─── Expandable section (expanded mode) ────────────────────────────────
// The header is ONE control: a link to the section's command center. Its
// page list opens on intent (dwell or focus), never on a click — a click is
// the navigation. The chevron is a glyph that says "pages", not a button.

function ExpandableSection({
  section,
  badgeCounts,
  open,
  onIntent,
  reduced,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  open: boolean;
  onIntent: (sectionId: string, via: "hover" | "focus", at?: PointerPoint) => void;
  reduced: boolean | null;
}) {
  const [location] = useLocation();
  const sectionActive = isSectionActive(section, location);
  const landing = sectionLandingRoute(section) ?? "#";
  const landingActive = isChildActive(landing, location);
  const controlsId = useId();
  const children = visibleChildren(section);
  const sectionBadge = section.badgeKey ? badgeCounts[section.badgeKey] ?? null : null;

  return (
    <li
      data-loop-stage={section.loopStage ?? undefined}
      data-section-id={section.id}
      data-testid="nav-section"
      data-open={open || undefined}
      className={cn(section.loopStage != null && "mx-loop-spine")}
      onPointerEnter={(e) => { if (hovers(e)) onIntent(section.id, "hover", pointAt(e)); }}
    >
      <a
        href={landing}
        onClick={(e) => navigate(landing, e)}
        onFocus={() => onIntent(section.id, "focus")}
        aria-current={landingActive ? "page" : undefined}
        aria-expanded={open}
        aria-controls={controlsId}
        // What this module is for is its tooltip — the sidebar shows labels only.
        title={`${section.label} · ${section.purpose}`}
        className={cn(
          "pressable-lg relative flex items-center gap-2 pl-2.5 pr-2 h-9 rounded-lg text-body select-none",
          "transition-[color,background-color,border-color,box-shadow,opacity,transform]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          landingActive
            ? "mx-nav-active font-medium"
            : sectionActive
              ? "text-foreground bg-primary/[0.09] font-medium"
              : open
                ? "text-foreground bg-primary/[0.06]"
                : "text-foreground/70 font-normal hover:text-foreground hover:bg-primary/10",
          section.placeholder && "opacity-60",
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
        {/* The loop stage — the product's shape made visible on every row of it. */}
        {section.loopStage != null && (
          <span
            aria-hidden="true"
            data-testid="nav-loop-stage"
            className={cn(
              // Hollow, muted and never filled — a stage marker must not read as a
              // count badge (NavBadge is the filled pill beside it).
              "text-micro-num tabular-nums w-4 h-4 rounded-full border flex items-center justify-center shrink-0 bg-transparent",
              sectionActive ? "border-primary/40 text-muted-foreground" : "border-border/50 text-muted-foreground/75",
            )}
          >
            {section.loopStage}
          </span>
        )}
        {section.placeholder && (
          <span className="text-micro font-semibold uppercase text-muted-foreground/75 border border-border/40 px-1 py-0.5 rounded leading-none normal-case shrink-0">
            Soon
          </span>
        )}
        {section.badgeKey && !section.placeholder && (
          <NavBadge count={sectionBadge} badgeKey={section.badgeKey} />
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "w-3.5 h-3.5 shrink-0 transition-transform duration-200 text-muted-foreground/75",
            open && "rotate-180",
          )}
        />
      </a>

      {/* Animated child list — grid 0fr→1fr trick animates height:auto cleanly */}
      <div
        id={controlsId}
        aria-hidden={!open}
        // A closed list must be out of the tab order as well as out of
        // sight: inert takes its links out of Tab, aria-hidden alone
        // would not (the same fix AppShell's drawer needed).
        inert={!open}
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: reduced ? undefined : "grid-template-rows 220ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <ul
          aria-label={`${section.label} pages`}
          className="overflow-hidden mt-0.5 ml-3 pl-0 border-l border-border/20 space-y-0.5 pb-1"
        >
          {open && children.map((child, i) => (
            <ChildRow
              key={child.id}
              child={child}
              count={child.badgeKey ? badgeCounts[child.badgeKey] ?? null : null}
              index={i}
              total={children.length}
              reduced={reduced}
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
        title={`${section.label} · ${section.purpose}`}
        className={cn(
          "flex items-center gap-2 px-2.5 h-9 rounded-lg text-body transition-[color,background-color,border-color,box-shadow,opacity,transform]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
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
          <span className="text-micro font-semibold uppercase text-muted-foreground/75 border border-border/40 px-1 py-0.5 rounded leading-none normal-case shrink-0">
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
  const reduced = useReducedMotion();
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

  // ─── Disclosure state ────────────────────────────────────────────────
  // The open list is the section under intent (a dwell or focus), else the
  // section the reader is on. Nothing is remembered between visits: the
  // route is the memory.
  const activeSection = visibleTree.find((s) => isSectionActive(s, location));
  const [intentId, setIntentId] = useState<string | null>(null);
  const intentViaRef = useRef<"hover" | "focus" | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const railRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const flyoutId = useId();

  const clearTimers = useCallback(() => {
    if (dwellTimer.current) { clearTimeout(dwellTimer.current); dwellTimer.current = null; }
    if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  // A navigation ends the intent: the list follows the new route.
  useEffect(() => {
    clearTimers();
    setIntentId(null);
    intentViaRef.current = null;
  }, [location, clearTimers]);

  // Dwell, then follow: the first section waits OPEN_DWELL_MS (a pass-through
  // on the way to the page opens nothing); once a list is open by intent,
  // moving to another section moves the list at once. Focus opens at once.
  //
  // "Moving" means the pointer travelled. When a list opens, the list above
  // it collapses and the rows shift under a pointer that has not moved;
  // Chromium then dispatches a pointerenter for whichever row landed under
  // it, and without this guard that row opened too — hover Strategy under an
  // open Analysis and Exports opened instead. A follow needs real travel
  // since the last open.
  const openedAtRef = useRef<PointerPoint | null>(null);
  const handleIntent = useCallback((sectionId: string, via: "hover" | "focus", at?: PointerPoint) => {
    if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
    if (via === "focus") {
      if (dwellTimer.current) { clearTimeout(dwellTimer.current); dwellTimer.current = null; }
      intentViaRef.current = "focus";
      setIntentId(sectionId);
      return;
    }
    if (intentViaRef.current === "hover") {
      const from = openedAtRef.current;
      const travelled = !from || !at || Math.hypot(at.x - from.x, at.y - from.y) >= FOLLOW_MIN_TRAVEL_PX;
      if (!travelled) return;
      openedAtRef.current = at ?? null;
      setIntentId(sectionId);
      return;
    }
    if (dwellTimer.current) clearTimeout(dwellTimer.current);
    dwellTimer.current = setTimeout(() => {
      dwellTimer.current = null;
      intentViaRef.current = "hover";
      openedAtRef.current = at ?? null;
      setIntentId(sectionId);
    }, OPEN_DWELL_MS);
  }, []);

  // Leaving the sidebar: a pending dwell is cancelled; an intent-opened list
  // returns to the active section after the grace.
  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (!hovers(e)) return;
    if (dwellTimer.current) { clearTimeout(dwellTimer.current); dwellTimer.current = null; }
    if (intentViaRef.current !== "hover") return;
    if (graceTimer.current) clearTimeout(graceTimer.current);
    graceTimer.current = setTimeout(() => {
      graceTimer.current = null;
      intentViaRef.current = null;
      setIntentId(null);
    }, CLOSE_GRACE_MS);
  }, []);

  // In the rail, leaving an item (not the whole sidebar) also starts the
  // grace, so the flyout survives the diagonal move into it.
  const handleRailItemLeave = useCallback(() => {
    if (dwellTimer.current) { clearTimeout(dwellTimer.current); dwellTimer.current = null; }
  }, []);

  // Focus leaving the sidebar closes a focus-opened list.
  const handleBlur = useCallback((e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && asideRef.current?.contains(next)) return;
    if (intentViaRef.current === "focus") {
      intentViaRef.current = null;
      setIntentId(null);
    }
  }, []);

  // Escape returns the list to the section the reader is on.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || intentId == null) return;
    e.preventDefault();
    clearTimers();
    intentViaRef.current = null;
    setIntentId(null);
  }, [intentId, clearTimers]);

  const openSectionId = intentId ?? activeSection?.id ?? null;
  const flyoutSection = collapsed && intentId ? visibleTree.find((s) => s.id === intentId) ?? null : null;

  // The flyout sits at its icon's height, clamped so it never runs past the
  // bottom of the sidebar; measured after it renders (its height is its own).
  useLayoutEffect(() => {
    if (!flyoutSection) return;
    const li = railRefs.current[flyoutSection.id];
    const aside = asideRef.current;
    if (!li || !aside) return;
    const asideRect = aside.getBoundingClientRect();
    const itemTop = li.getBoundingClientRect().top - asideRect.top;
    const height = flyoutRef.current?.offsetHeight ?? 0;
    const maxTop = Math.max(0, asideRect.height - height - 8);
    setFlyoutTop(height > 0 ? Math.min(itemTop, maxTop) : itemTop);
  }, [flyoutSection]);

  return (
    <aside
      ref={asideRef}
      data-collapsed={collapsed}
      data-testid="workspace-sidebar"
      className={cn(
        "relative flex flex-col shrink-0 h-full mx-sidebar z-30",
        dragWidth == null && "transition-[width] duration-200 ease-out",
        dragWidth == null && (collapsed ? "w-[56px]" : "w-[216px]")
      )}
      style={dragWidth != null ? { width: dragWidth } : undefined}
      aria-label="Workspace sidebar"
      onPointerLeave={handlePointerLeave}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
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
              <span className="text-[16px] font-semibold tracking-tight text-foreground/90">metrix</span> {/* disclosure-ok: wordmark, sized to the 20px mark beside it, not a type role */}
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
        className={cn("flex-1 overflow-y-auto py-2", collapsed ? "px-1 overflow-x-visible" : "px-2")}
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
            {visibleTree.map((section, idx) => (
              <CollapsedItem
                key={section.id}
                section={section}
                badgeCounts={badgeCounts}
                open={intentId === section.id}
                flyoutId={flyoutId}
                onIntent={handleIntent}
                onLeave={handleRailItemLeave}
                showDivider={dividerAfter(section, visibleTree[idx + 1])}
                itemRef={(el) => { railRefs.current[section.id] = el; }}
              />
            ))}
          </ol>
        ) : (
          <ol className="space-y-0.5 list-none p-0 m-0">
            {visibleTree.map((section, idx) => [
              // Group label where the product's shape changes: Account ·
              // IAP loop · Outputs · Workspace. Presentation, not a control.
              (idx === 0 || visibleTree[idx - 1]!.group !== section.group) ? (
                <li key={`group-${section.group}`} role="presentation" className={cn("px-2.5 pb-1", idx === 0 ? "pt-1" : "pt-3")} data-testid="nav-group-label">
                  <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{NAV_GROUP_LABEL[section.group as NavGroup]}</span>
                </li>
              ) : null,
              section.children?.length ? (
                <ExpandableSection
                  key={section.id}
                  section={section}
                  badgeCounts={badgeCounts}
                  open={openSectionId === section.id}
                  onIntent={handleIntent}
                  reduced={reduced}
                />
              ) : (
                <LeafSection
                  key={section.id}
                  section={section}
                  badgeCounts={badgeCounts}
                />
              ),
            ])}
          </ol>
        )}
      </nav>

      {/* The rail's page flyout — beside the rail, outside the scrolling nav. */}
      <AnimatePresence initial={false}>
        {flyoutSection && visibleChildren(flyoutSection).length > 0 && (
          <RailFlyout
            key={flyoutSection.id}
            section={flyoutSection}
            badgeCounts={badgeCounts}
            top={flyoutTop}
            flyoutId={flyoutId}
            reduced={reduced}
            flyoutRef={(el) => { if (el) flyoutRef.current = el; }}
          />
        )}
      </AnimatePresence>

      {/* Slide-to-collapse handle — drag left to shrink toward the rail
          (never past EXPANDED_WIDTH going the other way); click to toggle.
          This is the WAI-ARIA window-splitter pattern: a focusable separator
          that carries the value it is separating on (aria-valuenow/min/max)
          and moves on the arrow keys. Home and End jump to the two committed
          states; Enter and Space toggle, matching a plain click. */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Sidebar width"
        aria-valuemin={COLLAPSED_WIDTH}
        aria-valuemax={EXPANDED_WIDTH}
        aria-valuenow={dragWidth ?? (collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH)}
        aria-valuetext={collapsed ? "Collapsed" : "Expanded"}
        title={collapsed ? "Click to expand" : "Drag to collapse"}
        onPointerDown={onHandlePointerDown}
        onKeyDown={(e) => {
          const KEY_STEP = 24;
          const current = dragWidth ?? (collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH);
          const commit = (w: number) => {
            const shouldCollapse = w < COLLAPSE_SNAP_WIDTH;
            setDragWidth(null);
            if (shouldCollapse !== collapsed) {
              setCollapsed(shouldCollapse);
              saveCollapsed(shouldCollapse);
            }
          };
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const next = Math.min(
              EXPANDED_WIDTH,
              Math.max(COLLAPSED_WIDTH, current + (e.key === "ArrowRight" ? KEY_STEP : -KEY_STEP)),
            );
            // Live width while stepping, so the rail tracks the keys the way
            // it tracks a pointer; committed on release of the extremes.
            setDragWidth(next);
            if (next === EXPANDED_WIDTH || next === COLLAPSED_WIDTH) commit(next);
          } else if (e.key === "Home") {
            e.preventDefault();
            commit(COLLAPSED_WIDTH);
          } else if (e.key === "End") {
            e.preventDefault();
            commit(EXPANDED_WIDTH);
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDragWidth(null);
            toggleCollapse();
          }
        }}
        className={cn(
          "absolute top-0 right-0 h-full w-1.5 -mr-0.5 z-10 cursor-col-resize group/handle",
          "flex items-center justify-center",
          "focus-visible:outline-none focus-visible:bg-primary/40",
        )}
      >
        <span className="w-px h-full bg-transparent group-hover/handle:bg-primary/40 transition-colors" />
      </div>

      {/* Footer — signed-in user */}
      <div className={cn(
        "border-t border-border/40 shrink-0",
        collapsed ? "py-3 flex flex-col items-center gap-2" : "px-3 py-3 space-y-2"
      )}>
        {user && (
          <div
            className={cn("flex items-center gap-2 min-w-0", collapsed && "justify-center")}
            data-testid="sidebar-user-footer"
            title={`${user.email} · ${user.role === "admin" ? "Agency (internal)" : "Member"}`}
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
