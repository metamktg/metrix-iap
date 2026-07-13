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
  | "unknown";

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
  HK_Social:       "Open with social validation signals — numbers, reviews, community.",
  HK_Urgency:      "Create time or scarcity pressure from the first frame.",
  HK_Result:       "Show the end-state outcome as the opening hook.",
  HK_Contrast:     "Use a sharp before/after or comparison to create visual contrast.",
  HK_Challenge:    "Challenge a common belief or assumption to disrupt scroll behavior.",

  FW_PAS:             "Surface the problem, amplify the pain, then offer the solution.",
  FW_BAB:             "Show the before state, paint the after state, bridge with the product.",
  FW_AIDA:            "Capture attention, build interest, create desire, prompt action.",
  FW_StorySell:       "Narrative-driven structure with an emotional arc that ends in CTA.",
  FW_FeatureBenefit:  "Lead with a feature but always connect it to a concrete user benefit.",
  FW_Direct:          "No narrative — clear, direct response structure with offer-first copy.",

  TN_Aspirational:  "Speaks to who the user wants to become, not just what they need.",
  TN_Rational:      "Evidence-led, logical, data-driven copy without emotional language.",
  TN_Relatable:     "Conversational, peer-to-peer language that avoids corporate tone.",
  TN_Assertive:     "Confident, direct, no hedging — commands rather than suggests.",
  TN_Urgent:        "Creates a sense of time pressure or limited availability.",
  TN_Warm:          "Empathetic, supportive, community-focused language.",
  TN_Deadpan:       "Dry, matter-of-fact delivery — often works for contrast humor.",

  CN_ProductDemo:   "Demonstrates the product in use — performance proof in action.",
  CN_SocialProof:   "Draws credibility from user counts, reviews, or testimonials.",
  CN_FounderLed:    "Founder or operator tells the origin story — trust through authenticity.",
  CN_BehaviorShift: "Positions the product as enabling a behavior change.",
  CN_Comparison:    "Direct or indirect comparison against alternatives or status quo.",
  CN_UGC:           "Authentic user-generated content style for organic-feeling ads.",
  CN_Testimonial:   "Single user success story with before/after narrative.",
  CN_ValueProp:     "Leads with the core value exchange — what the product gives the user.",
};

// ─── Public resolvers ─────────────────────────────────────────────────

/**
 * Resolves a raw variable code to a human-readable label.
 * Falls back to stripping the prefix and formatting the remainder.
 */
export function resolveVariableLabel(code: string): string {
  if (!code) return code;
  if (LABELS[code]) return LABELS[code];
  // Fallback: strip prefix (e.g. "HK_"), split CamelCase, capitalize
  const parts = code.split("_");
  if (parts.length >= 2) {
    const remainder = parts.slice(1).join("_");
    return remainder
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .trim();
  }
  return code;
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
  const valid: VariablePrefix[] = ["HK", "TN", "FW", "CN", "PR", "CTA", "AW", "ST", "HP"];
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

/** Color class per prefix for badge styling */
export const PREFIX_COLORS: Record<VariablePrefix, string> = {
  HK:      "bg-blue-500/10 text-blue-300 border-blue-500/20",
  TN:      "bg-purple-500/10 text-purple-300 border-purple-500/20",
  FW:      "bg-teal-500/10 text-teal-300 border-teal-500/20",
  CN:      "bg-amber-500/10 text-amber-300 border-amber-500/20",
  PR:      "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  CTA:     "bg-primary/10 text-primary border-primary/20",
  AW:      "bg-rose-500/10 text-rose-300 border-rose-500/20",
  ST:      "bg-slate-500/10 text-slate-300 border-slate-500/20",
  HP:      "bg-orange-500/10 text-orange-300 border-orange-500/20",
  unknown: "bg-muted text-muted-foreground border-border/40",
};
