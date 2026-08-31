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
