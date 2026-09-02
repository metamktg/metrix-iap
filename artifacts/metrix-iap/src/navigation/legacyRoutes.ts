// ─── Legacy route table ────────────────────────────────────────────────
//
// One table, three consumers: App.tsx generates a <Redirect> per row, the
// route tests assert each row lands where it says, and
// inpage-nav-targets.test.tsx fails any in-app link that still points at a
// LEGACY path.
//
// Why the last one matters: a replacing <Redirect> drops the query
// string. Every loop link that carried `?from=strategy&fromCell=…` through
// `/app/briefs/builder` arrived at the Brief Builder with no origin, so the
// "← Back to Strategy" crumb it exists for never rendered. The redirect
// made the link *resolve*, which is what the old test checked, while
// silently discarding the context that made it useful. A legacy path is
// for bookmarks and old emails, never for code we write today.

export const LEGACY_REDIRECTS: ReadonlyArray<readonly [from: string, to: string]> = [
  ["/app/analysis/concept-map", "/app/mst/cross-map"],
  ["/app/mst/concept-map", "/app/mst/cross-map"],
  ["/app/mst/crossmap", "/app/mst/cross-map"],
  ["/app/mst/matrix", "/app/mst/sprints"],
  ["/app/strategy/brief-builder", "/app/creative/builder"],
  ["/app/briefs/builder", "/app/creative/builder"],
  ["/app/briefs/history", "/app/creative"],
  ["/app/briefs", "/app/creative"],
  ["/app/report-builder", "/app/reports/builder"],
  ["/app/reports/new", "/app/reports/builder"],
  ["/app/reports/settings", "/app/reports/configuration"],
  ["/app/reports/exports", "/app/exports/reports"],
  ["/app/agent", "/app/action/agent"],
  ["/app/action", "/app/act/queue"],
  ["/app/analyze", "/app/analyze/findings"],
  ["/app/settings", "/app/settings/general"],
  ["/app/settings/account", "/app/settings/general"],
  ["/app/settings/team", "/app/settings/users"],
  ["/app/settings/notifications", "/app/settings/general"],
];
