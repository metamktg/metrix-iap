// ─── Creative asset type detection ────────────────────────────────────
// Detects whether an uploaded creative file is genuinely an image or a
// video by inspecting its magic bytes, and flags when the real content
// disagrees with the filename extension / declared MIME type. This catches
// the common mistake of uploading a video renamed with an image extension
// (or vice versa), which would otherwise render as a broken <img> in the UI.

export type CreativeMediaKind = "image" | "video" | "unknown";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "heic",
  "heif",
]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv", "mpeg", "mpg", "ogv"]);

export function extensionOf(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/** The media kind implied by a filename extension (not the bytes). */
export function kindFromExtension(filename: string): CreativeMediaKind {
  const ext = extensionOf(filename);
  if (!ext) return "unknown";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "unknown";
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  bytes.every((b, i) => buf[offset + i] === b);

const asciiAt = (buf: Buffer, offset: number, text: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    if (buf[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

/**
 * Detects the real media kind from a file's leading bytes. Returns
 * "unknown" for content we can't confidently classify (so the caller never
 * rejects an ambiguous-but-valid file — it only rejects a proven mismatch).
 */
export function detectCreativeAssetKind(buf: Buffer): CreativeMediaKind {
  if (buf.length < 12) return "unknown";

  // ── Images ──
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image"; // JPEG
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image"; // PNG
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "image"; // GIF87a/89a
  if (startsWith(buf, [0x42, 0x4d])) return "image"; // BMP
  // WEBP: "RIFF"...."WEBP"
  if (asciiAt(buf, 0, "RIFF") && asciiAt(buf, 8, "WEBP")) return "image";
  // SVG (text): look for "<svg" near the start (allow BOM / xml prolog).
  {
    const head = buf.subarray(0, Math.min(buf.length, 512)).toString("utf8").toLowerCase();
    if (head.includes("<svg")) return "image";
  }

  // ── ISO base media (mp4/mov/m4v/heic) — "ftyp" box at offset 4 ──
  if (asciiAt(buf, 4, "ftyp")) {
    const brand = buf.subarray(8, 12).toString("ascii").toLowerCase();
    // HEIC/HEIF/AVIF are ISO-BMFF images, not video.
    if (brand.startsWith("hei") || brand.startsWith("mif") || brand.startsWith("avif")) return "image";
    return "video";
  }

  // ── Other videos ──
  // WEBM / Matroska: EBML header 1A 45 DF A3
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return "video";
  // AVI: "RIFF"...."AVI "
  if (asciiAt(buf, 0, "RIFF") && asciiAt(buf, 8, "AVI ")) return "video";
  // MPEG program/transport stream
  if (startsWith(buf, [0x00, 0x00, 0x01, 0xba]) || startsWith(buf, [0x00, 0x00, 0x01, 0xb3])) return "video";
  // Ogg (can be video)
  if (asciiAt(buf, 0, "OggS")) return "video";

  return "unknown";
}

/**
 * Returns a human-readable mismatch message when a file's real content kind
 * (from its bytes) contradicts what its filename extension claims. Returns
 * null when there is no proven contradiction (unknown content, matching
 * kinds, or an unrecognised extension — none of which we treat as an error).
 */
export function creativeAssetTypeMismatch(filename: string, buf: Buffer): string | null {
  const declared = kindFromExtension(filename);
  const actual = detectCreativeAssetKind(buf);
  if (actual === "unknown" || declared === "unknown") return null;
  if (actual === declared) return null;

  const ext = extensionOf(filename);
  return (
    `"${filename}" looks like a ${actual} file but has a ${declared} extension (.${ext}). ` +
    `Rename it with the correct extension (or re-export it) so it renders correctly.`
  );
}

// ─── Creative asset → ad-name linking ─────────────────────────────────

/** Per-file result of linking a staged creative to its ad name(s). */
export type CreativeLinkResult = {
  /** Ad names that resolved to a real ads row and were linked to the asset. */
  matched: string[];
  /** Ad names with no matching ads row — the asset is staged but unlinked. */
  unmatched: string[];
};

/**
 * Splits the requested ad names into those that resolved to a real `ads` row
 * (present in `matchedAdNames`) and those that did not. Pure so the
 * matched/unmatched reporting surfaced to uploaders is unit-testable without a
 * database — the DB query only supplies which names actually exist.
 */
export function resolveCreativeLinkResult(
  nextAdNames: string[],
  matchedAdNames: Iterable<string>,
): CreativeLinkResult {
  const matched = new Set(matchedAdNames);
  return {
    matched: nextAdNames.filter((n) => matched.has(n)),
    unmatched: nextAdNames.filter((n) => !matched.has(n)),
  };
}
