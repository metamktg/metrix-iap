// ─── Result events · intent classes ──────────────────────────────────────
// Owner direction (2026-09-03): awareness campaigns and purchase-intent
// events serve different strategic purposes and are NEVER weighted against
// each other. Awareness is read on communication signals (how well the
// creative reaches and holds attention, and where it falls short); a
// purchase-intent event is read on its own cost-per-result scale. This
// module is the one vocabulary both halves of the platform use to say
// which is which.
//
// It is DERIVED FROM DATA and only from data. Meta states, per ad, the
// event the ad was optimised towards ("Result type"); this classifies that
// string into an EVENT KEY (purchase, add_to_cart, lead, app_install, …)
// and an INTENT CLASS (awareness · consideration · conversion). Nothing is
// asked of an operator, nothing is toggled, nothing is stored as a property
// of the account — the same rule that bounds the derived objective in
// cohortConfig.ts (owner decision 2026-09-01). The objective decides which
// terminal metric a run reports; the intent class decides which SCALE a row
// is judged on and which rows may be ranked beside it.
//
// LIVES TWICE by necessity — canonically here, byte-identical in
// artifacts/metrix-iap/src/lib/resultEvents.ts — because the client ranks
// rows that carry only the raw "Result type" string (performance_by_cell,
// v3_variable_performance, ads[]). scripts/src/result-events-drift.test.ts
// fails when the two copies differ. No imports, so the copy stays trivial.

export type IntentClass = "awareness" | "consideration" | "conversion";

/** The scale a row is judged on. Awareness never gets a cost-per-result verdict. */
export type EvaluationScale = "communication" | "cost_per_result";

export type ResultEventKey =
  // conversion — a business outcome, or a purchase-intent step toward one
  | "purchase"
  | "add_to_cart"
  | "initiate_checkout"
  | "add_payment_info"
  | "add_to_wishlist"
  | "lead"
  | "registration"
  | "subscription"
  | "trial"
  | "app_install"
  | "app_activation"
  | "appointment"
  | "messaging_conversation"
  | "contact"
  | "application"
  | "donation"
  | "call"
  | "store_visit"
  // consideration — the reader moved toward the offer
  | "landing_page_view"
  | "link_click"
  | "content_view"
  | "search"
  | "click"
  // awareness — the creative reached or held attention
  | "thruplay"
  | "video_view"
  | "post_engagement"
  | "page_like"
  | "profile_visit"
  | "event_response"
  | "ad_recall"
  | "reach"
  | "impressions"
  // no verdict possible
  | "custom"
  | "unknown";

export interface ResultEventDefinition {
  key: ResultEventKey;
  /** Plural label for tiles and table headers ("Purchases"). */
  label: string;
  /** Singular noun for "Cost per <noun>". */
  noun: string;
  /** Null for unknown / custom: the export named no event Metrix can place. */
  intent: IntentClass | null;
  /**
   * Where the event sits in its class's funnel. Only TERMINAL conversion
   * events may be blended into one "conversions" total: an add-to-cart and
   * the purchase it precedes are two counts of one journey, and reach,
   * impressions and ThruPlays overlap by construction, so every other event
   * is read on its own. Null when the event cannot be placed.
   */
  stage: "terminal" | "intermediate" | null;
}

export interface IntentClassDefinition {
  key: IntentClass;
  label: string;
  scale: EvaluationScale;
  /** One line for a lens header. */
  summary: string;
  /** Metric ids (metricsCatalog vocabulary) this class is ranked on, primary first. */
  rankOn: readonly string[];
  /** "asc" when lower is better for the primary metric. */
  primaryDirection: "asc" | "desc";
}

export const INTENT_CLASS_ORDER: readonly IntentClass[] = ["conversion", "consideration", "awareness"];

export const INTENT_CLASSES: Record<IntentClass, IntentClassDefinition> = {
  conversion: {
    key: "conversion",
    label: "Conversion",
    scale: "cost_per_result",
    summary: "Purchase-intent events, each on its own cost-per-result scale",
    rankOn: ["cpa", "cvr", "results"],
    primaryDirection: "asc",
  },
  consideration: {
    key: "consideration",
    label: "Consideration",
    scale: "cost_per_result",
    summary: "Traffic events · cost per visit and click-through, never against a purchase",
    rankOn: ["cpc", "link_ctr", "results"],
    primaryDirection: "asc",
  },
  awareness: {
    key: "awareness",
    label: "Awareness",
    scale: "communication",
    summary: "Communication signals · reach, attention and click-through, read for gaps, never for cost per result",
    rankOn: ["link_ctr", "cpm", "reach", "frequency"],
    primaryDirection: "desc",
  },
};

