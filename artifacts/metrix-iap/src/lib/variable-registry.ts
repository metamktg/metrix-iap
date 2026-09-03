// ─── IAP Variable Registry ─────────────────────────────────────────────
// Resolves raw variable codes (HK_, TN_, FW_, CN_, PR_, CTA_) into
// human-readable labels, descriptions, and stack summaries.
// Raw codes are secondary; labels are always shown first.

export type VariablePrefix =
  | "HK"   // Hook
  | "TN"   // Tone
  | "FW"   // Framework
  | "CN"   // Concept
  | "PR"   // Proof type
  | "CTA"  // Call to action
  | "AW"   // Awareness level
  | "ST"   // Structure
  | "HP"   // Hook position
  | "ICP"  // Customer persona reference (ICP_BOOK0_Name) — not a creative family
  | "unknown";

// ─── Family order ────────────────────────────────────────────────────
//
// Every value here is taken from the DATA — the seed's variable_registry
// rows for prefix/family/status, and the variable_stack keys that actually
// appear in the bundle for `key`/`aliases`. An earlier version of this list
// was written from the prefix letters alone and got three things wrong:
//
//   · HP was labelled "Hook position". The registry says "Pain proof", and
//     the stacks that use it are keyed pain_proof.
//   · It invented keys hook_position, awareness and structure. The stacks
//     use st for structure, nothing at all for awareness, and pain_proof.
//   · It listed only the long key form. The bundle carries BOTH — hk and
//     hook, tn and tone, fw and framework, cn and concept, pr and proof,
//     hp and pain_proof — so a stack written in the short form resolved to
//     nothing and rendered as nine empty slots.
//
// Three families are registry_missing: AW, CTA and ST. That is a confirmed,
// documented gap ("no AW_ registry definition exists in the client library
// and no AW_ performance rows appear in any source export"), not an
// oversight, and it is a different fact from "this pillar did not set one".
// registryStatusFor reads it from the seed so a view can tell them apart.
//
// Pinned against the checked-in seed bundle by
// __tests__/variable-families-match-data.test.ts, because a list written
// from letters rather than data is exactly what went wrong before.

export interface VariableFamily {
  /** Canonical MessagePillar.variable_stack field name. */
  key: string;
  /** Other keys the same family appears under in real bundles. */
  aliases: string[];
  /** The code prefix, per the seed's variable_registry. */
  prefix: Exclude<VariablePrefix, "unknown">;
  /** Family name, verbatim from variable_registry.family. */
  label: string;
  /** Short form for a dense chip. */
  abbrev: string;
}

export const VARIABLE_FAMILIES: VariableFamily[] = [
  { key: "hook",       aliases: ["hk"], prefix: "HK",  label: "Hook",            abbrev: "HK" },
  { key: "tone",       aliases: ["tn"], prefix: "TN",  label: "Tone",            abbrev: "TN" },
  { key: "framework",  aliases: ["fw"], prefix: "FW",  label: "Framework",       abbrev: "FW" },
  { key: "structure",  aliases: ["st"], prefix: "ST",  label: "Structure",       abbrev: "ST" },
  { key: "concept",    aliases: ["cn"], prefix: "CN",  label: "Concept",         abbrev: "CN" },
  { key: "awareness",  aliases: ["aw"], prefix: "AW",  label: "Awareness level", abbrev: "AW" },
  { key: "pain_proof", aliases: ["hp"], prefix: "HP",  label: "Pain proof",      abbrev: "HP" },
  { key: "proof",      aliases: ["pr"], prefix: "PR",  label: "Proof type",      abbrev: "PR" },
  { key: "cta",        aliases: [],     prefix: "CTA", label: "Call to action",  abbrev: "CTA" },
];

