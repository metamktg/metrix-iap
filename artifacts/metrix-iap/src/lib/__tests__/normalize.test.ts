// ─── normalize.ts export smoke-test + unit tests ──────────────────────
//
// Guards against two failure modes in the normalization framework:
//   1. A deleted export — caught by the export-set equality check with a
//      clear list of which names are missing or unexpectedly added.
//   2. A null-returning or broken stub accidentally introduced during a
//      refactor — caught by calling each utility with representative
//      inputs and asserting the return shape is non-null and structurally
//      correct.
//
// Type-only exports (interfaces / type aliases: SplitTitle, HierarchyRef,
// ParsedHierarchyRef, NormalizedConfidence, MetricKind, ConfidenceLevel,
// ConfidencePolarity) are erased at compile time and are intentionally
// absent from the RUNTIME_EXPORTS list.
//
// normalize.ts has no React components or context dependencies, so all
// checks here are plain vitest assertions — no RTL rendering required.
//
// Functional tests use REAL strings from the live seed data (pillar
// titles, scaling playbook lanes, variable-combination contexts) —
// never invented shapes.

import { describe, it, expect } from "vitest";
import * as normalize from "../normalize";
import {
  splitTitle,
  parseHierarchyRef,
  formatHierarchyRef,
  fmtMetric,
  fmtCount,
  normalizeConfidence,
  extractVariableCodes,
  compactIcpName,
  fmtDelta,
  humanizeEnum,
} from "../normalize";

// ─── 1. Export-set equality ───────────────────────────────────────────
// Fails loudly if a name is added or removed without updating this list.

const RUNTIME_EXPORTS: Array<keyof typeof normalize> = [
  "splitTitle",
  "fmtDelta",
  "humanizeEnum",
  "parseHierarchyRef",
  "formatHierarchyRef",
  "extractVariableCodes",
  "compactIcpName",
  "fmtCount",
  "fmtMetric",
  "fmtDay",
  "fmtDayRange",
  "normalizeConfidence",
];

