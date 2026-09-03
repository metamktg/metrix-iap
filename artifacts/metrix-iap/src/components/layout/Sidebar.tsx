import { useLocation } from "wouter";
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@workspace/command-deck/lib/utils";
import {
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
import { useIsCompactShell } from "@/lib/useMediaQuery";
import { DUR_FAST, DUR_MED, EASE, motionOr, staggerDelay } from "@/lib/motion";
import { AccountSwitcher } from "./AccountSwitcher";
import type { NavSection, NavChild, NavIconName, NavGroup } from "@/navigation/navTree";

// ─── The sidebar is a rail and a map ───────────────────────────────────
//
// The rail is the only thing in the layout: 56px of icons, always there,
// never collapsing or expanding, so the page keeps its width and the
// reader keeps their place. The MAP is what the rail becomes when the
// reader dwells on it: it opens rightwards OVER the page (never pushing
// it) and draws the product as a flow chart — the six loop stages as
// numbered nodes on one spine, the outputs and the workspace beneath, and
// the pages of whichever node the pointer rests on branching out to the
// right of it. Move to another node and the branch moves with you.
//
// There is no expand/collapse control and no width handle: a toggle you
// have to find is a mode, and a mode is a thing to forget. Three ways in,
// each doing one thing:
//   · a pointer that rests on the rail for OPEN_DWELL_MS opens the map
//     (a pass-through on the way to the page does not);
//   · keyboard focus on a rail item opens it at once, Escape closes it and
//     hands focus back to the rail;
//   · on a touch screen (no hover) a tap on a rail icon opens the map on
//     that section, a second tap on the same icon goes to its command
//     center, a tap outside closes it. Inside the compact-shell drawer the
//     map is simply always open — the drawer is the disclosure.
//
// Mechanics taken from the Watermelon references (docs/resources/watermelon):
// tooltip-navbar's dwell-then-follow (one delay to open, none to move
// between items once open) and layered-progressive-disclosure's arrival —
// opacity + blur(4px) + an 8px travel, never a 50px one, on a surface the
// reader is already reading. Nothing is a mode; nothing is remembered.

export const RAIL_WIDTH = 56;
const MAP_WIDTH = 332;
/** How long a pointer rests on the rail before the map opens. */
export const OPEN_DWELL_MS = 260;
/** How long the map stays after the pointer leaves it, so a diagonal move to a branch does not close it. */
export const CLOSE_GRACE_MS = 220;

// Column geometry inside the map: the node column and where the branch starts.
const NODE_COL_WIDTH = 156;
const BRANCH_LEFT = NODE_COL_WIDTH + 14;

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

/** A pointer that cannot hover — the map opens by tap instead of dwell. */
function useIsTouch(): boolean {
  const [touch, setTouch] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: none)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: none)");
    const onChange = () => setTouch(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return touch;
}

/** The rail's dividers mark the product's shape: after the account, after the loop, after the outputs. */
function dividerAfter(section: NavSection, next: NavSection | undefined): boolean {
  return next != null && next.group !== section.group;
}

// ─── Rail item ─────────────────────────────────────────────────────────
// One icon per section. It is a link to the section's command center; the
// map is what dwelling, focusing or (on touch) tapping it opens.

