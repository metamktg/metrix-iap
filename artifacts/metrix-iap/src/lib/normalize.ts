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
  /(?<![A-Za-z0-9_])(?:HK|TN|FW|CN|PR|CTA|AW|ST|HP|ICP)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*(?![A-Za-z0-9_])/g;

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

// ─── Enum humanization ────────────────────────────────────────────────

/**
 * Human form of a machine enum: "generated_medium" → "Generated · Medium",
 * "needs_review" → "Needs review".
 *
 * WHY THIS EXISTS
 * The brief list rendered `STATUS_LABEL[b.status] ?? b.status`. The map
 * knew five statuses; the generation engine had started writing three new
 * ones, and the fallback printed the raw value — so GENERATED_MEDIUM sat
 * on screen in an uppercase chip, reading as leftover debug output. A
 * lookup map goes stale the day upstream grows a value; the FALLBACK is
 * what decides whether that failure is quiet or embarrassing.
 *
 * Mechanical only: split on underscores, capitalize the first segment.
 * When the enum's leading segment is a recognised qualifier pattern
 * ("generated_high") the tail reads as a grade, joined with a middot.
 * Never invents copy — every output word is a segment of the input.
 */
export function humanizeEnum(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(/_+/).filter(Boolean);
  if (parts.length === 0) return raw;
  const cap = (w: string) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w);
  if (parts.length === 2 && /^(high|medium|low|p\d+)$/i.test(parts[1]!)) {
    return `${cap(parts[0]!)} · ${cap(parts[1]!)}`;
  }
  return cap(parts.join(" ").toLowerCase());
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

/**
 * A signed change, as ONE string.
 *
 * Two separate reasons this is a function and not `{sign}{n.toFixed(1)}%`
 * inline:
 *
 *   · A null is not a zero. "Nothing changed" and "we did not measure the
 *     change" are different facts, and returning null forces the caller to
 *     decide what to render rather than defaulting to "0%".
 *   · Built inline in JSX it renders as three adjacent text nodes, so the
 *     value is not addressable as one string — a test looking for "+12.5%"
 *     finds nothing, and so does a reader's find-in-page.
 *
 * It carries the SIGN and no verdict. Whether a rise is good depends on the
 * metric, and this function is not told which metric it is.
 */
export function fmtDelta(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  // No leading "+" on zero — there is no direction to signal.
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(Math.abs(n) < 10 ? 1 : 0)}%`;
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

  // An unrecognized value is still a real value — never discard it — but it
  // must not reach the reader in engineering casing. `validation_required`
  // ("the reading is not yet established") is a real confidence state the
  // seed carries, and it rendered verbatim inside confidence badges on the
  // MST and Creative DNA surfaces. Humanize the token; keep the words.
  const label =
    level === "unknown" && raw
      ? raw.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
      : LEVEL_LABEL[level];
  return { level, qualifier, polarity, label };
}

// ─── Calendar days vs instants ────────────────────────────────────────
//
// The platform stores two different kinds of time and they must not be
// rendered the same way.
//
// `date_start`, `date_end`, `window_start`, `window_end` are Postgres
// `date` columns. They arrive as "YYYY-MM-DD" and mean a CALENDAR DAY —
// the day Meta attributed the spend to. They carry no timezone because
// they are not instants.
//
// `started_at`, `finished_at`, `generated_at`, `created_at` are
// `timestamptz`. They are instants, and rendering them in the reader's
// local timezone is correct.
//
// Every date-only value was being passed through `new Date(s)
// .toLocaleDateString(...)`, in four separate files. `new Date("2026-08-01")`
// parses as UTC midnight, and `toLocaleDateString` then renders it in the
// BROWSER's timezone — so for every user west of UTC, which is all of the
// Americas, an analysis window covering Aug 1-31 was labelled "Jul 31 -
// Aug 30". Off by one day, on the exact control a user consults to know
// what window they are looking at, and completely invisible to anyone
// developing in UTC.
//
// `fmtDay` is for the calendar days. Instants keep using a local-time
// formatter — see the call sites, which now say which kind they hold.

/**
 * Render a date-only value ("YYYY-MM-DD") as a calendar day.
 *
 * Pinned to UTC because the value has no timezone: it names a day, and
 * that day must read the same for every viewer. Passing a full timestamp
 * here is a mistake — use a local-time formatter for instants.
 */
