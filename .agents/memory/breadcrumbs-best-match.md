---
name: Breadcrumbs best-match child routing
description: navTree section landing paths share a prefix with child routes; use longest-path match in buildBreadcrumbs to avoid shadowing sibling routes.
---

## Rule

In `buildBreadcrumbs`, always pick the **most specific (longest-path) child** that matches the current location before falling back to the section landing. Never run the landing `startsWith` check before iterating children.

## Why

Several navTree sections have `landing: "/app/briefs"` where the landing URL equals the first child's `to` (e.g. `"/app/briefs"` for the Overview child). Using `location.startsWith(section.landing + "/")` as a pre-children check causes all deeper siblings (e.g. `/app/briefs/builder`) to match the landing early-exit and return only `[lead, section]` — dropping the child label entirely (45 breadcrumb test failures).

## How to apply

```typescript
// Find the most specific child match first
let bestChild: NavChild | null = null;
for (const child of section.children ?? []) {
  if (location === child.to || location.startsWith(child.to + "/")) {
    if (!bestChild || child.to.length > bestChild.to.length) bestChild = child;
  }
}
if (bestChild) { /* push section + child crumbs */ return crumbs; }
// Fallback: unknown sub-paths collapse to section label
if (section.landing && (location === section.landing || location.startsWith(section.landing + "/"))) {
  /* push section crumb only */ return crumbs;
}
```

The fallback (with startsWith) is still needed for unknown sub-paths like `/app/analysis/sub-detail` that don't match any explicit child route — the test "also collapses to section label" covers this case.
