// ─── Concept-code tokenizer ───────────────────────────────────────────
// Splits a string into alternating text / chip segments so JSX renderers
// can wrap each concept code in a <ConceptChip> without regex-in-JSX
// anti-patterns. Only codes present in the registry become chips; unknown
// codes stay as plain text.
//
// Matched pattern: \bC\d+[A-Z]\b — matrix concept codes like C2B, C4E.
// Case-insensitive (i flag): c4A, c2b, etc. from Meta ad exports are
// normalised to uppercase before the registry lookup so they resolve to
// the same chip as C4A, C2B. Does NOT match CN_ProductDemo (variable
// codes) or C1 (column-only codes) since those are not the interactive
// chip targets.

import type { ConceptDescriptorEntry } from "@/lib/concept-registry-context";

export type TextToken  = { type: "text"; value: string };
export type ChipToken  = { type: "chip"; code: string };
export type ConceptToken = TextToken | ChipToken;

const CONCEPT_CODE_RE = /\b(C\d+[A-Z])\b/gi;

/**
 * Tokenize a string, producing text segments and chip segments for any
 * `C\d+[A-Z]` code (case-insensitive) that exists in `registry`. The
 * matched code is uppercased before the registry lookup so `c4A` resolves
 * to the same chip as `C4A`. Unknown codes are left as plain text so the
 * output is always a faithful representation of `text`.
 */
export function tokenizeConceptCodes(
  text: string,
  registry: Record<string, ConceptDescriptorEntry>,
): ConceptToken[] {
  if (!text) return [{ type: "text", value: text }];

  const tokens: ConceptToken[] = [];
  let lastIndex = 0;
  CONCEPT_CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CONCEPT_CODE_RE.exec(text)) !== null) {
    const code = match[1]!.toUpperCase();
    if (!registry[code]) continue;

    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    tokens.push({ type: "chip", code });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: "text", value: text }];
}

/**
 * Returns true if the text contains at least one registry-known concept code.
 * Use to skip tokenizing obviously code-free strings for performance.
 */
export function hasConceptCode(
  text: string,
  registry: Record<string, ConceptDescriptorEntry>,
): boolean {
  CONCEPT_CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONCEPT_CODE_RE.exec(text)) !== null) {
    if (registry[match[1]!.toUpperCase()]) return true;
  }
  return false;
}
