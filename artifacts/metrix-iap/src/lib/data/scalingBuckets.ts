// ─── Scaling-playbook bucket matching ─────────────────────────────────
// Maps a concept-rollup row (book + concept code) onto the strategy
// map's scaling_playbook lists. Playbook entries are free-text ("BOOK0
// Concept C2 (esp. Row B)", "BOOK2 C2B", "BOOK0 C3 (any variation) —
// zero conversions on real spend"), so matching is token-based: the
// entry must name the book AND carry the concept code as a standalone
// token (word boundaries — C2 never matches C2B). Rows matching no list
// return null — rendered as unclassified, never guessed.

import type { ScalingPlaybook } from "./seedTypes";

export type ScalingBucket = "scale_now" | "optimize" | "validate" | "explore" | "avoid";

// The four verbs (Retire · Scale · Optimize · Validate): an exploration
// is a validation, and avoiding a concept is retiring it (audit round 7).
export const BUCKET_LABEL: Record<ScalingBucket, string> = {
  scale_now: "Scale",
  optimize: "Optimize",
  validate: "Validate",
  explore: "Validate",
  avoid: "Retire",
};

function entryMatches(entry: string, book: string, concept: string): boolean {
  const e = entry.toUpperCase();
  if (!e.includes(book.toUpperCase())) return false;
  // Standalone concept token: preceded/followed by non-alphanumerics.
  const re = new RegExp(`(^|[^A-Z0-9])${concept.toUpperCase()}([^A-Z0-9]|$)`);
  return re.test(e);
}

const BUCKET_ORDER: Array<{ key: ScalingBucket; list: keyof ScalingPlaybook }> = [
  { key: "scale_now", list: "scale_now" },
  { key: "optimize", list: "optimize" },
  { key: "validate", list: "validate" },
  { key: "explore", list: "explore" },
  { key: "avoid", list: "avoid_combinations" },
];

/**
 * Same match as `bucketForConcept`, but also returns the literal playbook
 * entry string that produced the match — the real, source-backed rationale
 * for that classification (e.g. "BOOK0 C3 (any variation) - zero
 * conversions on real spend"), never a paraphrase or invented copy.
 */
export function bucketEntryForConcept(
  book: string,
  concept: string,
  playbook: ScalingPlaybook | null | undefined,
): { bucket: ScalingBucket; entry: string } | null {
  if (!playbook) return null;
  for (const { key, list } of BUCKET_ORDER) {
    const entries = playbook[list];
    if (!Array.isArray(entries)) continue;
    const match = entries.find((e) => typeof e === "string" && entryMatches(e, book, concept));
    if (match) return { bucket: key, entry: match as string };
  }
  return null;
}

export function bucketForConcept(
  book: string,
  concept: string,
  playbook: ScalingPlaybook | null | undefined,
): ScalingBucket | null {
  return bucketEntryForConcept(book, concept, playbook)?.bucket ?? null;
}
