import { navTree, type NavChild } from "@/navigation/navTree";

export type BreadcrumbEntry = { label: string; to?: string };

export function buildBreadcrumbs(location: string, leadLabel: string, isManager: boolean): BreadcrumbEntry[] {
  const crumbs: BreadcrumbEntry[] = [{ label: leadLabel, to: "/" }];

  if (location === "/" || location === "") {
    crumbs.push({ label: isManager ? "Agency Overview" : "Account Overview" });
    return crumbs;
  }

  for (const section of navTree) {
    const matchesExtra = (section.matchPaths ?? []).some(
      (p) => location === p || location.startsWith(p + "/")
    );
    if (matchesExtra) {
      crumbs.push({ label: isManager ? "Agency Overview" : "Account Overview" });
      return crumbs;
    }
    if (!section.children?.length && section.to) {
      if (location === section.to || location.startsWith(section.to + "/")) {
        crumbs.push({ label: section.label, to: section.to });
        return crumbs;
      }
    }
    // Find the most specific (longest-path) child that matches the location.
    // This prevents a short-path child like "/app/briefs" from shadowing
    // deeper siblings like "/app/briefs/builder" via the startsWith check.
    let bestChild: NavChild | null = null;
    for (const child of section.children ?? []) {
      if (location === child.to || location.startsWith(child.to + "/")) {
        if (!bestChild || child.to.length > bestChild.to.length) {
          bestChild = child;
        }
      }
    }
    if (bestChild) {
      crumbs.push({ label: section.label, to: section.children![0]!.to });
      crumbs.push({ label: bestChild.label, to: bestChild.to });
      return crumbs;
    }
    // Fallback: unknown sub-paths under a section hub collapse to the section label.
    if (section.landing && (location === section.landing || location.startsWith(section.landing + "/"))) {
      crumbs.push({ label: section.label, to: section.landing });
      return crumbs;
    }
  }

  return crumbs;
}
