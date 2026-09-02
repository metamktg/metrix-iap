import { resolveNavLocation, sectionLandingRoute } from "@/navigation/navTree";

export type BreadcrumbEntry = { label: string; to?: string };

function overviewLabel(isManager: boolean): string {
  return isManager ? "Agency Overview" : "Account Overview";
}

/**
 * The trail for a location: [section, page]. The section crumb links to
 * the section's command center (its landing route), which is the page the
 * sidebar header also opens — one parent, wherever a reader clicks it. It
 * used to link to the section's FIRST CHILD instead, so "Analysis" in the
 * trail and "Analysis" in the sidebar went to two different pages.
 */
export function buildBreadcrumbs(location: string, isManager: boolean): BreadcrumbEntry[] {
  if (location === "/" || location === "") {
    return [{ label: overviewLabel(isManager) }];
  }
  const match = resolveNavLocation(location);
  if (!match) return [];
  const { section, child, atLanding } = match;
  if (section.matchPaths?.length && atLanding && !child) {
    return [{ label: overviewLabel(isManager) }];
  }
  const landing = sectionLandingRoute(section) ?? section.to;
  const sectionCrumb: BreadcrumbEntry = { label: section.label, to: landing ?? undefined };
  if (!child || atLanding) return [sectionCrumb];
  return [sectionCrumb, { label: child.label, to: child.to }];
}

/**
 * The label a reader would recognise for a location — the page name, or the
 * section name on a command center. Used by the Back control and the
 * command palette's recent-pages list.
 */
export function pageLabel(location: string, isManager: boolean): string | null {
  const crumbs = buildBreadcrumbs(location, isManager);
  return crumbs.at(-1)?.label ?? null;
}
