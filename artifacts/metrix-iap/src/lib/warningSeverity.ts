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
// headers whose occurrences DISAGREE (a duplicated header whose values are
// identical on every row arrives as a "Note:" line and is routine),
// moderate-confidence inference ("please verify"), coverage /
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
  // Measured coverage is context for the reader, not a decision (owner
  // direction 2026-09-02): the surfaces carry it as a tag, the run panel
  // files it with the notices. A failed reconciliation check (over-count)
  // is a different line and stays attention.
  /^\s*\[Coverage\]/,
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

// ─── Reduced-confidence detection (E-b) ───────────────────────────────
//
// The run-warnings panel used to pick its headline inline with
// `w.includes("Reduced confidence") || w.includes("core metric")`. That is
// business logic keyed on prose: rewording the parser's message — a copy
// edit, the sort of change nobody expects to alter behaviour — silently
// demotes "Analysis succeeded with reduced confidence" to a generic
// warning count, and the reader loses the one line that says their
// efficiency metrics are incomplete.
//
// The producer is `iapCsvParser`'s core-metric branch, which emits
// "⚠ Reduced confidence: core metric columns are missing and will be null
// — …". Stored runs keep their warnings verbatim (csv_warnings is
// string[] in both the DB and the API contract), so a machine severity
// field on new runs would still leave every historical run classified by
// text. Until that contract changes, the honest fix is the same one this
// module already applies to the notice/attention split: ONE place that
// interprets warning prose, next to the patterns it interprets, so a copy
// edit has exactly one place to update — and a test that fails loudly if
// the producer's wording moves out from under it.

const REDUCED_CONFIDENCE_PATTERNS: RegExp[] = [
  /Reduced confidence/i,
  /core metric columns are missing/i,
];

/**
 * True when a run's warnings include a core-metric absence — the case
 * where the run succeeded but its efficiency metrics are incomplete.
 * Pass the ATTENTION lines: a routine notice never carries this.
 */
export function hasReducedConfidence(warnings: readonly string[]): boolean {
  return warnings.some((w) => REDUCED_CONFIDENCE_PATTERNS.some((p) => p.test(w)));
}
