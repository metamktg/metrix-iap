// ─── Confidence-report signal weights (client mirror) ─────────────────
//
// The canonical table is `SIGNAL_WEIGHTS` in the API server's
// `iapCsvSpec.ts`. This is a deliberate client-side mirror: the Confidence
// Report grades an import the moment its mapping summary lands, and the
// browser cannot import server code without pulling the server bundle in
// with it.
//
// A mirror with nothing enforcing it is the Frankenstein pattern the audit
// flagged (E-a) — and it had ALREADY drifted: this table carried an
// "Amount spent (USD)" entry the server's did not, so the two files
// disagreed about which keys exist while a comment claimed they were in
// sync. That extra key is real and necessary (the mapping summary reports
// the RESOLVED header, so a USD account's spend column arrives with the
// currency already substituted), so it is now declared as what it is — a
// derived alias, generated from the canonical entry rather than typed out
// beside it — and the drift test in the scripts package fails the build if
// the server's table gains, loses, or re-weights anything.
//
// See scripts/src/signal-weights-drift.test.ts.

/** Placeholder the server's canonical keys use for the account currency. */
export const ACCOUNT_CURRENCY_PLACEHOLDER = "{ACCOUNT_CURRENCY}";

/**
 * Mirror of the server's SIGNAL_WEIGHTS, key for key and weight for weight.
 * Columns absent here have weight 0 (cosmetic / supplementary).
 * The listed weights sum to 1.00.
 */
export const SIGNAL_WEIGHTS: Record<string, number> = {
  "Amount spent ({ACCOUNT_CURRENCY})": 0.20,
  "Results": 0.23,
  "Impressions": 0.10,
  "CTR (link click-through rate)": 0.07,
  "Link clicks": 0.07,
  "Reach": 0.06,
  "CPM (cost per 1,000 impressions)": 0.05,
  "Video average play time": 0.03,
  "ThruPlays": 0.03,
  "Landing page views": 0.03,
  "Clicks (all)": 0.02,
  "CTR (all)": 0.02,
  "Frequency": 0.02,
  "Result type": 0.02,
  "Ad creative body text": 0.01,
  "Ad creative headline": 0.01,
  "Conversion device": 0.01,
  // total = 1.00
};

/**
 * Currencies a resolved spend header can arrive in. The mapping summary
 * reports the header AFTER currency resolution, so "Amount spent (USD)"
 * must weigh the same as the canonical placeholder form rather than
 * silently scoring 0 — which would have quietly dropped 20% of the grade
 * for every account whose export named its currency.
 */
const SPEND_KEY = `Amount spent (${ACCOUNT_CURRENCY_PLACEHOLDER})`;

/** True when `canonical` is a currency-resolved form of the spend column. */
function isResolvedSpendKey(canonical: string): boolean {
  return /^Amount spent \([A-Z]{3}\)$/.test(canonical);
}

/** Weight for a canonical column name; 0 for anything unlisted. */
export function getSignalWeight(canonical: string): number {
  if (isResolvedSpendKey(canonical)) return SIGNAL_WEIGHTS[SPEND_KEY] ?? 0;
  return SIGNAL_WEIGHTS[canonical] ?? 0;
}
