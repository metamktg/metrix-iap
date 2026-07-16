// ─── Normalization framework ──────────────────────────────────────────
// Strict, mechanical normalization rules for the three sources of
// first-layer cognitive load: compound analysis titles, free-text
// hierarchical entity references (Book → Concept → Row/Cell), and
// ad-hoc metric formatting. Every function here is a pure parser or
// reformatter over existing strings/numbers — nothing ever invents
// copy, and callers must keep the raw text reachable (title attr,
// DetailReveal, drawer) whenever a normalized form is shown.
//
// Rulebook:
// • TITLES — compound "Main — Qualifier" titles split at the FIRST
//   " — " (space, em-dash, space). Cards show `main` as the one-line
//   title and `qualifier` as a caption; the full compound stays in the
//   popover eyebrow / title attr. No em-dash → the whole string is main.
// • HIERARCHY REFS — strings that START with an entity reference
//   (BOOKn, Cn[A-Z], Row X, comma/slash lists) are parsed into
//   structured refs + a trailing annotation. Rendered as compact chips
//   ("B0 · C2 · Row B"); the annotation and raw string move behind the
//   reveal layer. Strings that don't lead with a ref are left alone
//   (parse returns null) — the caller falls back to deriveLabel.
// • METRICS — one precision table, keyed by metric kind:
//     usd_unit  (CPA/CPC/unit costs)  2dp below $1,000, 0dp above
//     usd_total (spend/budget/values) 0dp always
//     pct       (rates)               2dp below 10%, 1dp at/above; "0%" for exact zero
//     count     (impressions/results) rounded, thousands separators;
//                                     compact ("12.4K"/"1.2M") only via fmtCount(n, {compact:true})
// • CONFIDENCE — qualitative confidence strings normalize to a level
//   (high/medium/low/directional/unknown) + optional qualifier, with
//   explicit polarity: a qualifier mentioning failure flips the badge
//   negative no matter how "high" the confidence is.
// • VARIABLE CODES — prose that mentions prefixed variable codes
//   (HK_/TN_/FW_/CN_/PR_/CTA_/AW_/ST_/HP_) can surface those codes as
//   chips on the first layer via extractVariableCodes(); the sentence
//   itself is NEVER parsed into an action (hypothesis grammar is
//   unstable LLM prose) and must stay reachable behind the reveal.
// • ICP NAMES — chip display strips trailing parentheticals and
//   trailing " - …" qualifiers via compactIcpName(); the full name
//   stays in the title attr. Hyphenated words are never touched.

// ─── Titles ───────────────────────────────────────────────────────────

export interface SplitTitle {
  /** Primary segment before the first " — " (or the whole string). */
  main: string;
  /** Secondary segment after the first " — ", "" when absent. */
  qualifier: string;
}

export function splitTitle(title: string | null | undefined): SplitTitle {
  const t = (title ?? "").trim().replace(/\s+/g, " ");
  if (!t) return { main: "", qualifier: "" };
  const idx = t.indexOf(" — ");
  if (idx < 0) return { main: t, qualifier: "" };
  const main = t.slice(0, idx).trim();
  const qualifier = t.slice(idx + 3).trim();
  // Never split into a uselessly short main — keep the compound intact.
  if (main.length < 4) return { main: t, qualifier: "" };
  return { main, qualifier };
}

// ─── Hierarchical entity references ───────────────────────────────────

export interface HierarchyRef {
  /** e.g. "BOOK0" (undefined when the string leads with a bare cell code). */
  book?: string;
  /** e.g. "C2" or "C2B". */
  concept?: string;
  /** e.g. "B" (from "Row B"). */
  row?: string;
}

export interface ParsedHierarchyRef {
  refs: HierarchyRef[];
  /** Trailing free text after the refs, separators stripped. */
  annotation: string;
  /** The original input, untouched. */
  raw: string;
}

