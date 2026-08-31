export type CreativeMediaType = "image" | "video";

export type CreativeAssetNameCandidate = {
  mediaType: CreativeMediaType;
  rawName: string;
};

export type CreativeAssetNameMatch = CreativeAssetNameCandidate & {
  normalizedName: string;
  score: number;
  method: "filename_exact" | "filename_tolerant";
};

const MEDIA_EXTENSION_RE =
  /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp|mov|mp4|m4v|avi|mkv|webm|wmv)$/i;
const COMMON_SUFFIX_RE =
  /(?:[\s._-]+(?:copy|final|export|edited|edit|rev\d*|v(?:er(?:sion)?)?\d+|\(\d+\))){1,3}$/i;

/**
 * Normalizes filenames for first-encounter matching only. The raw Meta name is
 * also persisted and every later import resolves through the sticky DB row.
 */
export function normalizeCreativeAssetName(value: string): string {
  let decoded = value.trim().replace(/^.*[\\/]/, "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // A literal '%' in a valid filename is not an error.
  }
  return decoded
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(MEDIA_EXTENSION_RE, "")
    .replace(COMMON_SUFFIX_RE, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const compactLeft = left.replace(/\s/g, "");
  const compactRight = right.replace(/\s/g, "");
  if (compactLeft === compactRight) return 0.98;

  const edit =
    1 - levenshteinDistance(compactLeft, compactRight) / Math.max(compactLeft.length, compactRight.length);
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = union > 0 ? intersection / union : 0;
  return edit * 0.72 + tokenScore * 0.28;
}

export function inferCreativeMediaType(contentType: string | null | undefined, filename: string): CreativeMediaType | null {
  if (contentType?.toLowerCase().startsWith("image/")) return "image";
  if (contentType?.toLowerCase().startsWith("video/")) return "video";
  if (/\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(filename)) return "image";
  if (/\.(?:mov|mp4|m4v|avi|mkv|webm|wmv)$/i.test(filename)) return "video";
  return null;
}

/**
 * Returns one unambiguous filename match. Weak or near-tied candidates remain
 * unresolved so ingestion and data visibility can continue without a false
 * creative link.
 */
export function findCreativeAssetNameMatch(
  uploadFilename: string,
  mediaType: CreativeMediaType,
  candidates: CreativeAssetNameCandidate[],
): CreativeAssetNameMatch | null {
  const uploadName = normalizeCreativeAssetName(uploadFilename);
  if (!uploadName) return null;
  const distinct = new Map<string, CreativeAssetNameCandidate>();
  for (const candidate of candidates) {
    if (candidate.mediaType !== mediaType) continue;
    const normalized = normalizeCreativeAssetName(candidate.rawName);
    if (normalized && !distinct.has(normalized)) distinct.set(normalized, candidate);
  }
  const ranked = [...distinct.entries()]
    .map(([normalizedName, candidate]) => ({
      ...candidate,
      normalizedName,
      score: similarity(uploadName, normalizedName),
      method: uploadName === normalizedName ? ("filename_exact" as const) : ("filename_tolerant" as const),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.74) return null;
  const runnerUp = ranked[1];
  if (best.score < 1 && runnerUp && best.score - runnerUp.score < 0.08) return null;
  return best;
}