describe("normalize.ts exports — set equality", () => {
  it("exports the expected set of runtime names (no missing, no extras)", () => {
    const actual = Object.keys(normalize);
    const missing = RUNTIME_EXPORTS.filter((name) => !actual.includes(name));
    const extras = actual.filter(
      (name) => !RUNTIME_EXPORTS.includes(name as keyof typeof normalize),
    );
    expect(missing, `Missing exports: ${missing.join(", ")}`).toHaveLength(0);
    expect(
      extras,
      `Unexpected new exports (add them to RUNTIME_EXPORTS): ${extras.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ─── 2. Binding checks ────────────────────────────────────────────────
// Guards every export against being set to null or undefined.

describe("normalize.ts exports — binding checks", () => {
  it.each(RUNTIME_EXPORTS)("%s is defined and non-null", (name) => {
    expect(normalize[name]).toBeDefined();
    expect(normalize[name]).not.toBeNull();
  });
});

describe("splitTitle", () => {
  it("splits compound em-dash titles at the first ' — '", () => {
    expect(splitTitle("Time-Poverty Product Demo — Registration Engine")).toEqual({
      main: "Time-Poverty Product Demo",
      qualifier: "Registration Engine",
    });
    expect(splitTitle("Aspirational Authority — Checkout-Stage Identity Bridge")).toEqual({
      main: "Aspirational Authority",
      qualifier: "Checkout-Stage Identity Bridge",
    });
  });

  it("keeps only the FIRST em-dash as the split point", () => {
    expect(splitTitle("A Long Main — Part One — Part Two")).toEqual({
      main: "A Long Main",
      qualifier: "Part One — Part Two",
    });
  });

  it("returns the whole string as main when there is no em-dash", () => {
    expect(splitTitle("15-Minute Time Efficiency")).toEqual({
      main: "15-Minute Time Efficiency",
      qualifier: "",
    });
  });

  it("does not split hyphenated words or tight em-dashes", () => {
    expect(splitTitle("Value-Stack Price Comparison").main).toBe("Value-Stack Price Comparison");
    expect(splitTitle("A—B").main).toBe("A—B");
  });

  it("handles null/empty and collapses whitespace", () => {
    expect(splitTitle(null)).toEqual({ main: "", qualifier: "" });
    expect(splitTitle("  Main Title   —  Qualifier ")).toEqual({ main: "Main Title", qualifier: "Qualifier" });
  });

  it("keeps very short mains attached to the compound", () => {
    expect(splitTitle("X — Y")).toEqual({ main: "X — Y", qualifier: "" });
  });
});

describe("parseHierarchyRef", () => {
  it("parses BOOK + Concept keyword + parenthetical annotation", () => {
    const p = parseHierarchyRef("BOOK0 Concept C2 (esp. Row B)")!;
    expect(p.refs).toEqual([{ book: "BOOK0", concept: "C2" }]);
    expect(p.annotation).toBe("esp. Row B");
    expect(p.raw).toBe("BOOK0 Concept C2 (esp. Row B)");
  });

  it("parses lettered cell codes", () => {
    const p = parseHierarchyRef("BOOK2 Concept C2B")!;
    expect(p.refs).toEqual([{ book: "BOOK2", concept: "C2B" }]);
    expect(p.annotation).toBe("");
  });

  it("parses bare book+cell", () => {
    expect(parseHierarchyRef("BOOK0 C1")!.refs).toEqual([{ book: "BOOK0", concept: "C1" }]);
  });

  it("parses comma-lists sharing the book, with dash annotation", () => {
    const p = parseHierarchyRef("BOOK2 C2E, C4E, C2F - structurally underperforming extension cells")!;
    expect(p.refs).toEqual([
      { book: "BOOK2", concept: "C2E" },
      { book: "BOOK2", concept: "C4E" },
      { book: "BOOK2", concept: "C2F" },
    ]);
    expect(p.annotation).toBe("structurally underperforming extension cells");
  });

  it("parses Row suffixes", () => {
    const p = parseHierarchyRef("BOOK0 C2 Row B")!;
    expect(p.refs).toEqual([{ book: "BOOK0", concept: "C2", row: "B" }]);
    expect(p.annotation).toBe("");
  });

  it("keeps ', all rows' as annotation, not a list continuation", () => {
    const p = parseHierarchyRef("BOOK0 C3, all rows")!;
    expect(p.refs).toEqual([{ book: "BOOK0", concept: "C3" }]);
    expect(p.annotation).toBe("all rows");
  });

  it("keeps combined parenthetical + dash annotations", () => {
    const p = parseHierarchyRef("BOOK0 C3 (any variation) - zero conversions on real spend")!;
    expect(p.refs).toEqual([{ book: "BOOK0", concept: "C3" }]);
    expect(p.annotation).toBe("(any variation) - zero conversions on real spend");
  });

  it("parses leading bare cell codes without a book", () => {
    const p = parseHierarchyRef("C4C rational tone at scale")!;
    expect(p.refs).toEqual([{ book: undefined, concept: "C4C" }]);
    expect(p.annotation).toBe("rational tone at scale");
  });

  it("parses slash lists of bare cells", () => {
    const p = parseHierarchyRef("C6/C7 concept definition and formal MST inclusion (pending your input)")!;
    expect(p.refs).toEqual([
      { book: undefined, concept: "C6" },
      { book: undefined, concept: "C7" },
    ]);
    expect(p.annotation).toMatch(/^concept definition/);
  });

  it("returns null for strings that do not lead with a ref", () => {
    expect(parseHierarchyRef("Male 55-64 / 35-44 dedicated creative")).toBeNull();
    expect(parseHierarchyRef("Audience Network 'Native, banner & interstitial' placement - reach without quality")).toBeNull();
    expect(parseHierarchyRef("")).toBeNull();
    expect(parseHierarchyRef(null)).toBeNull();
  });

  it("does not treat mid-word C-tokens as cells (C5 BYOC case parses C5 only)", () => {
    const p = parseHierarchyRef("C5 BYOC (needs full A-D funding)")!;
    expect(p.refs).toEqual([{ book: undefined, concept: "C5" }]);
    expect(p.annotation).toBe("BYOC (needs full A-D funding)");
  });
});

describe("formatHierarchyRef", () => {
  it("renders compact chip text", () => {
    expect(formatHierarchyRef({ book: "BOOK0", concept: "C2", row: "B" })).toBe("B0 · C2 · Row B");
    expect(formatHierarchyRef({ book: "BOOK2", concept: "C2B" })).toBe("B2 · C2B");
    expect(formatHierarchyRef({ concept: "C4C" })).toBe("C4C");
  });
});

describe("fmtMetric", () => {
  it("usd_unit: 2dp under $1,000, 0dp above", () => {
    expect(fmtMetric("usd_unit", 7.09)).toBe("$7.09");
    expect(fmtMetric("usd_unit", 999.994)).toBe("$999.99");
    expect(fmtMetric("usd_unit", 1400)).toBe("$1,400");
  });

  it("usd_total: always 0dp", () => {
    expect(fmtMetric("usd_total", 2963.4)).toBe("$2,963");
    expect(fmtMetric("usd_total", 12.75)).toBe("$13");
  });

  it("pct: 1dp at/above 10, 2dp below, bare 0% for exact zero", () => {
    expect(fmtMetric("pct", 15.06)).toBe("15.1%");
    expect(fmtMetric("pct", 21.77)).toBe("21.8%");
    expect(fmtMetric("pct", 5.678)).toBe("5.68%");
    expect(fmtMetric("pct", 0)).toBe("0%");
  });

  it("count: rounded with separators", () => {
    expect(fmtMetric("count", 12437.4)).toBe("12,437");
  });

  it("null → em dash", () => {
    expect(fmtMetric("usd_unit", null)).toBe("—");
    expect(fmtMetric("pct", undefined)).toBe("—");
  });
});

describe("fmtCount compact", () => {
  it("compacts only at/above 10K", () => {
    expect(fmtCount(9_999, { compact: true })).toBe("9,999");
    expect(fmtCount(12_437, { compact: true })).toBe("12.4K");
    expect(fmtCount(1_240_000, { compact: true })).toBe("1.2M");
    expect(fmtCount(210_000, { compact: true })).toBe("210K");
  });
});

describe("normalizeConfidence", () => {
  it("maps plain levels with positive/neutral polarity", () => {
    expect(normalizeConfidence("high")).toMatchObject({ level: "high", polarity: "positive", label: "High" });
    expect(normalizeConfidence("medium")).toMatchObject({ level: "medium", polarity: "neutral", label: "Medium" });
    expect(normalizeConfidence("directional")).toMatchObject({ level: "directional", polarity: "neutral" });
  });

  it("flips polarity negative for failure qualifiers, keeping the qualifier", () => {
    const c = normalizeConfidence("high(of failure)");
    expect(c.level).toBe("high");
    expect(c.qualifier).toBe("of failure");
    expect(c.polarity).toBe("negative");
    expect(c.label).toBe("High");
  });

  it("keeps an unknown value's own words, in reader casing", () => {
    // REVISED 2026-08-29. The claim is unchanged — an unrecognized value is
    // real and must never be discarded — but the label now reaches the reader
    // sentence-cased instead of verbatim. The defect this fixes: the seed
    // carries `validation_required` ("the reading is not yet established"),
    // and it rendered inside confidence badges on the MST and Creative DNA
    // surfaces in raw snake_case.
    const spaced = normalizeConfidence("validation required");
    expect(spaced.level).toBe("unknown");
    expect(spaced.label).toBe("Validation required");

    const raw = normalizeConfidence("validation_required");
    expect(raw.level).toBe("unknown");
    expect(raw.label).toBe("Validation required");
    // The words survive; only the casing and the underscore are presentation.
    expect(raw.label.toLowerCase().replace(/ /g, "_")).toBe("validation_required");
  });

  it("handles empty", () => {
    expect(normalizeConfidence("").level).toBe("unknown");
    expect(normalizeConfidence(null).label).toBe("—");
  });
});

describe("extractVariableCodes", () => {
  it("extracts prefixed codes from real hypothesis sentences", () => {
    expect(
      extractVariableCodes(
        "Replacing FW_BAB (the C2B control framework) with FW_PAS in the Time-Poor Learner column",
      ),
    ).toEqual(["FW_BAB", "FW_PAS"]);
    expect(
      extractVariableCodes(
        "Replacing TN_Rational (the C2B tone) with TN_Aspirational (the C4E winning tone) within the product-demo stack",
      ),
    ).toEqual(["TN_Rational", "TN_Aspirational"]);
    expect(
      extractVariableCodes(
        "Introducing PR_Testimonial alongside PR_AuthorityBookCover (the C4E winning proof)",
      ),
    ).toEqual(["PR_Testimonial", "PR_AuthorityBookCover"]);
  });

  it("handles slash/plus separated code runs and dedupes repeats", () => {
    expect(
      extractVariableCodes(
        "Emotional gift-moment narrative (HK_Story/HK_Shock + TN_Emotional vs TN_Emotional)",
      ),
    ).toEqual(["HK_Story", "HK_Shock", "TN_Emotional"]);
  });

  it("matches multi-segment codes but never inner fragments", () => {
    expect(extractVariableCodes("targets CN_ICP_Achiever directly")).toEqual(["CN_ICP_Achiever"]);
    // ICP_ WAS deliberately unregistered here; the cost showed up on screen
    // as "C2 concept (ICP_BOOK0_C2_TimePoorLearner): …" — a raw machine id
    // sitting inline in why-panel prose. It is a token now, and it must
    // match as ONE whole id — never as inner fragments of itself.
    expect(extractVariableCodes("a creative for ICP_BOOK0_MaleEfficiencyPocket")).toEqual([
      "ICP_BOOK0_MaleEfficiencyPocket",
    ]);
  });

  it("returns empty for prose without codes, null, and undefined", () => {
    expect(extractVariableCodes("Geo-specific city pride works only when paired with proof")).toEqual([]);
    expect(extractVariableCodes(null)).toEqual([]);
    expect(extractVariableCodes(undefined)).toEqual([]);
  });
});

describe("compactIcpName", () => {
  it("strips trailing parentheticals from real ICP names", () => {
    expect(compactIcpName("Quiz-gate registration completer (BOOK2, C2B)")).toBe(
      "Quiz-gate registration completer",
    );
    expect(
      compactIcpName("Male 55-64 / Male 35-44 efficiency pocket (cross-cut, not yet a dedicated ICP)"),
    ).toBe("Male 55-64 / Male 35-44 efficiency pocket");
    expect(compactIcpName("Busy Parent / Time-Poor Learner (C2)")).toBe(
      "Busy Parent / Time-Poor Learner",
    );
  });

  it("strips trailing spaced-dash qualifiers, repeatedly with parentheticals", () => {
    expect(compactIcpName("BYOC Working Professional (C5) - pending full definition")).toBe(
      "BYOC Working Professional",
    );
  });

  it("never touches hyphenated words or numeric ranges", () => {
    expect(compactIcpName("Time-Poor Learner")).toBe("Time-Poor Learner");
    expect(compactIcpName("Male 55-64 pocket")).toBe("Male 55-64 pocket");
  });

  it("returns the original when stripping would leave nothing meaningful", () => {
    expect(compactIcpName("(C2)")).toBe("(C2)");
    expect(compactIcpName("")).toBe("");
  });
});

describe("fmtDelta", () => {
  it("returns null for an unmeasured change, so a caller cannot default it to 0%", () => {
    expect(fmtDelta(null)).toBeNull();
    expect(fmtDelta(undefined)).toBeNull();
    expect(fmtDelta(NaN)).toBeNull();
  });

  it("keeps a measured zero, which is a different fact from unmeasured", () => {
    // And carries no "+" — there is no direction to signal.
    expect(fmtDelta(0)).toBe("0.0%");
  });

  it("signs a rise and a fall", () => {
    expect(fmtDelta(4.2)).toBe("+4.2%");
    expect(fmtDelta(-4.2)).toBe("-4.2%");
  });

  it("scales precision: one decimal under 10%, none above", () => {
    expect(fmtDelta(9.94)).toBe("+9.9%");
    expect(fmtDelta(12.5)).toBe("+13%");
    expect(fmtDelta(-240)).toBe("-240%");
  });

  it("returns one string, not a sign and a number to be concatenated", () => {
    // Built inline in JSX this rendered as three adjacent text nodes, so the
    // value was not addressable as a single string — by a test, or by a
    // reader's find-in-page.
    expect(typeof fmtDelta(12.5)).toBe("string");
  });
});

describe("humanizeEnum", () => {
  it("turns the raw generation statuses into readable chips", () => {
    // THE BUG: STATUS_LABEL knew five statuses, the generation engine
    // started writing three new ones, and the fallback printed the raw
    // enum — GENERATED_MEDIUM sat on screen in an uppercase chip reading
    // as leftover debug output. The fallback decides whether a stale map
    // fails quietly or embarrassingly.
    expect(humanizeEnum("generated_medium")).toBe("Generated · Medium");
    expect(humanizeEnum("generated_high")).toBe("Generated · High");
    expect(humanizeEnum("generated_p1")).toBe("Generated · P1");
  });

  it("reads a plain multi-word enum as a sentence-case phrase", () => {
    expect(humanizeEnum("needs_review")).toBe("Needs review");
    expect(humanizeEnum("user_overridden")).toBe("User overridden");
  });

  it("never invents copy — output words are segments of the input", () => {
    expect(humanizeEnum("draft")).toBe("Draft");
    expect(humanizeEnum("")).toBe("");
    expect(humanizeEnum(null)).toBe("");
    expect(humanizeEnum(undefined)).toBe("");
  });
});

describe("extractVariableCodes — ICP ids", () => {
  it("extracts ICP_* ids from prose alongside variable codes", () => {
    // "C2 concept (ICP_BOOK0_C2_TimePoorLearner): $7.09 CPA" rendered the
    // raw id inline in the why-panel prose. The tokenizer already chips
    // every variable family; ICP ids are the same kind of machine token
    // and get the same treatment.
    const codes = extractVariableCodes(
      "C2 concept (ICP_BOOK0_C2_TimePoorLearner) with HK_PROBLEM opener",
    );
    expect(codes).toContain("ICP_BOOK0_C2_TimePoorLearner");
    expect(codes).toContain("HK_PROBLEM");
  });
});
