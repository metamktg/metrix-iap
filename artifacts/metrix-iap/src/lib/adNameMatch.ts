// ─── Creative filename -> ad name matching logic ──────────────────────
// Extracted from ConnectAccountDialogs.tsx so it can be unit tested in
// isolation (pure logic, no DOM/network dependencies).

export type AdNameMatch = {
  name: string;
  /** "id" = a shared concept/creative ID code uniquely identified the ad (high confidence). "fuzzy" = closest filename similarity (substring/token/edit-distance based). */
  method: "id" | "fuzzy";
};

/**
 * Normalizes a filename or ad name for auto-mapping comparisons: strips
 * the extension, lowercases, and collapses separators (- _ . whitespace)
 * to single spaces so "Summer_Sale-v2.mp4" and "Summer Sale v2" line up.
 */
export function normalizeForMatch(value: string): string {
  return value
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Regexes for concept/creative ID codes commonly embedded in ad/creative filenames (e.g. "CR1234", "CR-1234", or a UUID). Punctuation between letters/digits is stripped before comparison so "CR-1234" and "CR_1234" are treated as the same code. */
// Note: uses [a-z0-9] lookaround rather than \b, because "_" is a word
// character in regex — a code like "CR1234" immediately followed by "_"
// (e.g. "CR1234_final.mp4") would otherwise fail to match at the trailing
// boundary since digit->underscore isn't a \b transition.
const ID_CODE_PATTERNS: readonly RegExp[] = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  /(?<![a-z0-9])[a-z]{1,4}[-_]?\d{3,8}(?![a-z0-9])/gi,
];

/** Extracts normalized ID/creative code tokens from a filename or ad name (lowercased, separators stripped). Codes shorter than 4 chars after stripping are ignored — too common to be a reliable identifier. */
export function extractIdCodes(value: string): string[] {
  const base = value.replace(/\.[^/.]+$/, "").toLowerCase();
  const codes = new Set<string>();
  for (const pattern of ID_CODE_PATTERNS) {
    for (const match of base.matchAll(pattern)) {
      const normalized = match[0].replace(/[-_]/g, "");
      if (normalized.length >= 4) codes.add(normalized);
    }
  }
  return Array.from(codes);
}

/** Dice's (bigram overlap) coefficient — robust to typos/minor edits, 0..1. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string): string[] => {
    const arr: string[] = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.substring(i, i + 2));
    return arr;
  };
  const bigramsA = bigrams(a);
  const remaining = new Map<string, number>();
  for (const bg of bigrams(b)) remaining.set(bg, (remaining.get(bg) ?? 0) + 1);
  let matches = 0;
  for (const bg of bigramsA) {
    const count = remaining.get(bg) ?? 0;
    if (count > 0) {
      matches++;
      remaining.set(bg, count - 1);
    }
  }
  return (2 * matches) / (bigramsA.length + bigrams(b).length);
}

/** Word-level Jaccard similarity — robust to reordered tokens (e.g. "v1_UGC_Testimonial" vs "UGC Testimonial v1"). */
export function tokenSetSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) if (tokensB.has(token)) intersection++;
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/** Below this combined similarity score, a fuzzy suggestion is considered too unreliable — left unmapped rather than guessed. */
export const FUZZY_MATCH_THRESHOLD = 0.55;

/**
 * Suggests the best ad-name match for an uploaded filename against a set
 * of known/available ad names, in two passes:
 *  1. ID/creative code match — a code (e.g. "CR1234", a UUID) embedded in
 *     the filename that appears in exactly ONE candidate's name is a
 *     high-confidence match. A code shared by 2+ candidates is ambiguous
 *     and is skipped (never guessed).
 *  2. Fuzzy fallback — exact normalized match, substring containment, or
 *     the best combined bigram/token-overlap similarity score. Scores
 *     below FUZZY_MATCH_THRESHOLD are left unmapped rather than guessed.
 */
export function suggestAdNameMatch(filename: string, candidates: Iterable<string>): AdNameMatch | null {
  const candidateList = Array.from(candidates);
  if (candidateList.length === 0) return null;

  const normalizedFile = normalizeForMatch(filename);
  if (!normalizedFile) return null;

  const fileCodes = extractIdCodes(filename);
  if (fileCodes.length > 0) {
    const ownersByCode = new Map<string, Set<string>>();
    for (const candidate of candidateList) {
      for (const code of extractIdCodes(candidate)) {
        if (!ownersByCode.has(code)) ownersByCode.set(code, new Set());
        ownersByCode.get(code)!.add(candidate);
      }
    }
    for (const code of fileCodes) {
      const owners = ownersByCode.get(code);
      if (owners && owners.size === 1) {
        return { name: [...owners][0]!, method: "id" };
      }
    }
  }

  let best: { name: string; score: number } | null = null;
  for (const candidate of candidateList) {
    const normalizedCandidate = normalizeForMatch(candidate);
    if (!normalizedCandidate) continue;
    if (normalizedCandidate === normalizedFile) return { name: candidate, method: "fuzzy" };

    let score: number;
    if (normalizedFile.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedFile)) {
      // Substring containment is a strong signal — filenames often carry extra
      // tokens (dates, sizes, "_final") around the ad name. Weight by how much
      // of the longer string the overlap covers so a near-full match beats a
      // short/coincidental substring.
      const overlapRatio =
        Math.min(normalizedFile.length, normalizedCandidate.length) /
        Math.max(normalizedFile.length, normalizedCandidate.length);
      score = 0.75 + 0.2 * overlapRatio;
    } else {
      score = Math.max(diceCoefficient(normalizedFile, normalizedCandidate), tokenSetSimilarity(normalizedFile, normalizedCandidate));
    }
    if (!best || score > best.score) best = { name: candidate, score };
  }

  if (best && best.score >= FUZZY_MATCH_THRESHOLD) {
    return { name: best.name, method: "fuzzy" };
  }
  return null;
}