/**
 * Reader-facing name for a `variable_family` value.
 *
 * WHY THIS EXISTS. The tables rendered the raw key with a CSS `capitalize`,
 * which is enough for "hook" → "Hook" and nothing else. The analysis engine
 * also emits `raw_token` — and that is NOT an error or an unclassified
 * bucket: it means the row aggregates an ad-name TOKEN (a substring of
 * `ad_name`) rather than a registry variable, which is why its impressions
 * are 0 and its CTR is not computable. On every manual-import account, where
 * nothing is mapped to the registry yet, EVERY variable row is one of these —
 * so the whole Family column read "Raw_token", an engineering word for a real
 * distinction the operator needs: this number came from the ad's name, not
 * from a classified creative variable.
 *
 * Unknown families are humanized rather than dropped: a family the registry
 * has never seen is still the truth about that row.
 */
export function variableFamilyLabel(family: string | null | undefined): string {
  if (!family) return "Unassigned";
  const key = family.trim().toLowerCase();
  if (key === "raw_token") return "Ad-name token";
  const known = VARIABLE_FAMILIES.find((f) => f.key === key || f.aliases.includes(key));
  if (known) return known.label;
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * A family's value in a stack, looked up under its canonical key and every
 * alias. Returns null when the family is unset — never an empty string,
 * which a caller would otherwise render as a set-but-blank variable.
 */
export function stackValue(
  stack: Record<string, string | null | undefined>,
  family: VariableFamily,
): string | null {
  for (const k of [family.key, ...family.aliases]) {
    const v = stack[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** Family for a code, by its prefix. Null when the code does not parse. */
export function familyForCode(code: string): VariableFamily | null {
  const p = getVariablePrefix(code);
  return VARIABLE_FAMILIES.find((f) => f.prefix === p) ?? null;
}

/**
 * Whether the client library defines this family at all, per the seed's
 * variable_registry. "registry_missing" is a confirmed gap with a stated
 * reason — a stack slot that is empty because no definition exists is a
 * different fact from one the author left unset, and only the registry
 * can tell them apart. Null when the seed carried no registry.
 */
export function registryStatusFor(
  registry: { prefix: string; status: string; note?: string | null }[] | undefined,
  family: VariableFamily,
): { status: string; note: string | null } | null {
  const row = registry?.find((r) => r.prefix === family.prefix);
  return row ? { status: row.status, note: row.note ?? null } : null;
}

// ─── Label registry ──────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  // Hooks
  HK_ProofFirst:  "Proof-First Hook",
  HK_Benefit:     "Benefit Hook",
  HK_Problem:     "Problem Hook",
  HK_Curiosity:   "Curiosity Hook",
  HK_Authority:   "Authority Hook",
  HK_Social:      "Social Proof Hook",
  HK_Urgency:     "Urgency Hook",
  HK_Challenge:   "Challenge Hook",
  HK_Result:      "Result Hook",
  HK_Contrast:    "Contrast Hook",

  // Frameworks
  FW_PAS:              "Problem-Agitate-Solve",
  FW_BAB:              "Before-After-Bridge",
  FW_AIDA:             "Attention-Interest-Desire-Action",
  FW_ProblemSolution:  "Problem-Solution",
  FW_StorySell:        "Story-Sell",
  FW_FeatureBenefit:   "Feature-Benefit",
  FW_Direct:           "Direct Response",

  // Tones
  TN_Assertive:    "Assertive Tone",
  TN_Rational:     "Rational Tone",
  TN_Relatable:    "Relatable Tone",
  TN_Aspirational: "Aspirational Tone",
  TN_Deadpan:      "Deadpan Tone",
  TN_Warm:         "Warm Tone",
  TN_Urgent:       "Urgent Tone",

  // Concepts
  CN_ProductDemo:   "Product Demo",
  CN_SocialProof:   "Social Proof",
  CN_BehaviorShift: "Behavior Shift",
  CN_ValueProp:     "Value Proposition",
  CN_Comparison:    "Comparison",
  CN_FounderLed:    "Founder Story",
  CN_UGC:           "User-Generated Content",
  CN_Testimonial:   "Testimonial",

  // Proof types
  PR_VisualDemo:    "Visual Demo Proof",
  PR_Screenshot:    "Screenshot Proof",
  PR_ResultsGraph:  "Results Graph",
  PR_BeforeAfter:   "Before-After",
  PR_ThirdParty:    "Third-Party Validation",

  // CTAs
  CTA_StartFree:  "Start Free",
  CTA_TryFree:    "Try Free",
  CTA_LearnMore:  "Learn More",
  CTA_GetStarted: "Get Started",
  CTA_ClaimOffer: "Claim Offer",
  CTA_ShopNow:    "Shop Now",
  CTA_QuizStart:  "Take Quiz",
  CTA_MessageUs:  "Message Us",
};

// ─── Description registry ─────────────────────────────────────────────

const DESCRIPTIONS: Record<string, string> = {
  HK_Authority:    "Lead with credibility signals to establish trust before the pitch.",
  HK_Benefit:      "Open with the primary benefit or outcome the user gains.",
  HK_Problem:      "Surface a pain point immediately to create identification.",
  HK_Curiosity:    "Open with an incomplete loop that compels the viewer to keep watching.",
  HK_ProofFirst:   "Lead with a result or testimonial before any claim.",
  HK_Social:       "Open with social validation signals. Numbers, reviews, community.",
  HK_Urgency:      "Create time or scarcity pressure from the first frame.",
  HK_Result:       "Show the end-state outcome as the opening hook.",
  HK_Contrast:     "Use a sharp before/after or comparison to create visual contrast.",
  HK_Challenge:    "Challenge a common belief or assumption to disrupt scroll behavior.",

  FW_PAS:             "Surface the problem, amplify the pain, then offer the solution.",
  FW_BAB:             "Show the before state, paint the after state, bridge with the product.",
  FW_AIDA:            "Capture attention, build interest, create desire, prompt action.",
  FW_StorySell:       "Narrative-driven structure with an emotional arc that ends in CTA.",
  FW_FeatureBenefit:  "Lead with a feature but always connect it to a concrete user benefit.",
  FW_Direct:          "No narrative · clear, direct response structure with offer-first copy.",

  TN_Aspirational:  "Speaks to who the user wants to become, not just what they need.",
  TN_Rational:      "Evidence-led, logical, data-driven copy without emotional language.",
  TN_Relatable:     "Conversational, peer-to-peer language that avoids corporate tone.",
  TN_Assertive:     "Confident, direct, no hedging, commands rather than suggests.",
  TN_Urgent:        "Creates a sense of time pressure or limited availability.",
  TN_Warm:          "Empathetic, supportive, community-focused language.",
  TN_Deadpan:       "Dry, matter-of-fact delivery, often works for contrast humor.",

  CN_ProductDemo:   "Demonstrates the product in use. Performance proof in action.",
  CN_SocialProof:   "Draws credibility from user counts, reviews, or testimonials.",
  CN_FounderLed:    "Founder or operator tells the origin story. Trust through authenticity.",
  CN_BehaviorShift: "Positions the product as enabling a behavior change.",
  CN_Comparison:    "Direct or indirect comparison against alternatives or status quo.",
  CN_UGC:           "Authentic user-generated content style for organic-feeling ads.",
  CN_Testimonial:   "Single user success story with before/after narrative.",
  CN_ValueProp:     "Leads with the core value exchange. What the product gives the user.",
};

// ─── Public resolvers ─────────────────────────────────────────────────

/**
 * Resolves a raw variable code to a human-readable label.
 * Falls back to stripping the prefix and formatting the remainder.
 */
export function resolveVariableLabel(code: string): string {
  if (!code) return code;
  if (LABELS[code]) return LABELS[code];
  const parts = code.split("_");
  // ICP codes are ICP_<BOOKn>_<PersonaName>: the persona name is the label;
  // the book id and raw code belong in the title attr at the call site, not
  // on the chip face.
  if (parts[0] === "ICP" && parts.length >= 3) {
    return camelSplit(parts[parts.length - 1]!);
  }
  // Fallback: strip prefix (e.g. "HK_"), split CamelCase
  if (parts.length >= 2) {
    return parts.slice(1).map(camelSplit).join(" ").trim();
  }
  return code;
}

/**
 * "MaleEfficiencyPocket" → "Male Efficiency Pocket", keeping acronym runs
 * intact ("BOOK0" stays "BOOK0"). A space before EVERY capital — the old
 * fallback — turned any all-caps segment into spaced-out letters
 * ("B O O K0"), which is what an ICP chip rendered before this existed.
 */
function camelSplit(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

/**
 * Returns a short operational description for a variable code.
 */
export function resolveVariableDescription(code: string): string {
  return DESCRIPTIONS[code] ?? "";
}

/**
 * Resolves an array of codes into a joined label string.
 * e.g. ["HK_Authority", "TN_Aspirational"] → "Authority Hook + Aspirational Tone"
 */
export function resolveVariableStackLabel(codes: string[]): string {
  return codes.map(resolveVariableLabel).join(" + ");
}

/**
 * Returns the prefix category for a variable code.
 */
export function getVariablePrefix(code: string): VariablePrefix {
  const prefix = code.split("_")[0] as VariablePrefix;
  const valid: VariablePrefix[] = ["HK", "TN", "FW", "CN", "PR", "CTA", "AW", "ST", "HP", "ICP"];
  return valid.includes(prefix) ? prefix : "unknown";
}

/**
 * Replaces known variable codes embedded in prose text with their
 * human-readable labels. Longer codes are matched first to prevent
 * partial replacements (e.g. CTA_StartFree before CTA_Start).
 */
export function resolveInlineVariableCodes(text: string): string {
  if (!text) return text;
  const sorted = Object.keys(LABELS).sort((a, b) => b.length - a.length);
  let result = text;
  for (const code of sorted) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "g"),
      LABELS[code],
    );
  }
  return result;
}

// ─── Variable-family chips ────────────────────────────────────────────
//
// Every family gets the SAME chip. That is a deliberate reversal, and the
// reason is that the previous map could not do what it claimed.
//
// It assigned nine families across five hues, so CN and HP were byte-for-byte
// identical and TN and CTA differed only in their text colour — two pairs of
// families the palette said were different and painted the same. Four of the
// nine also wore reserved status colours: PR was status-success and AW was
// status-danger, which on a performance dashboard reads as a verdict on the
// variable rather than a name for it. "Proof" is not good news and "awareness"
// is not a failure.
//
// Nine categories is more than the validated categorical scale carries (five
// slots, and a sixth is never a generated hue), so colour cannot separate
// these at all. It does not need to: the chip always renders the code, and
// the two-letter prefix in mono is both unambiguous and faster to scan than
// nine near-tints would be. Colour here lifts the chip off the surface; the
// text carries the identity.
//
// Pinned by lib/__tests__/variable-chip-tokens.test.ts.
const VARIABLE_CHIP = "bg-foreground/[0.06] text-foreground/85 border-border/45";

/**
 * Chip classes for a variable code's family. Keyed by prefix so call sites
 * read as they always did; every prefix resolves to the same treatment.
 */
export const PREFIX_COLORS: Record<VariablePrefix, string> = {
  HK: VARIABLE_CHIP,
  TN: VARIABLE_CHIP,
  FW: VARIABLE_CHIP,
  CN: VARIABLE_CHIP,
  PR: VARIABLE_CHIP,
  CTA: VARIABLE_CHIP,
  AW: VARIABLE_CHIP,
  ST: VARIABLE_CHIP,
  HP: VARIABLE_CHIP,
  ICP: VARIABLE_CHIP,
  /** Not a family — the code did not parse. Recessive on purpose. */
  unknown: "bg-foreground/[0.03] text-muted-foreground border-border/30",
};