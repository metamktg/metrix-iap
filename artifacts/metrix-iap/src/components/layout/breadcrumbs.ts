import { navTree } from "@/navigation/navTree";

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
    // Section landing page — Overview acts as the section's primary parent
    // route, not a nested subtab. When on the landing, the section label IS
    // the leaf crumb (no separate "Overview" child crumb beneath it).
    if (section.landing && (location === section.landing || location.startsWith(section.landing + "/"))) {
      crumbs.push({ label: section.label, to: section.landing });
      return crumbs;
    }
    for (const child of section.children ?? []) {
      if (location === child.to || location.startsWith(child.to + "/")) {
        crumbs.push({ label: section.label, to: section.children![0]!.to });
        crumbs.push({ label: child.label, to: child.to });
        return crumbs;
      }
    }
  }

  return crumbs;
}
