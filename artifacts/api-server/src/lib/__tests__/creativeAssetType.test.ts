import { describe, expect, it } from "vitest";
import {
  detectCreativeAssetKind,
  kindFromExtension,
  creativeAssetTypeMismatch,
  extensionOf,
  resolveCreativeLinkResult,
} from "../creativeAssetType";

const pad = (bytes: number[], len = 16): Buffer => {
  const out = Buffer.alloc(Math.max(len, bytes.length));
  bytes.forEach((b, i) => (out[i] = b));
  return out;
};

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const GIF = pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const BMP = pad([0x42, 0x4d, 0, 0]);
const WEBP = (() => {
  const b = Buffer.alloc(16);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  return b;
})();
const MP4 = (() => {
  const b = Buffer.alloc(16);
  b.write("ftyp", 4, "ascii");
  b.write("isom", 8, "ascii");
  return b;
})();
const HEIC = (() => {
  const b = Buffer.alloc(16);
  b.write("ftyp", 4, "ascii");
  b.write("heic", 8, "ascii");
  return b;
})();
const WEBM = pad([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);

describe("extensionOf", () => {
  it("lowercases and extracts the extension", () => {
    expect(extensionOf("Ad_Final.PNG")).toBe("png");
    expect(extensionOf("clip.MP4")).toBe("mp4");
  });
  it("returns null when there is no extension", () => {
    expect(extensionOf("noext")).toBeNull();
  });
});

describe("kindFromExtension", () => {
  it("classifies image and video extensions", () => {
    expect(kindFromExtension("a.jpg")).toBe("image");
    expect(kindFromExtension("a.webp")).toBe("image");
    expect(kindFromExtension("a.mp4")).toBe("video");
    expect(kindFromExtension("a.mov")).toBe("video");
  });
  it("returns unknown for unrecognised extensions", () => {
    expect(kindFromExtension("a.csv")).toBe("unknown");
    expect(kindFromExtension("noext")).toBe("unknown");
  });
});

describe("detectCreativeAssetKind", () => {
  it("detects images by magic bytes", () => {
    expect(detectCreativeAssetKind(JPEG)).toBe("image");
    expect(detectCreativeAssetKind(PNG)).toBe("image");
    expect(detectCreativeAssetKind(GIF)).toBe("image");
    expect(detectCreativeAssetKind(BMP)).toBe("image");
    expect(detectCreativeAssetKind(WEBP)).toBe("image");
  });
  it("detects videos by magic bytes", () => {
    expect(detectCreativeAssetKind(MP4)).toBe("video");
    expect(detectCreativeAssetKind(WEBM)).toBe("video");
  });
  it("treats ISO-BMFF image brands (HEIC) as image, not video", () => {
    expect(detectCreativeAssetKind(HEIC)).toBe("image");
  });
  it("detects SVG text as image", () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectCreativeAssetKind(svg)).toBe("image");
  });
  it("returns unknown for unrecognised or too-short content", () => {
    expect(detectCreativeAssetKind(Buffer.from("plain text content here"))).toBe("unknown");
    expect(detectCreativeAssetKind(Buffer.from([0x00, 0x01]))).toBe("unknown");
  });
});

describe("creativeAssetTypeMismatch", () => {
  it("flags a video renamed with an image extension", () => {
    const msg = creativeAssetTypeMismatch("ad.png", MP4);
    expect(msg).toContain("looks like a video");
    expect(msg).toContain(".png");
  });
  it("flags an image renamed with a video extension", () => {
    const msg = creativeAssetTypeMismatch("ad.mp4", JPEG);
    expect(msg).toContain("looks like a image");
  });
  it("returns null when content and extension agree", () => {
    expect(creativeAssetTypeMismatch("ad.png", PNG)).toBeNull();
    expect(creativeAssetTypeMismatch("clip.mp4", MP4)).toBeNull();
    expect(creativeAssetTypeMismatch("shot.heic", HEIC)).toBeNull();
  });
  it("does not flag when content is unknown (ambiguous but valid)", () => {
    expect(creativeAssetTypeMismatch("ad.png", Buffer.from("weird bytes not a known magic"))).toBeNull();
  });
  it("does not flag when the extension is unrecognised", () => {
    expect(creativeAssetTypeMismatch("ad.bin", MP4)).toBeNull();
  });
});

describe("resolveCreativeLinkResult", () => {
  it("splits requested ad names into matched and unmatched", () => {
    const result = resolveCreativeLinkResult(
      ["Ad_A", "Ad_B", "Ad_C"],
      ["Ad_A", "Ad_C"],
    );
    expect(result.matched).toEqual(["Ad_A", "Ad_C"]);
    expect(result.unmatched).toEqual(["Ad_B"]);
  });

  it("reports all names unmatched when none exist as ads rows", () => {
    const result = resolveCreativeLinkResult(["Ad_A", "Ad_B"], []);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(["Ad_A", "Ad_B"]);
  });

  it("reports all names matched when every name resolves", () => {
    const result = resolveCreativeLinkResult(["Ad_A", "Ad_B"], ["Ad_B", "Ad_A"]);
    expect(result.matched).toEqual(["Ad_A", "Ad_B"]);
    expect(result.unmatched).toEqual([]);
  });

  it("preserves the requested order and ignores extra matched names", () => {
    const result = resolveCreativeLinkResult(
      ["Ad_C", "Ad_A"],
      ["Ad_A", "Ad_B", "Ad_C", "Ad_D"],
    );
    expect(result.matched).toEqual(["Ad_C", "Ad_A"]);
    expect(result.unmatched).toEqual([]);
  });

  it("returns empty results for no requested names", () => {
    const result = resolveCreativeLinkResult([], ["Ad_A"]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });
});
