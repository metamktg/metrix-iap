import { describe, expect, it } from "vitest";
import { suggestAdNameMatch } from "../adNameMatch";

describe("suggestAdNameMatch", () => {
  it("matches an exact filename (ignoring extension/case)", () => {
    const result = suggestAdNameMatch("Summer_Sale_v2.mp4", ["Summer Sale v2", "Winter Promo v1"]);
    expect(result).toEqual({ name: "Summer Sale v2", method: "fuzzy" });
  });

  it("matches via substring containment", () => {
    const result = suggestAdNameMatch(
      "UGC_Testimonial_final_2024-01-15.mp4",
      ["UGC Testimonial", "Static Product Shot"]
    );
    expect(result).toEqual({ name: "UGC Testimonial", method: "fuzzy" });
  });

  it("matches reordered words via token-set similarity", () => {
    const result = suggestAdNameMatch("v1_UGC_Testimonial_extra_words_here", [
      "UGC Testimonial v1 extra words here",
      "Completely Different Concept",
    ]);
    expect(result?.name).toBe("UGC Testimonial v1 extra words here");
    expect(result?.method).toBe("fuzzy");
  });

  it("matches a filename with a minor typo via bigram similarity", () => {
    const result = suggestAdNameMatch("Summer Sael v2.mp4", ["Summer Sale v2", "Autumn Deals v1"]);
    expect(result).toEqual({ name: "Summer Sale v2", method: "fuzzy" });
  });

  it("matches via a hyphenated ID code embedded in the filename", () => {
    const result = suggestAdNameMatch("creative-CR-1234-final.mp4", [
      "Concept A [CR1234]",
      "Concept B [CR5678]",
    ]);
    expect(result).toEqual({ name: "Concept A [CR1234]", method: "id" });
  });

  it("matches via an underscore-variant ID code embedded in the filename", () => {
    // Regression check for the underscore/word-boundary regex bug: a code
    // like "CR1234" immediately followed by "_" must still match, since
    // digit->underscore is not a \b transition.
    const result = suggestAdNameMatch("CR1234_final.mp4", ["Concept A [CR-1234]", "Concept B [CR-5678]"]);
    expect(result).toEqual({ name: "Concept A [CR-1234]", method: "id" });
  });

  it("falls back to a low-confidence guess when an ID code is ambiguous (shared by 2+ candidates)", () => {
    // The ID pass never guesses when a code is shared, but the closest
    // candidate by filename similarity is still pre-mapped as a "guess"
    // (flagged for review) rather than left empty.
    const result = suggestAdNameMatch("creative-CR1234-final.mp4", [
      "Concept A [CR1234]",
      "Concept B [CR1234 remix]",
    ]);
    expect(result?.method).toBe("guess");
    expect(["Concept A [CR1234]", "Concept B [CR1234 remix]"]).toContain(result?.name);
  });

  it("pre-maps to the closest ('most logical') candidate as a low-confidence guess", () => {
    // Below the confident fuzzy threshold but sharing real signal ("holiday",
    // "v3") — the user gets the best option pre-selected and flagged to review,
    // rather than starting from an empty mapping.
    const result = suggestAdNameMatch("holiday_v3_1080x1080.mp4", [
      "Holiday Bundle v3",
      "Winter Promo v1",
    ]);
    expect(result?.name).toBe("Holiday Bundle v3");
    expect(result?.method).toBe("guess");
  });

  it("returns null for completely unrelated filenames (no logical match)", () => {
    // Genuinely no shared signal — mapping this to any ad name would be noise,
    // not a "most logical" guess, so it stays unmapped.
    const result = suggestAdNameMatch("random_footage_xyz789.mov", [
      "Summer Sale v2",
      "Winter Promo v1",
    ]);
    expect(result).toBeNull();
  });

  it("returns null when there are no candidates", () => {
    expect(suggestAdNameMatch("anything.mp4", [])).toBeNull();
  });
});