const BOOK_RE = /^BOOK(\d+)\b/i;
const CONCEPT_KEYWORD_RE = /^Concept\s+/i;
const CELL_RE = /^C(\d+)([A-Z])?\b/;
const ROW_RE = /^Row\s+([A-Z])\b/i;
const SEP_RE = /^\s*[,/&+]\s*|^\s+and\s+/i;

/**
 * Parse a free-text string that LEADS with hierarchy refs
 * ("BOOK0 Concept C2 (esp. Row B)", "BOOK2 C2E, C4E, C2F - note",
 * "C4C rational tone at scale", "C6/C7 concept definition …").
 * Returns null when the string doesn't start with a recognizable ref —
 * callers must then fall back to plain label derivation.
 */
export function parseHierarchyRef(input: string | null | undefined): ParsedHierarchyRef | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let rest = raw.replace(/\s+/g, " ");
  let book: string | undefined;

  const bm = rest.match(BOOK_RE);
  if (bm) {
    book = `BOOK${bm[1]}`;
    rest = rest.slice(bm[0].length).replace(/^\s+/, "");
    rest = rest.replace(CONCEPT_KEYWORD_RE, "");
  }

  const refs: HierarchyRef[] = [];
  // Consume a list of cell codes (optionally row-suffixed), separated by , / & + or "and".
  for (;;) {
    const cm = rest.match(CELL_RE);
    if (!cm) break;
    const ref: HierarchyRef = { book, concept: `C${cm[1]}${cm[2] ?? ""}` };
    rest = rest.slice(cm[0].length).replace(/^\s+/, "");
    const rm = rest.match(ROW_RE);
    if (rm) {
      ref.row = rm[1].toUpperCase();
      rest = rest.slice(rm[0].length).replace(/^\s+/, "");
    }
    refs.push(ref);
    const sm = rest.match(SEP_RE);
    if (!sm) break;
    const afterSep = rest.slice(sm[0].length).replace(/^\s+/, "");
    // Only continue the list when another cell code follows the separator;
    // otherwise the separator belongs to the annotation ("C3, all rows").
    if (!CELL_RE.test(afterSep)) break;
    rest = afterSep;
  }

  if (refs.length === 0) {
    // "BOOK0 Row B" (book with row but no cell) still counts as a ref.
    if (book) {
      const rm = rest.match(ROW_RE);
      if (rm) {
        refs.push({ book, row: rm[1].toUpperCase() });
        rest = rest.slice(rm[0].length).replace(/^\s+/, "");
      } else {
        refs.push({ book });
      }
    } else {
      return null;
    }
  }

  // Whatever remains is annotation: strip leading separators/dashes, and
  // unwrap a single all-enclosing parenthetical.
  let annotation = rest.replace(/^[\s,;:—–-]+/, "").trim();
  const paren = annotation.match(/^\((.*)\)$/s);
  if (paren) annotation = paren[1].trim();

  return { refs, annotation, raw };
}

/** Compact display form for one ref: "B0 · C2 · Row B". */
export function formatHierarchyRef(ref: HierarchyRef): string {
  const parts: string[] = [];
  if (ref.book) parts.push(ref.book.replace(/^BOOK/i, "B"));
  if (ref.concept) parts.push(ref.concept);
  if (ref.row) parts.push(`Row ${ref.row}`);
  return parts.join(" · ");
}

// ─── Variable codes ───────────────────────────────────────────────────

// Prefix-anchored with lookarounds (never \b — it fails between a digit
// and "_"), allowing multi-segment codes like CN_ICP_Achiever.
const VARIABLE_CODE_RE =
  /(?<![A-Za-z0-9_])(?:HK|TN|FW|CN|PR|CTA|AW|ST|HP)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*(?![A-Za-z0-9_])/g;

/**
 * Extract prefixed variable codes from free prose, deduplicated in
 * order of first appearance. Purely mechanical — never a grammar parse.
 * Callers must keep the untouched sentence reachable wherever the
 * extracted codes are shown instead.
 */
export function extractVariableCodes(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(VARIABLE_CODE_RE)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      out.push(m[0]);
    }
  }
  return out;
}

// ─── ICP names ────────────────────────────────────────────────────────