function RailItem({
  section,
  badgeCounts,
  focused,
  onIntent,
  onActivate,
  showDivider,
  itemRef,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  focused: boolean;
  onIntent: (sectionId: string, via: "hover" | "focus") => void;
  /** Returns true when the click was consumed (the map opened instead of navigating). */
  onActivate: (section: NavSection) => boolean;
  showDivider: boolean;
  itemRef: (el: HTMLAnchorElement | null) => void;
}) {
  const [location] = useLocation();
  const active = isSectionActive(section, location);
  const landing = sectionLandingRoute(section) ?? section.to ?? "#";
  const badgeCount = section.badgeKey ? badgeCounts[section.badgeKey] ?? null : null;

  return (
    <>
      <li
        className={cn("relative", section.loopStage != null && "mx-rail-spine")}
        data-loop-stage={section.loopStage ?? undefined}
      >
        <a
          ref={itemRef}
          href={landing}
          data-testid="rail-item"
          data-section-id={section.id}
          onPointerEnter={(e) => { if (e.pointerType !== "touch") onIntent(section.id, "hover"); }}
          onFocus={() => onIntent(section.id, "focus")}
          onClick={(e) => {
            if (onActivate(section)) { e.preventDefault(); return; }
            navigate(landing, e);
          }}
          aria-current={active ? "page" : undefined}
          aria-label={section.label}
          title={`${section.label} · ${section.purpose}`}
          className={cn(
            "relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg overflow-hidden",
            "transition-[color,background-color,border-color,box-shadow,opacity,transform]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            active
              ? "bg-primary/20 text-interactive border border-primary/30"
              : focused
                ? "bg-foreground/[0.07] text-foreground/90"
                : "text-foreground/55 hover:text-foreground/90 hover:bg-foreground/[0.07]",
            section.placeholder && "opacity-50",
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

// ─── Map node ──────────────────────────────────────────────────────────
// A section as a node in the flow chart: its stage numeral (or icon) on
// the spine, its label, its badge. Resting the pointer on it moves the
// branch; clicking it goes to the command center.

function MapNode({
  section,
  badgeCounts,
  focused,
  onIntent,
  nodeRef,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  focused: boolean;
  onIntent: (sectionId: string) => void;
  nodeRef: (el: HTMLLIElement | null) => void;
}) {
  const [location] = useLocation();
  const sectionActive = isSectionActive(section, location);
  const landing = sectionLandingRoute(section) ?? section.to ?? "#";
  const landingActive = isChildActive(landing, location);
  const sectionBadge = section.badgeKey ? badgeCounts[section.badgeKey] ?? null : null;

  return (
    <li
      ref={nodeRef}
      data-loop-stage={section.loopStage ?? undefined}
      data-testid="map-node"
      data-section-id={section.id}
      data-focused={focused || undefined}
      className={cn("relative", section.loopStage != null && "mx-map-spine")}
    >
      <a
        href={landing}
        onPointerEnter={(e) => { if (e.pointerType !== "touch") onIntent(section.id); }}
        onFocus={() => onIntent(section.id)}
        onClick={(e) => navigate(landing, e)}
        aria-current={landingActive ? "page" : sectionActive ? "true" : undefined}
        title={`Open ${section.label}`}
        className={cn(
          "pressable-lg relative flex items-center gap-2 pl-2 pr-2 h-9 rounded-lg text-caption select-none",
          "transition-[color,background-color,border-color,box-shadow,opacity,transform]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          landingActive
            ? "mx-nav-active font-medium"
            : focused
              ? "text-foreground bg-primary/[0.09] font-medium"
              : sectionActive
                ? "text-foreground font-medium"
                : "text-foreground/70 font-normal hover:text-foreground hover:bg-primary/10",
          section.placeholder && "opacity-60",
        )}
      >
        {/* The node itself: the loop stage as a numeral on the spine, the
            icon for everything outside the loop. */}
        <span
          aria-hidden="true"
          data-testid={section.loopStage != null ? "nav-loop-stage" : undefined}
          title={section.loopStage != null ? `Stage ${section.loopStage} of 6 in the IAP loop` : undefined}
          className={cn(
            "relative z-[1] w-5 h-5 rounded-full border flex items-center justify-center shrink-0 text-micro-num tabular-nums",
            landingActive || focused
              ? "border-primary/60 bg-primary/15 text-interactive"
              : sectionActive
                ? "border-primary/40 bg-sidebar text-muted-foreground"
                : "border-border/50 bg-sidebar text-muted-foreground/75",
          )}
        >
          {section.loopStage != null ? section.loopStage : <NavIcon name={section.icon} className="w-3 h-3" />}
        </span>
        <span className="flex-1 min-w-0 truncate">{section.label}</span>
        {section.placeholder && (
          <span className="text-micro font-semibold uppercase text-muted-foreground/75 border border-border/40 px-1 py-0.5 rounded leading-none normal-case shrink-0">
            Soon
          </span>
        )}
        {section.badgeKey && !section.placeholder && (
          <NavBadge count={sectionBadge} badgeKey={section.badgeKey} />
        )}
        {/* The connector stub from the node to its branch, drawn only on the focused node. */}
        {focused && (
          <span
            aria-hidden="true"
            data-testid="map-connector"
            className="absolute top-1/2 -right-[14px] w-[14px] h-px bg-primary/50"
          />
        )}
      </a>
    </li>
  );
}

// ─── Branch: the focused section's pages ───────────────────────────────

function BranchRow({
  child,
  count,
  index,
  total,
  reduced,
}: {
  child: NavChild;
  count: number | null;
  index: number;
  total: number;
  reduced: boolean | null;
}) {
  const [location] = useLocation();
  const active = isChildActive(child.to, location);

  return (
    <motion.li
      className="relative mx-map-branch-row"
      initial={reduced ? false : { opacity: 0, x: -8, filter: "blur(4px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={motionOr(reduced, { duration: DUR_MED, ease: EASE, delay: staggerDelay(index, total) })}
    >
      <a
        href={child.to}
        onClick={(e) => navigate(child.to, e)}
        aria-current={active ? "page" : undefined}
        title={child.purpose ? `${child.label} — ${child.purpose}` : undefined}
        className={cn(
          "flex items-center gap-1.5 pl-3 pr-2 min-h-8 py-1 rounded-md text-caption",
          "transition-[color,background-color,border-color,box-shadow,opacity,transform]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          active
            ? "font-semibold text-foreground bg-primary/10"
            : "text-foreground/70 hover:text-foreground hover:bg-primary/10",
        )}
      >
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block truncate">{child.label}</span>
          {/* The active page says what it proves — one fragment, only on the
              row the reader is on, so the list stays a list. */}
          {active && child.purpose && (
            <span className={cn(TYPE.microLabel, "block normal-case tracking-normal font-normal text-muted-foreground/75 truncate mt-0.5")} data-testid="nav-child-purpose">
              {child.purpose}
            </span>
          )}
        </span>
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

function Branch({
  section,
  badgeCounts,
  top,
  reduced,
  branchRef,
}: {
  section: NavSection;
  badgeCounts: Record<string, number | null>;
  top: number;
  reduced: boolean | null;
  branchRef: (el: HTMLDivElement | null) => void;
}) {
  const children = visibleChildren(section);
  const headingId = useId();
  return (
    <motion.div
      ref={branchRef}
      key={section.id}
      data-testid="map-branch"
      data-section-id={section.id}
      role="group"
      aria-labelledby={headingId}
      className="absolute pr-2"
      style={{ left: BRANCH_LEFT, right: 0, top }}
      initial={reduced ? false : { opacity: 0, x: -8, filter: "blur(4px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -4, filter: "blur(2px)", transition: motionOr(reduced, { duration: DUR_FAST, ease: EASE }) }}
      transition={motionOr(reduced, { duration: DUR_MED, ease: EASE })}
    >
      {/* What this module is for — the category it defines. The branch's own
          heading, so the node row stays one line. */}
      <div id={headingId} className="pl-3 pr-2 pb-1 min-h-9 flex flex-col justify-center" data-testid="nav-section-purpose">
        <span className={cn(TYPE.microLabel, "text-interactive/80")}>
          {section.loopStage != null ? `Stage ${section.loopStage} · ${section.label}` : section.label}
        </span>
        <span className={cn(TYPE.microLabel, "normal-case tracking-normal font-normal text-muted-foreground/75 leading-snug")}>
          {section.purpose}
        </span>
      </div>
      <ul aria-label={`${section.label} pages`} className="mx-map-branch space-y-0.5 pb-1">
        {children.map((child, i) => (
          <BranchRow
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

// ─── Sidebar ───────────────────────────────────────────────────────────

export function Sidebar() {
  const [location] = useLocation();
  const badgeCounts = useNavBadges();
  const { user } = useAuth();
  const reduced = useReducedMotion();
  const isTouch = useIsTouch();
  const compact = useIsCompactShell();

  const isAdmin = user?.role === "admin";
  const visibleTree = isAdmin
    ? navTree
    : navTree.map((section) =>
        section.children?.length
          ? { ...section, children: section.children.filter((c) => c.id !== "settings-users") }
          : section
      );

  const activeSection = visibleTree.find((s) => isSectionActive(s, location));

  // ─── Map state ─────────────────────────────────────────────────────
  // `open` is the map; `focusId` is the node whose branch is drawn. Inside
  // the compact-shell drawer the map is always open: the drawer is the
  // disclosure, and a rail alone in a drawer would be a menu of hieroglyphs.
  const [openState, setOpen] = useState(false);
  const open = compact || openState;
  const [focusId, setFocusId] = useState<string>(activeSection?.id ?? visibleTree[0]!.id);
  const openedByRef = useRef<"hover" | "focus" | "tap" | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const railRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const nodeRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const mapNavRef = useRef<HTMLElement>(null);
  const branchRef = useRef<HTMLDivElement | null>(null);
  const [branchTop, setBranchTop] = useState(0);

  const clearTimers = useCallback(() => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  const openMap = useCallback((via: "hover" | "focus" | "tap") => {
    clearTimers();
    openedByRef.current = via;
    setOpen(true);
  }, [clearTimers]);

  const closeMap = useCallback(() => {
    clearTimers();
    openedByRef.current = null;
    setOpen(false);
  }, [clearTimers]);

  // When the route changes, the branch follows the page the reader is on.
  useEffect(() => {
    const nowActive = visibleTree.find((s) => isSectionActive(s, location));
    if (nowActive) setFocusId(nowActive.id);
    // A navigation from inside the map is the reader leaving it.
    if (openedByRef.current === "tap" || openedByRef.current === "focus") closeMap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // A rail item under a mouse pointer: arm the dwell if the map is closed,
  // or move the branch at once if it is open (tooltip-navbar's rule — one
  // delay to open, none to travel).
  const handleRailIntent = useCallback((sectionId: string, via: "hover" | "focus") => {
    setFocusId(sectionId);
    if (via === "focus") { openMap("focus"); return; }
    if (openState) return;
    if (openTimer.current) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      openMap("hover");
    }, OPEN_DWELL_MS);
  }, [openMap, openState]);

  // Rail click. Touch, or a click that lands before the dwell has opened
  // the map on this section: open the map here instead of navigating. A
  // leaf section (no pages) always navigates.
  const handleRailActivate = useCallback((section: NavSection): boolean => {
    const hasPages = visibleChildren(section).length > 0;
    if (!hasPages) return false;
    if (isTouch && !(open && focusId === section.id)) {
      setFocusId(section.id);
      openMap("tap");
      return true;
    }
    return false;
  }, [isTouch, open, focusId, openMap]);

  // Pointer leaves the whole sidebar (rail + map): close after the grace.
  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (!openState || openedByRef.current !== "hover") return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
      openedByRef.current = null;
    }, CLOSE_GRACE_MS);
  }, [openState]);

  const handlePointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  // Focus leaves the sidebar: close a map that focus opened.
  const handleBlur = useCallback((e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && asideRef.current?.contains(next)) return;
    if (openedByRef.current === "focus") closeMap();
  }, [closeMap]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !openState) return;
    e.preventDefault();
    closeMap();
    railRefs.current[focusId]?.focus();
  }, [openState, closeMap, focusId]);

  // A tap outside closes a map a tap opened.
  useEffect(() => {
    if (!openState) return;
    const onDown = (e: PointerEvent) => {
      if (asideRef.current?.contains(e.target as Node)) return;
      closeMap();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [openState, closeMap]);

  // The branch sits beside its node. Measured, then clamped so it never
  // runs past the bottom of the map — a branch on the last node climbs up
  // beside the nodes above it instead of falling off the panel.
  useLayoutEffect(() => {
    if (!open) return;
    const node = nodeRefs.current[focusId];
    const nav = mapNavRef.current;
    if (!node || !nav) return;
    const nodeTop = node.offsetTop;
    const branchHeight = branchRef.current?.offsetHeight ?? 0;
    const available = nav.clientHeight;
    const maxTop = Math.max(0, available - branchHeight - 8);
    setBranchTop(branchHeight > 0 ? Math.min(nodeTop, maxTop) : nodeTop);
  }, [open, focusId, visibleTree.length]);

  const focusedSection = visibleTree.find((s) => s.id === focusId) ?? activeSection ?? visibleTree[0]!;
  const mapId = useId();

  return (
    <aside
      ref={asideRef}
      data-testid="workspace-sidebar"
      data-map-open={open || undefined}
      className={cn("relative flex shrink-0 h-full mx-sidebar z-30", compact && "shadow-none")}
      style={{ width: RAIL_WIDTH }}
      aria-label="Workspace sidebar"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {/* ── The rail ── */}
      <div className="flex flex-col h-full w-full">
        <div className="border-b border-border/40 shrink-0 px-0 pt-3 pb-2.5 flex flex-col items-center gap-2">
          <img
            src={`${import.meta.env.BASE_URL}metrix-logo.png`}
            alt="Metrix"
            className="w-6 h-6 object-contain mx-logo-glow"
          />
        </div>

        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-1"
          aria-label="Main workspace navigation"
          aria-controls={open ? mapId : undefined}
        >
          <ol className="space-y-1 list-none p-0 m-0">
            <li className="pb-0.5">
              <AccountSwitcher compact />
            </li>
            <li aria-hidden="true" className="flex items-center justify-center py-0.5">
              <span className="w-5 h-px bg-border/35 rounded-full" />
            </li>
            {visibleTree.map((section, idx) => (
              <RailItem
                key={section.id}
                section={section}
                badgeCounts={badgeCounts}
                focused={open && focusId === section.id}
                onIntent={handleRailIntent}
                onActivate={handleRailActivate}
                showDivider={dividerAfter(section, visibleTree[idx + 1])}
                itemRef={(el) => { railRefs.current[section.id] = el; }}
              />
            ))}
          </ol>
        </nav>

        <div className="border-t border-border/40 shrink-0 py-3 flex flex-col items-center gap-2">
          {user && (
            <div
              className="flex items-center justify-center"
              data-testid="sidebar-user-footer"
              title={`${user.email} · ${user.role === "admin" ? "Agency (internal)" : "Member"}`}
            >
              <span
                aria-hidden="true"
                className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 bg-primary/15 border border-primary/25 text-interactive text-label font-bold leading-none"
              >
                {user.email.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── The map ── */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="map"
            id={mapId}
            data-testid="nav-map"
            className="absolute top-0 left-full h-full z-40 mx-nav-map flex flex-col"
            style={{ width: MAP_WIDTH }}
            initial={reduced ? false : { opacity: 0, x: -8, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: -6, filter: "blur(3px)", transition: motionOr(reduced, { duration: DUR_FAST, ease: EASE }) }}
            transition={motionOr(reduced, { duration: DUR_MED, ease: EASE })}
          >
            <div className="border-b border-border/40 shrink-0 px-4 pt-3.5 pb-3">
              <div className="flex items-center gap-2">
                <img
                  src={`${import.meta.env.BASE_URL}metrix-logo.png`}
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain shrink-0 mx-logo-glow"
                />
                <span className="text-[16px] font-semibold tracking-tight text-foreground/90">metrix</span> {/* disclosure-ok: wordmark, sized to the 20px mark beside it, not a type role */}
                <span className={cn(TYPE.microLabel, "ml-auto text-muted-foreground/75")}>Workspace map</span>
              </div>
              <div className="mt-2.5 border-t border-border/30 pt-2.5">
                <AccountSwitcher />
              </div>
            </div>

            <nav
              ref={mapNavRef}
              className="relative flex-1 overflow-y-auto overflow-x-hidden py-2 pl-2"
              aria-label="Workspace map"
            >
              <ol className="list-none p-0 m-0 space-y-0.5" style={{ width: NODE_COL_WIDTH }}>
                {visibleTree.map((section, idx) => [
                  // Group label where the product's shape changes: Account ·
                  // IAP loop · Outputs · Workspace. Presentation, not a control.
                  (idx === 0 || visibleTree[idx - 1]!.group !== section.group) ? (
                    <li key={`group-${section.group}`} role="presentation" className={cn("px-2 pb-1", idx === 0 ? "pt-1" : "pt-3")} data-testid="nav-group-label">
                      <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{NAV_GROUP_LABEL[section.group as NavGroup]}</span>
                    </li>
                  ) : null,
                  <MapNode
                    key={section.id}
                    section={section}
                    badgeCounts={badgeCounts}
                    focused={focusId === section.id}
                    onIntent={(id) => setFocusId(id)}
                    nodeRef={(el) => { nodeRefs.current[section.id] = el; }}
                  />,
                ])}
              </ol>

              <AnimatePresence initial={false}>
                <Branch
                  key={focusedSection.id}
                  section={focusedSection}
                  badgeCounts={badgeCounts}
                  top={branchTop}
                  reduced={reduced}
                  branchRef={(el) => { if (el) branchRef.current = el; }}
                />
              </AnimatePresence>
            </nav>

            {user && (
              <div className="border-t border-border/40 shrink-0 px-4 py-3 flex items-center gap-2 min-w-0" title={user.email}>
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 bg-primary/15 border border-primary/25 text-interactive text-label font-bold leading-none"
                >
                  {user.email.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-caption font-medium text-foreground/85 truncate leading-tight">{user.email}</p>
                  <p className="text-label text-muted-foreground/75 leading-tight">
                    {user.role === "admin" ? "Agency (internal)" : "Member"}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
