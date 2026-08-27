// ─── Uploaded bytes must not become live same-origin documents ────────
//
// Both asset endpoints echoed the uploader's declared `content_type`
// straight into the response header. That value is client-controlled — the
// upload bodies declare it as a bare z.string(), nothing inspects the
// bytes — so an authenticated user could upload a "creative" of HTML
// declared as text/html and have the platform serve it as a live document
// on its own origin. Script in that document runs with the session cookie
// attached to every fetch it makes, so whoever opens the link is silently
// acting as themselves against the whole API.
//
// These pin the policy: known-safe media renders inline, everything else
// is an opaque download.

import { describe, it, expect } from "vitest";
import {
  resolveServedAsset,
  isInlineSafeType,
  isInlineVideo,
  DOWNLOAD_CONTENT_TYPE,
} from "../assetContentType";

describe("resolveServedAsset — types that must never render inline", () => {
  it.each([
    "text/html",
    "TEXT/HTML",
    "text/html; charset=utf-8",
    "application/xhtml+xml",
    "image/svg+xml",
    "application/xml",
    "text/xml",
    "application/javascript",
    "text/javascript",
  ])("downgrades %s to an opaque download", (declared) => {
    const served = resolveServedAsset(declared, "payload.html");
    expect(served.contentType).toBe(DOWNLOAD_CONTENT_TYPE);
    expect(served.disposition).toContain("attachment");
    expect(served.downgraded).toBe(true);
  });

  it("downgrades an unrecognised or absent type rather than trusting it", () => {
    for (const declared of [null, undefined, "", "   ", "not/a-real-type", "application/octet-stream"]) {
      const served = resolveServedAsset(declared, "x.bin");
      expect(served.contentType, String(declared)).toBe(DOWNLOAD_CONTENT_TYPE);
      expect(served.downgraded, String(declared)).toBe(true);
    }
  });

  it("keeps SVG off the inline list on purpose", () => {
    // SVG can carry <script>, and it is not a Meta ad creative format —
    // nothing real is lost by refusing to render it inline.
    expect(isInlineSafeType("image/svg+xml")).toBe(false);
  });
});

describe("resolveServedAsset — real creative formats still render", () => {
  it.each([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/avif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ])("serves %s inline with its own type", (declared) => {
    const served = resolveServedAsset(declared, "creative.bin");
    expect(served.contentType).toBe(declared);
    expect(served.disposition).toBeNull();
    expect(served.downgraded).toBe(false);
  });

  it("normalises case and parameters before matching", () => {
    expect(resolveServedAsset("IMAGE/PNG").contentType).toBe("image/png");
    expect(resolveServedAsset("image/jpeg; charset=binary").contentType).toBe("image/jpeg");
  });

  it("range-serves only inline-safe video", () => {
    expect(isInlineVideo("video/mp4")).toBe(true);
    // A downgraded response must not take the 206 path — it is not video
    // any more, whatever the uploader called it.
    expect(isInlineVideo(DOWNLOAD_CONTENT_TYPE)).toBe(false);
    expect(isInlineVideo("video/x-fictional")).toBe(false);
  });
});

describe("resolveServedAsset — the download name cannot break the header", () => {
  it("strips characters that would escape the quoted filename", () => {
    const served = resolveServedAsset("text/html", 'evil"; filename="ok.png');
    // The property that matters is that the value cannot break out of its
    // quotes and inject a second directive — not the cosmetic result of
    // removing the quote, semicolon and equals.
    expect(served.disposition).toBe('attachment; filename="evil filenameok.png"');
    expect(served.disposition!.match(/"/g)).toHaveLength(2);
    expect(served.disposition).not.toContain(";" + ' filename="ok.png');
  });

  it("falls back to a constant rather than emitting a newline", () => {
    const served = resolveServedAsset("text/html", "a\r\nX-Injected: yes");
    expect(served.disposition).not.toContain("\n");
    expect(served.disposition).not.toContain("\r");
  });

  it("falls back to a constant for an empty or absurd name", () => {
    expect(resolveServedAsset("text/html", "").disposition).toBe('attachment; filename="asset"');
    expect(resolveServedAsset("text/html", "€€€").disposition).toBe('attachment; filename="asset"');
    expect(resolveServedAsset("text/html", "x".repeat(500)).disposition).toBe('attachment; filename="asset"');
  });
});
