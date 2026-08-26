// ─── Status semantics: one vocabulary out of many (E3) ────────────────
//
// At least five vocabularies reach the UI, none of them agreeing:
//
//   signal_cards.impact          high | medium | setup
//   data_quality_flags.kind      anomaly | quality_flag | attribution_window |
//                                data_quality_score        (tiered in the UI as
//                                act_now | watch | investigate)
//   signal_cards.confidence      high | medium | directional | system |
//                                validation_required, plus free-text compounds
//                                ("high for registration, directional for checkout")
//   icp_profiles.confidence_level  high | medium | low | hypothesis |
//                                insufficient | validation_required
//   reporting-cell flags         partial_reporting_cell | zero_conversions
//
// Every value above was read from the live database, not from a spec — the
// work order named several that do not occur (`critical`) and missed several
// that do (`setup`, `system`, `hypothesis`, `insufficient`, and the
// compounds).
//
// This projects them onto the three axes the design brief uses. It does NOT
// rewrite stored data: the raw value travels alongside the normalized one,
// and normalization happens at the READ boundary.
//
// ── The honesty rule that shapes every mapping below ──
//
// An unrecognized value normalizes to `null`, never to a default bucket.
// Silently bucketing an unknown status as "informational" would assert a
// priority nobody measured, and a surface reading null can fall back to
// showing the raw string — which is honest — whereas one reading a guessed
// bucket cannot tell it was guessed. Same reason E1 refuses to derive a
// headline from prose.

/** Design-brief priority axis. */
export type Priority = "critical" | "important" | "informational";

/** Design-brief confidence axis. `validation_required` collapses to `low`
 *  here, so `needsValidation` carries the distinction that would otherwise
 *  be lost — an unvalidated reading is not the same as a weak one. */
export type ConfidenceLevel = "high" | "medium" | "low";

export type NormalizedStatus = {
  priority: Priority | null;
  confidence: ConfidenceLevel | null;
  /** True when the value says the reading is not yet established. */
  needs_validation: boolean;
  /** Every raw input, unchanged, for the diagnostic layer. */
  raw: Record<string, string | null>;
};

const norm = (v: unknown): string => String(v ?? "").trim().toLowerCase();

// ── Priority ──────────────────────────────────────────────────────────

/** `signal_cards.impact` → priority. */
export function priorityFromImpact(impact: unknown): Priority | null {
  switch (norm(impact)) {
    case "high":
      return "critical";
    case "medium":
      return "important";
    case "low":
    case "setup":
      // `setup` is an onboarding card ("connect your account"), not a
      // finding about performance.
      return "informational";
    default:
      return null;
  }
}

/** `data_quality_flags.kind` → priority, matching the act_now/watch/
 *  investigate split the Ad Performance view already renders. */
export function priorityFromFlagKind(kind: unknown): Priority | null {
  switch (norm(kind)) {
    case "anomaly":
      return "critical";
    case "quality_flag":
      return "important";
    case "attribution_window":
    case "data_quality_score":
      return "informational";
    default:
      return null;
  }
}

/** The UI's signal tier vocabulary → priority. */
export function priorityFromTier(tier: unknown): Priority | null {
  switch (norm(tier)) {
    case "act_now":
      return "critical";
    case "watch":
      return "important";
    case "investigate":
      return "informational";
    default:
      return null;
  }
}

// ── Confidence ────────────────────────────────────────────────────────

/** Values that state the reading is not established, rather than weak. */
const NEEDS_VALIDATION = new Set(["validation_required", "hypothesis", "insufficient"]);

const DIRECT: Record<string, ConfidenceLevel> = {
  high: "high",
  medium: "medium",
  med: "medium",
  low: "low",
  // "Directional" claims a direction, not a magnitude — it is explicitly
  // weaker than a measured reading, so it lands low rather than medium.
  directional: "low",
  // The three below are collapsed to `low` and flagged; see NEEDS_VALIDATION.
  validation_required: "low",
  hypothesis: "low",
  insufficient: "low",
};

/** Ordering used only to take the weakest component of a compound value. */
const RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

/**
 * Any confidence vocabulary → `{ confidence, needs_validation }`.
 *
 * Compound free text ("high for registration, directional for checkout") is
 * real in this data and does not have one confidence. It resolves to the
 * WEAKEST level it mentions: overstating confidence is the failure that
 * costs a user money, and understating it costs them a second look.
 *
 * `system` is a provenance marker on setup cards, not a confidence claim at
 * all, so it returns null rather than being forced onto the scale.
 */
export function normalizeConfidenceValue(value: unknown): {
  confidence: ConfidenceLevel | null;
  needs_validation: boolean;
} {
  const v = norm(value);
  if (!v || v === "system") return { confidence: null, needs_validation: false };

  const direct = DIRECT[v];
  if (direct) return { confidence: direct, needs_validation: NEEDS_VALIDATION.has(v) };

  // Compound / free text: collect every level word present.
  const found: ConfidenceLevel[] = [];
  let flagged = false;
  for (const [token, level] of Object.entries(DIRECT)) {
    if (new RegExp(`\\b${token}\\b`).test(v)) {
      found.push(level);
      if (NEEDS_VALIDATION.has(token)) flagged = true;
    }
  }
  if (found.length === 0) return { confidence: null, needs_validation: false };
  const weakest = found.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
  return { confidence: weakest, needs_validation: flagged };
}

// ── Reporting-cell flags ──────────────────────────────────────────────

/**
 * Cell flags describe how complete a cell's REPORTING is, not how important
 * it is, so they resolve on the confidence axis and leave priority null.
 * Calling `zero_conversions` "critical" would invent an urgency the product
 * has never assigned it.
 */
export function normalizeCellFlag(flag: unknown): NormalizedStatus {
  const v = norm(flag);
  const raw = { flag: v || null };
  switch (v) {
    case "partial_reporting_cell":
      return { priority: null, confidence: "low", needs_validation: true, raw };
    case "zero_conversions":
      // A measured zero is a real reading, not a gap in it.
      return { priority: null, confidence: "high", needs_validation: false, raw };
    default:
      return { priority: null, confidence: null, needs_validation: false, raw };
  }
}

// ── Combined ──────────────────────────────────────────────────────────

/**
 * Normalize whatever axes a record carries. Absent inputs stay absent —
 * passing no impact yields `priority: null`, which is not the same claim as
 * "this is informational".
 */
export function normalizeStatus(input: {
  impact?: unknown;
  flagKind?: unknown;
  tier?: unknown;
  confidence?: unknown;
}): NormalizedStatus {
  const priority =
    priorityFromImpact(input.impact) ??
    priorityFromFlagKind(input.flagKind) ??
    priorityFromTier(input.tier);
  const { confidence, needs_validation } = normalizeConfidenceValue(input.confidence);
  return {
    priority,
    confidence,
    needs_validation,
    raw: {
      impact: input.impact === undefined ? null : norm(input.impact) || null,
      flag_kind: input.flagKind === undefined ? null : norm(input.flagKind) || null,
      tier: input.tier === undefined ? null : norm(input.tier) || null,
      confidence: input.confidence === undefined ? null : String(input.confidence ?? "").trim() || null,
    },
  };
}
