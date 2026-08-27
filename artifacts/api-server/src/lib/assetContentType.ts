// ─── What an uploaded asset is allowed to be served AS ────────────────
//
// Two endpoints hand user-uploaded bytes back to a browser from this
// application's own origin:
//
//   GET /metrix/accounts/:accountId/manual-imports/:importId/file
//   GET /metrix/accounts/:accountId/cells/:cellId/creative
//
// Both used to echo the `content_type` the uploader supplied, straight
// into the response header. That value is client-controlled — the upload
// bodies declare it as a bare `z.string()`, nothing inspects the bytes, and
// it is stored verbatim. So an authenticated user could upload a "creative"
// whose bytes are HTML and whose declared type is `text/html`, and the
// platform would serve it as a live same-origin document.
//
// The consequence is not a defaced image. A script in that document runs on
// the app's origin, and the session cookie rides along on every fetch it
// makes — so whoever opens the link is silently acting as themselves
// against the whole API. If that is an agency admin reviewing a client's
// creative, it is every tenant's data. The cell endpoint makes it worse:
// its URL contains no unguessable id (cell ids are matrix codes like C2B),
// so the link is trivially constructible and looks entirely legitimate.
//
// In-app rendering was never the exposure — CreativeCard uses <img> and
// <video>, which do not execute scripts even for SVG. Direct navigation is,
// and a link is all that takes.
//
// The rule here: an asset is served with its own content type ONLY if that
// type is on the inline allowlist below. Anything else — unrecognised,
// missing, `text/html`, `image/svg+xml` — is served as an opaque download.
// SVG is excluded deliberately: it can carry script, and it is not a Meta
// ad creative format, so nothing real is lost by refusing to render it
// inline.
//
// Pair this with `X-Content-Type-Options: nosniff` (see
// middlewares/securityHeaders) — without it a browser may sniff
// `application/octet-stream` back into HTML and undo the whole thing.

/**
 * Types safe to render inline: raster images and the video containers Meta
 * ad creatives actually use. Nothing here can execute script.
 *
 * Deliberately NOT here: image/svg+xml (scriptable), text/html,
 * application/xhtml+xml, application/xml, text/xml.
 */
const INLINE_SAFE_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "audio/mpeg",
  "audio/mp4",
]);

export const DOWNLOAD_CONTENT_TYPE = "application/octet-stream";

export interface ServedAssetHeaders {
  /** Value for the Content-Type response header. */
  contentType: string;
  /** Content-Disposition value, or null to omit the header. */
  disposition: string | null;
  /** True when the original declared type was refused for inline rendering. */
  downgraded: boolean;
}

/** Strip parameters and normalise: `Image/PNG; charset=x` -> `image/png`. */
function normalise(raw: string | null | undefined): string {
  return String(raw ?? "").split(";")[0]!.trim().toLowerCase();
}

/**
 * Quote a filename for Content-Disposition without letting it break out of
 * the header. Anything exotic falls back to a safe constant rather than
 * being escaped cleverly — a header injection here would be a worse bug
 * than a download named "asset".
 */
function safeFilename(filename: string | null | undefined): string {
  const raw = String(filename ?? "").trim();
  const cleaned = raw.replace(/[^A-Za-z0-9._ -]/g, "");
  return cleaned.length > 0 && cleaned.length <= 120 ? cleaned : "asset";
}

/**
 * Decide how to serve an uploaded asset.
 *
 * `declared` is whatever the uploader claimed. It is advisory only: it
 * selects a response type when it names something inline-safe, and is
 * otherwise discarded.
 */
export function resolveServedAsset(
  declared: string | null | undefined,
  filename?: string | null,
): ServedAssetHeaders {
  const type = normalise(declared);
  if (INLINE_SAFE_TYPES.has(type)) {
    return { contentType: type, disposition: null, downgraded: false };
  }
  return {
    contentType: DOWNLOAD_CONTENT_TYPE,
    disposition: `attachment; filename="${safeFilename(filename)}"`,
    downgraded: true,
  };
}

/** True when this response may be range-served as video. */
export function isInlineVideo(contentType: string): boolean {
  return contentType.startsWith("video/") && INLINE_SAFE_TYPES.has(contentType);
}

/** Exposed for tests and for anything that needs to reason about the policy. */
export function isInlineSafeType(declared: string | null | undefined): boolean {
  return INLINE_SAFE_TYPES.has(normalise(declared));
}