export function fmtDay(
  iso: string | null | undefined,
  opts: { year?: boolean } = {},
): string {
  if (!iso) return "";
  const value = String(iso).slice(0, 10);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(opts.year ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}

/** A "start – end" calendar-day range, with an en dash and no stray separator. */
export function fmtDayRange(
  start: string | null | undefined,
  end: string | null | undefined,
  opts: { year?: boolean } = {},
): string {
  const s = fmtDay(start, opts);
  const e = fmtDay(end, opts);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

// ─── Stored analysis prose ────────────────────────────────────────────
//
// Some analysis text arrives already composed as a sentence, from the
// imported source data package rather than from anything this app formats.
// The composer upstream built those sentences with a template literal and
// no number formatting, so the product renders things like:
//
//   "C1 produced $12.2632 CPA on $515.0538 spend (42 results)."
//   "C3 produced $undefined CPA on $286.84 spend (0 results)."
//
// Four decimal places on money is the difference between a data product
// and a debug view, and `$undefined` is a JavaScript value that escaped
// into a customer-facing string — 3 of the 33 concepts in the Bookster
// package carry it, because CPA is spend/results and those concepts have
// zero results.
//
// The source package is the client's imported analysis artifact and is not
// ours to rewrite, so both are corrected at render. Neither transform
// invents a value: rounding to the app's standard money precision is what
// fmtMetric already does with the same numbers elsewhere on the same
// screen, and `n/a` is what every other surface shows for a metric that
// does not exist.

/** `$undefined`, `$null`, `$NaN` — a failed interpolation, not a number. */
const NON_VALUE = /\$(?:undefined|null|NaN)\b/g;
/** A currency literal: `$` then digits, optional thousands, optional decimals. */
const MONEY = /\$(\d[\d,]*)(?:\.(\d+))?/g;

/**
 * Make numbers inside an already-composed analysis sentence readable:
 * failed interpolations become `n/a`, money gets thousands separators and
 * at most two decimal places.
 *
 * Deliberately does NOT drop cents the way fmtMetric's `usd_total` does.
 * A bare `$515.0538` in prose carries no signal about whether it is a unit
 * cost or a total, and guessing would be the kind of silent reinterpretation
 * this codebase avoids. Two decimals is money rendered as money; that is
 * the whole claim.
 */
export function normalizeMetricsInProse(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  return t
    .replace(NON_VALUE, "n/a")
    .replace(MONEY, (_m, whole: string, frac: string | undefined) => {
      const n = Number(whole.replace(/,/g, "") + (frac ? `.${frac}` : ""));
      if (!Number.isFinite(n)) return _m;
      return `$${n.toLocaleString("en-US", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })}`;
    });
}

/**
 * Is this string usable as a NAME — a concept descriptor, a creative concept
 * name — or is it prose that landed in a name field?
 *
 * The Bookster package fills `concept_registry[code].descriptor` and
 * `performance_by_cell[].book2_concept_name` with the same generated
 * performance sentence it puts in `what`. Rendered as a name, that sentence
 * became the label of an inline chip and the title line of a source-cell
 * card — a full sentence, with `$undefined` in it, where "Social Proof"
 * belongs. The card already shows that sentence's spend and results as its
 * own evidence strip, so the sentence added nothing except the malformed
 * numbers.
 *
 * THE TEST IS TERMINAL PUNCTUATION, NOT LENGTH. Length was the first rule
 * here and it was wrong: measured against all 33 concepts in the Bookster
 * registry, a 48-character limit rejected two genuine names — "Time-poor
 * learner product demo / 1,000 books proof" (50) and "Aspirational
 * authority / learn like people you admire" (53) — while the longest
 * legitimate descriptor that passed was 45. Three characters of headroom
 * between a real name and a false positive is not a rule, it is a
 * coincidence, and shipping it would have replaced two real concept names
 * with bare codes.
 *
 * A sentence ends; a name does not. All seven generated sentences in that
 * registry terminate with a period and not one of the twenty-six real
 * descriptors does. Length survives only as a backstop against runaway
 * prose that happens to carry no terminal punctuation, set far above any
 * plausible name rather than just above the longest one observed.
 */
/**
 * Backstop only. Well clear of the longest real name in the data (53), so
 * it never decides a borderline case — terminal punctuation does that.
 */
const NAME_MAX_CHARS = 120;

export function isUsableName(value: string | null | undefined): boolean {
  const t = (value ?? "").trim();
  if (!t) return false;
  // A terminal period ends a sentence. An abbreviation inside a name
  // ("Inc.", "vs.") does not sit at the end, so anchoring is what keeps
  // this from rejecting legitimate names.
  if (/[.!?]$/.test(t)) return false;
  if (t.length > NAME_MAX_CHARS) return false;
  return true;
}

/**
 * A name field's value if it really is a name, else null — so the caller
 * falls back to the identifier it already has rather than printing prose
 * where a label belongs.
 */
export function usableName(value: string | null | undefined): string | null {
  return isUsableName(value) ? (value ?? "").trim() : null;
}