const def = (key: ResultEventKey, label: string, noun: string, intent: IntentClass | null, stage: "terminal" | "intermediate" | null = intent === "conversion" ? "terminal" : intent === null ? null : "intermediate"): ResultEventDefinition => ({ key, label, noun, intent, stage });

export const RESULT_EVENTS: Record<ResultEventKey, ResultEventDefinition> = {
  purchase: def("purchase", "Purchases", "purchase", "conversion"),
  add_to_cart: def("add_to_cart", "Adds to cart", "add to cart", "conversion", "intermediate"),
  initiate_checkout: def("initiate_checkout", "Checkouts initiated", "checkout", "conversion", "intermediate"),
  add_payment_info: def("add_payment_info", "Payment info added", "payment info", "conversion", "intermediate"),
  add_to_wishlist: def("add_to_wishlist", "Adds to wishlist", "wishlist add", "conversion", "intermediate"),
  lead: def("lead", "Leads", "lead", "conversion"),
  registration: def("registration", "Registrations", "registration", "conversion"),
  subscription: def("subscription", "Subscriptions", "subscription", "conversion"),
  trial: def("trial", "Trials", "trial", "conversion"),
  app_install: def("app_install", "App installs", "install", "conversion"),
  app_activation: def("app_activation", "App activations", "activation", "conversion"),
  appointment: def("appointment", "Appointments", "appointment", "conversion"),
  messaging_conversation: def("messaging_conversation", "Conversations started", "conversation", "conversion"),
  contact: def("contact", "Contacts", "contact", "conversion"),
  application: def("application", "Applications", "application", "conversion"),
  donation: def("donation", "Donations", "donation", "conversion"),
  call: def("call", "Calls", "call", "conversion"),
  store_visit: def("store_visit", "Store visits", "store visit", "conversion"),
  landing_page_view: def("landing_page_view", "Landing page views", "landing page view", "consideration"),
  link_click: def("link_click", "Link clicks", "link click", "consideration"),
  content_view: def("content_view", "Content views", "content view", "consideration"),
  search: def("search", "Searches", "search", "consideration"),
  click: def("click", "Clicks", "click", "consideration"),
  thruplay: def("thruplay", "ThruPlays", "ThruPlay", "awareness"),
  video_view: def("video_view", "Video views", "video view", "awareness"),
  post_engagement: def("post_engagement", "Post engagements", "engagement", "awareness"),
  page_like: def("page_like", "Page likes", "like", "awareness"),
  profile_visit: def("profile_visit", "Profile visits", "profile visit", "awareness"),
  event_response: def("event_response", "Event responses", "event response", "awareness"),
  ad_recall: def("ad_recall", "Ad recall lift", "recall", "awareness"),
  reach: def("reach", "Reach", "person reached", "awareness"),
  impressions: def("impressions", "Impressions", "impression", "awareness"),
  custom: def("custom", "Custom event", "result", null),
  unknown: def("unknown", "Unclassified result type", "result", null),
};

/**
 * Result type → event key, first match wins. Order is load-bearing where
 * one Meta name contains another: "ThruPlays" before the video family,
 * "Link clicks" before the generic click, "Landing page views" and
 * "Post engagements" before their generic tails. Custom events arrive as
 * snake_case ("onb_initiate_checkout"); underscores are read as spaces so
 * the same rules place them.
 */