/**
 * Compact display form of an ICP/profile name: mechanically strips
 * trailing parentheticals and trailing " - …" qualifiers, repeatedly
 * ("BYOC Working Professional (C5) - pending full definition" →
 * "BYOC Working Professional"). Only dashes SURROUNDED by spaces are
 * qualifiers — hyphenated words ("Time-Poor", "55-64") are untouched.
 * Returns the original when stripping would leave nothing meaningful.
 */
export function compactIcpName(name: string | null | undefined): string {
  const full = (name ?? "").trim().replace(/\s+/g, " ");
  let s = full;
  for (;;) {
    const next = s
      .replace(/\s*\([^()]*\)$/, "")
      .replace(/\s+[-–—]\s+[^()]*$/, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  return s.length >= 4 ? s : full;
}

// ─── Metrics ──────────────────────────────────────────────────────────

export type MetricKind = "usd_unit" | "usd_total" | "pct" | "count";

function usd(n: number, digits: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Compact count: 12,437 → "12.4K"; 1,240,000 → "1.2M". Only ≥ 10,000. */
export function fmtCount(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n == null) return "—";
  const r = Math.round(n);
  if (opts?.compact && Math.abs(r) >= 10_000) {
    const abs = Math.abs(r);
    const [v, suffix] = abs >= 1_000_000 ? [r / 1_000_000, "M"] : [r / 1_000, "K"];
    const s = Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, "");
    return `${s}${suffix}`;
  }
  return r.toLocaleString("en-US");
}

/**
 * Single entry point for metric display precision. Callers pick the
 * KIND, the table picks the precision — no per-call-site digit choices.
 */
export function fmtMetric(kind: MetricKind, n: number | null | undefined): string {
  if (n == null) return "—";
  switch (kind) {
    case "usd_unit":
      return usd(n, Math.abs(n) < 1000 ? 2 : 0);
    case "usd_total":
      return usd(n, 0);
    case "pct": {
      if (n === 0) return "0%";
      return `${n.toFixed(Math.abs(n) >= 10 ? 1 : 2)}%`;
    }
    case "count":
      return fmtCount(n);
  }
}

// ─── Confidence ───────────────────────────────────────────────────────

export type ConfidenceLevel = "high" | "medium" | "low" | "directional" | "unknown";
export type ConfidencePolarity = "positive" | "neutral" | "negative";

export interface NormalizedConfidence {
  level: ConfidenceLevel;
  /** Parenthetical / trailing qualifier, e.g. "of failure". */
  qualifier: string;
  /** Display polarity: "high (of failure)" is NEGATIVE, not positive. */
  polarity: ConfidencePolarity;
  /** Short display label: the level, capitalized. */
  label: string;
}

const LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  directional: "Directional",
  unknown: "—",
};

export function normalizeConfidence(value: string | null | undefined): NormalizedConfidence {
  const raw = (value ?? "").trim();
  const v = raw.toLowerCase();
  let level: ConfidenceLevel = "unknown";
  if (/\bhigh\b|^high/.test(v)) level = "high";
  else if (/\bmedium\b|\bmed\b/.test(v)) level = "medium";
  else if (/\blow\b/.test(v)) level = "low";
  else if (/directional/.test(v)) level = "directional";

  // Qualifier: parenthetical anywhere, or the remainder after the level word.
  let qualifier = "";
  const paren = raw.match(/\(([^)]*)\)/);
  if (paren) qualifier = paren[1].trim();
  else if (level !== "unknown") {
    const m = raw.replace(/high|medium|med|low|directional/i, "").replace(/[\s:–—-]+/g, " ").trim();
    qualifier = m;
  }

  const negative = /fail|failure|risk|churn|loss/.test(qualifier.toLowerCase());
  const polarity: ConfidencePolarity = negative
    ? "negative"
    : level === "high"
      ? "positive"
      : "neutral";

  const label = level === "unknown" && raw ? raw : LEVEL_LABEL[level];
  return { level, qualifier, polarity, label };
}
