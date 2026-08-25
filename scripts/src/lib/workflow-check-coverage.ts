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
};