const EVENT_SIGNALS: readonly { pattern: RegExp; key: ResultEventKey }[] = [
  { pattern: /\bpurchases?\b/i, key: "purchase" },
  { pattern: /\badds? to (cart|basket)\b|\badd to cart\b/i, key: "add_to_cart" },
  { pattern: /checkout/i, key: "initiate_checkout" },
  { pattern: /payment info/i, key: "add_payment_info" },
  { pattern: /wishlist/i, key: "add_to_wishlist" },
  { pattern: /\bleads?\b/i, key: "lead" },
  { pattern: /registration|\bsign.?ups?\b/i, key: "registration" },
  { pattern: /subscri/i, key: "subscription" },
  { pattern: /\btrials?\b/i, key: "trial" },
  { pattern: /\binstalls?\b/i, key: "app_install" },
  { pattern: /activation/i, key: "app_activation" },
  { pattern: /appointment|booking|\bschedul/i, key: "appointment" },
  { pattern: /conversation|messag|whatsapp/i, key: "messaging_conversation" },
  { pattern: /\bcontacts?\b/i, key: "contact" },
  { pattern: /application/i, key: "application" },
  { pattern: /donat/i, key: "donation" },
  { pattern: /\bcalls?\b|\bphone\b/i, key: "call" },
  { pattern: /store visits?|\boffline\b/i, key: "store_visit" },
  { pattern: /landing page views?/i, key: "landing_page_view" },
  { pattern: /link clicks?/i, key: "link_click" },
  { pattern: /content views?|view content/i, key: "content_view" },
  { pattern: /\bsearch/i, key: "search" },
  { pattern: /thru.?plays?/i, key: "thruplay" },
  { pattern: /video|\bplays?\b/i, key: "video_view" },
  { pattern: /engagement|reactions?|comments?|shares?|saves?\b/i, key: "post_engagement" },
  { pattern: /page likes?|\blikes?\b|\bfollow/i, key: "page_like" },
  { pattern: /profile visits?/i, key: "profile_visit" },
  { pattern: /event responses?/i, key: "event_response" },
  { pattern: /ad recall|brand awareness/i, key: "ad_recall" },
  { pattern: /\breach\b/i, key: "reach" },
  { pattern: /impressions?/i, key: "impressions" },
  { pattern: /\bclicks?\b|visits?\b/i, key: "click" },
];

export interface ResultEventClassification extends ResultEventDefinition {
  /** The export's own string, trimmed — what the reader saw in Meta. */
  raw: string;
  /** The scale this row is judged on; null when no verdict is possible. */
  scale: EvaluationScale | null;
}

/** Classify one Meta "Result type" string. Never throws; never guesses beyond the rules above. */
export function classifyResultEvent(resultType: string | null | undefined): ResultEventClassification {
  const raw = typeof resultType === "string" ? resultType.trim() : "";
  const build = (d: ResultEventDefinition): ResultEventClassification => ({
    ...d,
    raw,
    scale: d.intent ? INTENT_CLASSES[d.intent].scale : null,
  });
  if (raw === "" || raw.toLowerCase() === "unknown") return build(RESULT_EVENTS.unknown);
  const readable = raw.replace(/[_-]+/g, " ");
  for (const { pattern, key } of EVENT_SIGNALS) {
    if (pattern.test(readable)) return build(RESULT_EVENTS[key]);
  }
  return build(RESULT_EVENTS.custom);
}

/**
 * May these result types be summed into ONE blended total? Only terminal
 * conversion events, and at least two of them — a purchase and a lead are
 * both outcomes an account paid for, while a checkout is a step toward a
 * purchase and a ThruPlay overlaps every other awareness count.
 */
export function blendableEvents(resultTypes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rt of resultTypes) {
    const c = classifyResultEvent(rt);
    if (c.intent === "conversion" && c.stage === "terminal" && c.key !== "custom" && !seen.has(rt)) {
      seen.add(rt);
      out.push(rt);
    }
  }
  return out.length >= 2 ? out : [];
}

/** Intent class of a result type, or null when the export named no event Metrix can place. */
export function intentOf(resultType: string | null | undefined): IntentClass | null {
  return classifyResultEvent(resultType).intent;
}

/**
 * May rows carrying these two result types be ranked against each other?
 * Only when they are the SAME event: a purchase is not a lead, and neither
 * is a ThruPlay. Two unknown / custom rows never compare — there is nothing
 * to say they measure the same thing.
 */
export function comparableEvents(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = classifyResultEvent(a);
  const cb = classifyResultEvent(b);
  if (ca.intent === null || cb.intent === null) return false;
  if (ca.key === "custom" || cb.key === "custom") return false;
  return ca.key === cb.key;
}

/**
 * Group rows by intent class, in display order, dropping nothing: rows
 * whose result type cannot be placed land under `unplaced` so a reader
 * always sees where every dollar went.
 */
export function partitionByIntent<T>(
  rows: readonly T[],
  resultTypeOf: (row: T) => string | null | undefined,
): { classes: { intent: IntentClass; rows: T[] }[]; unplaced: T[] } {
  const buckets = new Map<IntentClass, T[]>();
  const unplaced: T[] = [];
  for (const row of rows) {
    const intent = intentOf(resultTypeOf(row));
    if (intent === null) unplaced.push(row);
    else (buckets.get(intent) ?? buckets.set(intent, []).get(intent)!).push(row);
  }
  return {
    classes: INTENT_CLASS_ORDER.filter((k) => buckets.has(k)).map((intent) => ({ intent, rows: buckets.get(intent)! })),
    unplaced,
  };
}

