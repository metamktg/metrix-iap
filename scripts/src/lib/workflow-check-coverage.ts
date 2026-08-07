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
};
