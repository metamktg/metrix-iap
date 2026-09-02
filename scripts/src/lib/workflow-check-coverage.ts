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
