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

  it("returns null when an ID code is shared by 2+ candidates (ambiguous)", () => {
    const result = suggestAdNameMatch("creative-CR1234-final.mp4", [
      "Concept A [CR1234]",
      "Concept B [CR1234 remix]",
    ]);
    expect(result).toBeNull();
  });

  it("returns null for completely unrelated filenames", () => {
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
