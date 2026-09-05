// Declarative allowlist for check:* / smoke:* scripts in scripts/package.json
// that are intentionally NOT run by any configured workflow (.replit) and not
// run indirectly via the IAP smoke orchestrator. Every entry must carry a
// reason so omissions stay deliberate — the guard test
// workflow-check-coverage.test.ts fails when a check:*/smoke:* script is
// neither wired into a workflow nor listed here.

export const MANUAL_ONLY_CHECK_SCRIPTS: Record<string, string> = {
  "check:metrix-settings-api":
    "requires a live API server (mutates invite/notification rows); run manually " +
    "with the API Server workflow up — not suitable for an unattended validation workflow",
  "check:db-credentials":
    "operator preflight for a Supabase password rotation: needs a LIVE database " +
    "credential (SUPABASE_DB_PASSWORD / SUPABASE_DB_URL), which CI deliberately does " +
    "not carry. Run it by hand in the Replit shell straight after rotating — see " +
    "docs/resources/METRIX_DB_Password_Rotation_Runbook.md. Wiring it into an " +
    "unattended workflow would either fail on every run or require putting the " +
    "database password where the rest of CI can reach it.",
  "check:ad-performance-views":
    "read-only verification that the ad_performance aggregate views landed with " +
    "security_invoker on and anon/authenticated denied. Same constraint as " +
    "check:db-credentials: it needs a LIVE database credential, which CI " +
    "deliberately does not carry, and Claude Code cloud environments are not a " +
    "secrets store either. Run it by hand in the Replit shell, where " +
    "SUPABASE_DB_PASSWORD already lives. It exits 2 (not 0) when no credential " +
    "resolves, precisely so an unattended runner cannot mistake 'nothing was " +
    "checked' for 'the views are fine'.",
  "check:reconciliation-ledger":
    "read-only cross-check that a completed manual analysis run's reconciliation " +
    "ledger is internally consistent (per-ad rows sum to the account row, coverage " +
    "matches observed/truth, no residual was inserted into a fact row, run-scoped " +
    "tables belong to the run they name). Same constraint as check:db-credentials " +
    "and check:ad-performance-views: it needs a LIVE database credential, which CI " +
    "deliberately does not carry, and Claude Code cloud environments are not a " +
    "secrets store either. Run it by hand in the Replit shell after a real run — " +
    "docs/specs/iap-multi-report-reconciliation.md §17a names it as the third " +
    "leg of the triple validation. Exits 2 (not 0) when no credential resolves.",
  "check:seed-evidence":
    "reads /api/metrix/seed as the demo account and fails when an account whose " +
    "latest run wrote a reconciliation summary carries 0 ledger rows or 0 ad-grain " +
    "breakdown rows: the evidence layer was read and lost on the way. Needs a " +
    "RUNNING API server and the demo credentials, the same constraint as " +
    "check:seed-fixture-drift, and is pointed at production (API_BASE_URL) after " +
    "a publish, where CI has no server. Exists because the request logs cannot " +
    "see this class of loss: on 2026-09-05 production read every ledger page for " +
    "the Pure Path run with 0 errors and shipped the account with an empty ledger " +
    "(the aggregation threw after the last page, the seed's catch returned " +
    "nothing), and the day before the storm's timed-out pages fell to the same " +
    "empty fallback; only reading the payload showed it either time. Exits 2 " +
    "(not 0) when no credential or no server, so nothing checked never reads as " +
    "a pass.",
  "check:virtual-tables":
    "opens the IAP Library on the fixture's 606-variable account and fails unless " +
    "the virtualized Variables table renders rows in a REAL browser. jsdom has no " +
    "layout, which is why the failure it guards (a header and no rows for every " +
    "table past 50 rows, the virtualizer created in a child of its scroll " +
    "container) passed every unit test. Needs a RUNNING dev server on 5178, the " +
    "same constraint as check:friction; exits 2 when it cannot reach one.",
  "check:scroll-fade":
    "reads .mx-scroll-x's two scroll-driven fade widths off the computed style in " +
    "a REAL browser at 390 and 1440 px: an overflowing rail must fade on the right " +
    "at rest and on the left at its end, a rail that fits must not fade, and at " +
    "desktop there is no mask. jsdom has no layout and no scroll timelines, which " +
    "is why the static mask it replaced (a fade on every rail that fit) passed " +
    "every unit test. Needs a RUNNING dev server on 5178, the same constraint as " +
    "check:friction; exits 2 when it cannot reach one.",
  "check:friction":
    "walks every route navTree.ts and App.tsx declare, for two fixture accounts " +
    "at 1440 and 390 px, and reports what a reader meets on the FIRST layer: " +
    "warning boxes and glyphs, prose over the rulebook's 220 characters, " +
    "no-data phrases, sideways overflow, nested buttons, retired copy and " +
    "console errors. Needs a RUNNING dev server, the same constraint as " +
    "check:accessible-names, check:chart-geometry and check:unexplained-dashes; " +
    "a validation that cannot run without one fails every validation sweep. " +
    "Every signal is a property of the RENDERED page — whether a warning is " +
    "visible or inside a popover, whether prose sits on the card face or " +
    "behind a reveal — so a source scan sees the JSX that could produce any of " +
    "them and cannot say which one a reader gets. Defects (errors, overflow, " +
    "nested buttons, retired copy) must stay at zero and are never baselined; " +
    "the counted signals ratchet per route in check-friction.baseline.json, " +
    "regenerated with -- --write-baseline. Baseline 2026-09-03: 51 routes, 204 " +
    "visits, 160 first-layer warning boxes (206 before it found the Creative " +
    "Command Center painting every brief status amber), 0 defects. Exits 2 " +
    "(not 0) when the server is unreachable so 'nothing was checked' can never " +
    "read as a pass.",
  "check:unexplained-dashes":
    "measures every VISIBLE em-dash in the rendered DOM and fails on any that " +
    "carries no title, aria-label or info affordance a reader could resolve. " +
    "Needs a RUNNING dev server, same constraint as check:accessible-names and " +
    "check:chart-geometry. A source scan cannot replace it: the dash comes out " +
    "of shared formatters (fmtUSD, fmtRate, fmtMetric all render it for null), " +
    "so grepping the literal finds the formatters, not the surfaces — and what " +
    "matters is what the reader sees. Baseline 2026-09-01: 684 visible dashes " +
    "across 16 routes x 2 accounts, 0 unexplained. The 59 it originally found " +
    "sat in five components, each rendering a formatter result straight out. " +
    "Exits 2 (not 0) when the server is unreachable so 'nothing was checked' " +
    "cannot read as 'every dash is explained'.",
  "check:chart-geometry":
    "measures every recharts mark against its own SVG surface in a REAL " +
    "browser, so it needs a RUNNING dev server (PORT=5178 in " +
    "artifacts/metrix-iap) — same constraint as check:accessible-names and " +
    "check:seed-fixture-drift. It cannot be a static or jsdom check: jsdom " +
    "has no layout engine, so every getBoundingClientRect is 0x0 and no CSS " +
    "variable resolves, which is precisely how a clipped chart shipped past a " +
    "green suite. SharePieChart had innerRadius={60} outerRadius={90} — " +
    "absolute PIXELS, demanding a 180x180 box regardless of the box given. On " +
    "Analysis Overview that box is 170x105 and ALL THREE sectors were drawn " +
    "outside it, one starting 38px above the top edge. It was caught by a " +
    "person looking at the screen, because nothing else could catch it. " +
    "Tolerance is 2px, since a stroke is centred on its path and a 2px line " +
    "at the edge legitimately spills 1px. Exits 2 (not 0) when the dev server " +
    "is unreachable, so 'nothing was checked' can never read as 'the charts " +
    "are fine'.",
  "check:accessible-names":
    "renders the six spine views in a real browser and resolves every visible " +
    "interactive control through the accessibility tree, so it needs a RUNNING " +
    "dev server (PORT=5178 in artifacts/metrix-iap) — same constraint as " +
    "check:seed-fixture-drift, and an unattended validation would fail on every " +
    "run without one. It exists because the static A11Y signal is a weak proxy " +
    "in both directions: Radix supplies role/labelling on the primitive, so a " +
    "file rendering DialogContent scores absent while being announced correctly, " +
    "and a lone aria-hidden scores present. A regex hunting the real defect is " +
    "no better — JSX keeps most button labels inside {expressions}, and every " +
    "one of the 25 controls such a scan flagged was a false positive. Only the " +
    "rendered tree settles it. Baseline 2026-08-31: 595 controls, 0 unnamed. " +
    "Scope is NAMES, not accessibility — contrast has its own three gates, " +
    "target size belongs to check:interaction, and focus order, live regions " +
    "and keyboard traps are measured nowhere yet.",
  "check:ui-inventory":
    "a REPORT, not a gate: it prints which of the app's surfaces carry type " +
    "roles, motion, disclosure, shared dataviz, a breakpoint and a11y wiring, " +
    "and it always exits 0 because there is no threshold that would be honest " +
    "to fail on — a chart primitive needs no disclosure and a layout shell has " +
    "nothing to type. Wiring it into a validation would spend runtime on output " +
    "nobody reads and assert nothing. Run it when picking the next target: " +
    "`-- --gaps` narrows to what is missing, `-- --kind=panel` to one class.",
  "check:field-coverage":
    "a REPORT, not a gate: it lists the seed-bundle fields no component reads — " +
    "analysis that was computed, shipped and never shown. It exits 0 always, " +
    "because its matching is deliberately generous (a field reached through " +
    "string indirection cannot be seen statically, so the tool is tuned to " +
    "UNDER-report) and every entry needs a human to decide whether the field " +
    "should surface, leave the contract, or is genuinely internal. Failing a " +
    "build on a worklist that is known to be approximate would train people to " +
    "ignore it. Run it when auditing what the interface is dropping.",
};
