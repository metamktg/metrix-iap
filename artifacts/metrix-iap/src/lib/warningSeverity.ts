// ─── Import/analysis warning severity classification ─────────────────────
//
// One classifier for every surface that renders parser/ingestion warnings
// (the staging popup and the run-history CsvWarningsPanel), so "what counts
// as routine" can never drift between them.
//
// A line is a NOTICE — informational, no decision required — when it
// records a deterministic auto-mapping (curated alias / slug / the folded
// "matched automatically" summary) or an optional-column absence. Everything
// else stays ATTENTION: ID corruption, date normalization, duplicate
// headers, moderate-confidence inference ("please verify"), coverage /
// reconciliation / totals / re-run / duplicate-data findings.
//
// Runs persist their warnings verbatim (manual_analysis_runs.csv_warnings),
// so the patterns cover BOTH the current phrasings and the pre-fold ones
// older stored runs still carry ("via slug match" per-column lines, the
// un-prefixed optional-breakdown list). "via currency match" is covered for
// the same reason: currency-suffix resolution is deterministic, and runs
// stored before the creative-metadata cascade joined the fold can carry
// per-column lines for it.

const NOTICE_PATTERNS: RegExp[] = [
  /^\s*(\[[^\]]+\]\s*)?Note:/,
  /no action needed/,
  /matched automatically/,
  /\(via slug match\)/,
  /\(via alias match\)/,
  /\(via case_insensitive match\)/,
  /\(via currency match\)/,
  /will be treated as blank/,
];

export function isInformationalWarning(warning: string): boolean {
  return NOTICE_PATTERNS.some((p) => p.test(warning));
}

export function splitWarningsBySeverity(warnings: readonly string[]): {
  attention: string[];
  notices: string[];
} {
  const attention: string[] = [];
  const notices: string[] = [];
  for (const w of warnings) {
    if (w.trim() === "") continue;
    (isInformationalWarning(w) ? notices : attention).push(w);
  }
  return { attention, notices };
}
