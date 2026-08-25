// ─── Generation timing bounds (BUG-41) ────────────────────────────────
//
// These live in their own module, apart from generationEngine, for two
// reasons: the engine imports the Anthropic client at module load and so
// cannot be imported without live credentials, and the numbers below are
// only meaningful RELATIVE TO EACH OTHER. Keeping them together with the
// invariant that ties them makes that relationship checkable instead of
// tribal knowledge.

/**
 * Wall-clock ceiling for ONE model call.
 *
 * The SDK's default is 10 minutes, but for a NON-STREAMING request it
 * scales that upward with `max_tokens` — toward 60 minutes at the budgets
 * this engine uses (16k, escalating to 32k) — and then retries timeouts.
 * A live strategy run was observed sitting in "Calling strategy model…"
 * for 1h19m before a restart ended it, holding the account's
 * one-running-run slot the whole time.
 *
 * For scale: the longest strategy run that ever SUCCEEDED took 5.44
 * minutes end to end, across several calls plus all its database writes.
 */
export const MODEL_CALL_TIMEOUT_MS = 4 * 60 * 1000;

/** Retries per model call. Worst case per call = timeout × (retries + 1). */
export const MODEL_CALL_MAX_RETRIES = 1;

/**
 * The most model calls one `generateValidated` can make: an initial call,
 * one budget escalation when the response is truncated, and one repair
 * when validation fails.
 */
export const MAX_MODEL_CALLS_PER_RUN = 3;

/** Worst-case wall clock a single run can legitimately spend in the model. */
export function worstCaseModelMs(): number {
  return MODEL_CALL_TIMEOUT_MS * (MODEL_CALL_MAX_RETRIES + 1) * MAX_MODEL_CALLS_PER_RUN;
}
