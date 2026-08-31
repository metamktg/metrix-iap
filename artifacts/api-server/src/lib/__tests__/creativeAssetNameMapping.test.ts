import { describe, expect, it } from "vitest";
import {
  findCreativeAssetNameMatch,
  inferCreativeMediaType,
  normalizeCreativeAssetName,
} from "../creativeAssetNameMapping";

describe("creative asset name mapping", () => {
  it("normalizes case, separators, extension and common version suffixes", () => {
    expect(normalizeCreativeAssetName("Summer-Sale_Hook-01_FINAL_v2.PNG")).toBe("summer sale hook 01");
    expect(normalizeCreativeAssetName("summer sale hook 01.jpg")).toBe("summer sale hook 01");
  });

  it("matches a tolerant filename variant on first encounter", () => {
    const match = findCreativeAssetNameMatch("UGC_Testimonial-v3.mp4", "video", [
      { mediaType: "video", rawName: "ugc testimonial.mp4" },
      { mediaType: "video", rawName: "product_demo.mp4" },
    ]);
    expect(match).toMatchObject({
      rawName: "ugc testimonial.mp4",
      mediaType: "video",
      method: "filename_exact",
    });
  });

  it("never crosses image and video namespaces", () => {
    const match = findCreativeAssetNameMatch("hero-final.jpg", "image", [
      { mediaType: "video", rawName: "hero.mp4" },
      { mediaType: "image", rawName: "different.jpg" },
    ]);
    expect(match).toBeNull();
  });

  it("leaves ambiguous candidates unresolved", () => {
    const match = findCreativeAssetNameMatch("launch hero.jpg", "image", [
      { mediaType: "image", rawName: "launch hero blue.jpg" },
      { mediaType: "image", rawName: "launch hero red.jpg" },
    ]);
    expect(match).toBeNull();
  });

  it("does not choose between duplicate exact upload identities", () => {
    const candidate = [{ mediaType: "image" as const, rawName: "launch hero.jpg" }];
    const first = findCreativeAssetNameMatch("launch-hero.png", "image", candidate);
    const second = findCreativeAssetNameMatch("LAUNCH_HERO_FINAL.webp", "image", candidate);
    expect(first?.score).toBe(1);
    expect(second?.score).toBe(1);
    // The service-level resolver sees the tied scores and leaves the alias
    // unmapped rather than letting database row order pick a permanent winner.
    expect(first!.score - second!.score).toBe(0);
  });

  it("infers media type from MIME type before extension", () => {
    expect(inferCreativeMediaType("video/mp4", "asset.bin")).toBe("video");
    expect(inferCreativeMediaType(null, "asset.webp")).toBe("image");
    expect(inferCreativeMediaType(null, "asset.bin")).toBeNull();
  });
});