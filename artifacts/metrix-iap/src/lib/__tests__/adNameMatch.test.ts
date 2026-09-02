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

// ── Regression: bare-numeric ad names must never win via containment ──
// Real-account case: an ad literally named "1" auto-matched (method
// "fuzzy", score 0.75+) against SEVEN different cell-coded creative
// filenames because "1" is a substring of "_001_" / "1080x1350".
import { MIN_CONTAINMENT_LENGTH } from "@/lib/adNameMatch";

describe("suggestAdNameMatch minimum containment signal", () => {
  const cellCodedFile = "C1A_CN_ICP_CareerTransition_CN_Design_StaticBold_FW_PAS_TN_Emotional_HK_Problem_ST_TOFU_001_Meta_Feed_4x5_1080x1350.png";

  it('never confidently maps a file to an ad named "1"', () => {
    const match = suggestAdNameMatch(cellCodedFile, ["1"]);
    expect(match).toBeNull(); // no real signal — stays unmapped, user can map manually
  });

  it('prefers a real candidate over the bare-numeric one', () => {
    const match = suggestAdNameMatch("STAT_PEANUTHEAD.jpg", ["1", "STAT_PEANUTHEAD_79_ 01.jpg"]);
    expect(match?.name).toBe("STAT_PEANUTHEAD_79_ 01.jpg");
  });

  it("still containment-matches when both sides carry real length", () => {
    const match = suggestAdNameMatch("Summer_Sale_v2_final.mp4", ["Summer Sale v2"]);
    expect(match?.method).toBe("fuzzy");
    expect(match?.name).toBe("Summer Sale v2");
    expect("Summer Sale v2".length).toBeGreaterThanOrEqual(MIN_CONTAINMENT_LENGTH);
  });

  it("short ad names can still surface as a reviewable guess via token overlap", () => {
    // "v2" as a real token of the filename: token-set similarity keeps it as
    // a flagged guess (never a confident fuzzy) — honest middle ground.
    const match = suggestAdNameMatch("promo v2.mp4", ["v2"]);
    expect(match === null || match.method === "guess").toBe(true);
  });
});

// ── Cell codes are identifiers ──────────────────────────────────────────────
// The IAP naming convention puts the concept/variation code in both the ad
// name and the file name. On the first fresh-account run, "SKOV_C2B.png"
// had to land on the ad "C2B" and nowhere else, and two files that differ
// only by that code had to land on two different ads.

describe("suggestAdNameMatch — cell codes (C1A, C2B) decide the match", () => {
  const ADS = ["C1A SKOV2", "C2A SKOV2", "C2B", "C3B", "New Sales Ad"];

  it("routes a file to the one ad carrying its cell code, over a more similar-looking name", () => {
    expect(suggestAdNameMatch("SKOV_C2B.png", ADS)).toEqual({ name: "C2B", method: "id" });
    expect(suggestAdNameMatch("skov-c3b_9x16.mp4", ADS)).toEqual({ name: "C3B", method: "id" });
  });

  it("sends two files that differ only by code to two different ads", () => {
    expect(suggestAdNameMatch("SKOV_C2A_9x16.png", ADS)?.name).toBe("C2A SKOV2");
    expect(suggestAdNameMatch("SKOV_C2B_9x16.png", ADS)?.name).toBe("C2B");
  });

  it("keeps the similarity pass inside the code's owners when several ads share it", () => {
    const withVariant = ["C1A SKOV2", "C1A SKOV2 T2", "C2B"];
    expect(suggestAdNameMatch("SKOV_C1A_T2.png", withVariant)?.name).toBe("C1A SKOV2 T2");
    expect(suggestAdNameMatch("SKOV_C1A.png", withVariant)?.name).toBe("C1A SKOV2");
  });

  it("does not read an aspect token as a code", () => {
    expect(suggestAdNameMatch("hero_9x16.png", ["9x16 test", "Hero ad"])?.name).toBe("Hero ad");
  });

  it("returns at most a guess for a file that shares no real signal", () => {
    const r = suggestAdNameMatch("ChatGPT Image Jul 13, 2026, 04_13_34 PM.png", ["18118246642761770 - Jun 16, 2026", "C2B"]);
    expect(r === null || r.method === "guess").toBe(true);
  });
});