/**
 * Communication signals for one awareness row — the metrics an awareness
 * campaign is actually judged on. Every field is null when its inputs are
 * absent or physically impossible (clicks above impressions is a Meta
 * conversion-basis export, not a click-through rate).
 */
export interface CommunicationSignals {
  /** Spend per thousand impressions. */
  cpm: number | null;
  /** Link clicks ÷ impressions, percent. */
  linkCtrPct: number | null;
  /** Clicks (all) ÷ impressions, percent. */
  ctrAllPct: number | null;
  /** Impressions ÷ reach: how often the same person saw the creative. */
  frequency: number | null;
  /** Spend per person reached. */
  costPerReach: number | null;
  /** Results ÷ impressions, percent — the event's own rate (ThruPlay rate, engagement rate). */
  resultRatePct: number | null;
}

export interface CommunicationInputs {
  spend: number | null | undefined;
  impressions: number | null | undefined;
  reach: number | null | undefined;
  linkClicks: number | null | undefined;
  clicksAll: number | null | undefined;
  results: number | null | undefined;
}

const pos = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const num = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

export function communicationSignals(i: CommunicationInputs): CommunicationSignals {
  const imp = pos(i.impressions) ? i.impressions : null;
  return {
    cpm: imp !== null && num(i.spend) ? (i.spend / imp) * 1000 : null,
    linkCtrPct: imp !== null && num(i.linkClicks) && i.linkClicks <= imp ? (i.linkClicks / imp) * 100 : null,
    ctrAllPct: imp !== null && num(i.clicksAll) && i.clicksAll <= imp ? (i.clicksAll / imp) * 100 : null,
    frequency: imp !== null && pos(i.reach) && i.reach <= imp ? imp / i.reach : null,
    costPerReach: pos(i.reach) && num(i.spend) ? i.spend / i.reach : null,
    resultRatePct: imp !== null && num(i.results) && i.results <= imp ? (i.results / imp) * 100 : null,
  };
}

/**
 * Gap analysis for awareness rows: each row's communication signals against
 * the MEDIAN of its own class (never against a conversion row). A gap names
 * the signal that trails the class by more than `tolerance` (default 20%),
 * direction-aware — a higher CPM or frequency is the gap, a lower CTR or
 * result rate is the gap. The index is the row's value over the median
 * (>1 ahead, <1 behind) so a reader can see how far.
 */
export interface CommunicationGap {
  signal: keyof CommunicationSignals;
  label: string;
  /** Row value ÷ class median, oriented so > 1 always means "ahead of the class". */
  index: number;
  rowValue: number;
  median: number;
}

const SIGNAL_META: Record<keyof CommunicationSignals, { label: string; higherIsBetter: boolean }> = {
  cpm: { label: "CPM", higherIsBetter: false },
  linkCtrPct: { label: "Link CTR", higherIsBetter: true },
  ctrAllPct: { label: "CTR (all)", higherIsBetter: true },
  frequency: { label: "Frequency", higherIsBetter: false },
  costPerReach: { label: "Cost per reach", higherIsBetter: false },
  resultRatePct: { label: "Result rate", higherIsBetter: true },
};

export const COMMUNICATION_SIGNAL_LABELS: Record<keyof CommunicationSignals, string> = Object.fromEntries(
  Object.entries(SIGNAL_META).map(([k, v]) => [k, v.label]),
) as Record<keyof CommunicationSignals, string>;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function communicationGaps(
  row: CommunicationSignals,
  classRows: readonly CommunicationSignals[],
  tolerance = 0.2,
): { gaps: CommunicationGap[]; strengths: CommunicationGap[] } {
  const gaps: CommunicationGap[] = [];
  const strengths: CommunicationGap[] = [];
  // A class of one has no median to trail; a gap needs at least two rows.
  if (classRows.length < 2) return { gaps, strengths };
  for (const signal of Object.keys(SIGNAL_META) as (keyof CommunicationSignals)[]) {
    const value = row[signal];
    if (value === null) continue;
    const med = median(classRows.map((r) => r[signal]).filter((v): v is number => v !== null));
    if (med === null || med <= 0) continue;
    const meta = SIGNAL_META[signal];
    const index = meta.higherIsBetter ? value / med : med / value;
    if (!Number.isFinite(index)) continue;
    const entry = { signal, label: meta.label, index, rowValue: value, median: med };
    if (index < 1 - tolerance) gaps.push(entry);
    else if (index > 1 + tolerance) strengths.push(entry);
  }
  gaps.sort((a, b) => a.index - b.index);
  strengths.sort((a, b) => b.index - a.index);
  return { gaps, strengths };
}
