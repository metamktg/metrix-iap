// Signal Feed — Analysis Overview variant
// Design hypothesis: instead of charts and dashboards, surface ranked
// actionable signals from the analysis. The analyst reads what matters,
// not what happened. Each signal is a self-contained insight card with
// context, severity, and a suggested next action.

import { useState } from "react";
import "./SignalFeed.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type SignalKind = "opportunity" | "anomaly" | "confirmation" | "warning";
type SignalCategory = "concept" | "placement" | "audience" | "budget" | "creative";

interface Signal {
  id: string;
  kind: SignalKind;
  category: SignalCategory;
  title: string;
  body: string;
  metric: string;
  metricLabel: string;
  delta?: string;
  deltaDir?: "up" | "down";
  action: string;
  priority: 1 | 2 | 3;
  concept?: string;
  dismissed?: boolean;
}

// ─── Mock signals ─────────────────────────────────────────────────────────────

const SIGNALS: Signal[] = [
  {
    id: "s1",
    kind: "opportunity",
    category: "concept",
    title: "C2A is outperforming the concept average by 31%",
    body: "City Loyalist Comfort Fit is your lowest-CPA concept at $4.12 vs. the $5.98 account average. It still has available daily budget headroom — scale spend here before the creative window closes.",
    metric: "$4.12",
    metricLabel: "CPA",
    delta: "−31%",
    deltaDir: "down",
    action: "Increase C2A budget",
    priority: 1,
    concept: "C2A · City Loyalist Comfort Fit",
  },
  {
    id: "s2",
    kind: "anomaly",
    category: "placement",
    title: "Instagram Stories is absorbing 38% of spend with below-median results",
    body: "Stories placements have delivered $14,200 in spend this period but are converting at $9.40 CPA — 57% above the median. Reels and Feed are both below $5.80. Consider capping Stories or excluding it from the top-performing ad sets.",
    metric: "$9.40",
    metricLabel: "CPA · Stories",
    delta: "+57%",
    deltaDir: "up",
    action: "Review placement caps",
    priority: 1,
    concept: undefined,
  },
  {
    id: "s3",
    kind: "warning",
    category: "audience",
    title: "25–34 female segment driving 60% of results but only 22% of spend",
    body: "The highest-converting audience band is significantly under-funded relative to its output. This is a systematic imbalance — the automated bidding system may be deprioritising it due to a narrower creative pool.",
    metric: "60%",
    metricLabel: "of results",
    delta: "22% of spend",
    deltaDir: undefined,
    action: "Expand creative for 25–34 F",
    priority: 1,
    concept: undefined,
  },
  {
    id: "s4",
    kind: "opportunity",
    category: "creative",
    title: "Video-first executions are outperforming static by 2.1×",
    body: "Across concepts with both video and static variants, video consistently delivers lower CPA. C3B and C1A show the largest gap. Briefs for Q4 should strongly bias toward video-primary formats.",
    metric: "2.1×",
    metricLabel: "video vs. static",
    delta: undefined,
    deltaDir: undefined,
    action: "Flag for Q4 briefing",
    priority: 2,
    concept: "C3B, C1A",
  },
  {
    id: "s5",
    kind: "confirmation",
    category: "concept",
    title: "C1B continues to confirm — 4th consecutive analysis window in tier 1",
    body: "Geo-Pride — Explorer has been in the top performance tier for 4 straight windows. The core message and visual variables are stable signal. This concept should serve as a reference point for new brief development.",
    metric: "Tier 1",
    metricLabel: "4 windows",
    delta: undefined,
    deltaDir: undefined,
    action: "Pin as creative reference",
    priority: 2,
    concept: "C1B · Geo-Pride Explorer",
  },
  {
    id: "s6",
    kind: "anomaly",
    category: "budget",
    title: "Overall spend pace is 14% behind target with 9 days remaining",
    body: "At current daily rates the account will underspend by ~$6,800 this period. The shortfall is concentrated in the two paused ad sets from the creative refresh mid-period. Re-enabling them or increasing bids on active sets should close the gap.",
    metric: "−$6,800",
    metricLabel: "projected shortfall",
    delta: "14% behind",
    deltaDir: "up",
    action: "Review paused ad sets",
    priority: 2,
    concept: undefined,
  },
  {
    id: "s7",
    kind: "warning",
    category: "concept",
    title: "C4A has not delivered a result in 12 days — consider pausing",
    body: "Two-Print Couple Story is spending $180/day with zero conversions in the last 12 days. This is a strong signal of creative fatigue or audience saturation. The data window may have closed for this angle.",
    metric: "$0",
    metricLabel: "results / 12 days",
    delta: "$2,160 at risk",
    deltaDir: "up",
    action: "Pause C4A",
    priority: 1,
    concept: "C4A · Two-Print Couple Story",
  },
  {
    id: "s8",
    kind: "confirmation",
    category: "placement",
    title: "Facebook Feed continues to be the most cost-efficient placement",
    body: "Feed has maintained the lowest blended CPA for the third window in a row at $4.88. This is a reliable signal — budget directed here from under-performing placements is likely to convert.",
    metric: "$4.88",
    metricLabel: "CPA · Feed",
    delta: "−18% vs. account",
    deltaDir: "down",
    action: "Increase Feed allocation",
    priority: 3,
    concept: undefined,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_META: Record<SignalKind, { label: string; color: string; dot: string }> = {
  opportunity: { label: "Opportunity", color: "sf-badge--opp", dot: "sf-dot--opp" },
  anomaly:     { label: "Anomaly",     color: "sf-badge--anom", dot: "sf-dot--anom" },
  confirmation:{ label: "Confirmed",   color: "sf-badge--conf", dot: "sf-dot--conf" },
  warning:     { label: "Warning",     color: "sf-badge--warn", dot: "sf-dot--warn" },
};

const CAT_LABEL: Record<SignalCategory, string> = {
  concept:   "Concept",
  placement: "Placement",
  audience:  "Audience",
  budget:    "Budget",
  creative:  "Creative",
};

function PriorityPip({ level }: { level: 1 | 2 | 3 }) {
  return (
    <div className="sf-priority-pips" aria-label={`Priority ${level}`}>
      {[1, 2, 3].map((n) => (
        <div key={n} className={`sf-pip ${n <= level ? "sf-pip--off" : "sf-pip--on"}`} />
      ))}
    </div>
  );
}

// ─── Signal card ──────────────────────────────────────────────────────────────

function SignalCard({
  signal,
  onDismiss,
  onAction,
  expanded,
  onToggle,
}: {
  signal: Signal;
  onDismiss: (id: string) => void;
  onAction: (id: string) => void;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const meta = KIND_META[signal.kind];

  return (
    <article
      className={`sf-card sf-card--${signal.kind} ${expanded ? "sf-card--expanded" : ""}`}
      aria-label={signal.title}
    >
      {/* Priority rail */}
      <div className={`sf-rail sf-rail--${signal.kind}`} />

      <div className="sf-card-inner">
        {/* Top row */}
        <div className="sf-card-top">
          <div className="sf-card-badges">
            <span className={`sf-badge ${meta.color}`}>
              <span className={`sf-dot ${meta.dot}`} />
              {meta.label}
            </span>
            <span className="sf-badge sf-badge--cat">{CAT_LABEL[signal.category]}</span>
          </div>
          <div className="sf-card-top-right">
            <PriorityPip level={signal.priority} />
            <button
              className="sf-dismiss"
              onClick={() => onDismiss(signal.id)}
              aria-label="Dismiss signal"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>

        {/* Title */}
        <button className="sf-title" onClick={() => onToggle(signal.id)}>
          {signal.title}
          <svg className={`sf-chevron ${expanded ? "sf-chevron--open" : ""}`} viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Metric strip */}
        <div className="sf-metric-strip">
          <div className="sf-metric-main">
            <span className="sf-metric-value">{signal.metric}</span>
            <span className="sf-metric-label">{signal.metricLabel}</span>
          </div>
          {signal.delta && (
            <div className={`sf-delta ${signal.deltaDir === "up" ? "sf-delta--up" : signal.deltaDir === "down" ? "sf-delta--down" : "sf-delta--neutral"}`}>
              {signal.delta}
            </div>
          )}
          {signal.concept && (
            <div className="sf-concept-chip">{signal.concept}</div>
          )}
        </div>

        {/* Expandable body */}
        {expanded && (
          <div className="sf-body">
            <p className="sf-body-text">{signal.body}</p>
            <div className="sf-actions">
              <button className="sf-action-btn" onClick={() => onAction(signal.id)}>
                → {signal.action}
              </button>
              <button className="sf-action-ghost" onClick={() => onDismiss(signal.id)}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ signals }: { signals: Signal[] }) {
  const opps  = signals.filter((s) => s.kind === "opportunity").length;
  const warns = signals.filter((s) => s.kind === "warning" || s.kind === "anomaly").length;
  const confs = signals.filter((s) => s.kind === "confirmation").length;

  return (
    <div className="sf-summary">
      <div className="sf-summary-group">
        <span className="sf-summary-num sf-summary-num--opp">{opps}</span>
        <span className="sf-summary-lbl">Opportunities</span>
      </div>
      <div className="sf-summary-sep" />
      <div className="sf-summary-group">
        <span className="sf-summary-num sf-summary-num--warn">{warns}</span>
        <span className="sf-summary-lbl">Anomalies / Warnings</span>
      </div>
      <div className="sf-summary-sep" />
      <div className="sf-summary-group">
        <span className="sf-summary-num sf-summary-num--conf">{confs}</span>
        <span className="sf-summary-lbl">Confirmed signals</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type FilterKind = "all" | SignalKind;
type FilterCat  = "all" | SignalCategory;

export function SignalFeed() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded]   = useState<string | null>("s1");
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterCat,  setFilterCat]  = useState<FilterCat>("all");
  const [acted, setActed] = useState<Set<string>>(new Set());

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    if (expanded === id) setExpanded(null);
  }

  function act(id: string) {
    setActed((prev) => new Set([...prev, id]));
  }

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  const visible = SIGNALS.filter((s) => {
    if (dismissed.has(s.id)) return false;
    if (filterKind !== "all" && s.kind !== filterKind) return false;
    if (filterCat  !== "all" && s.category !== filterCat) return false;
    return true;
  });

  const p1 = visible.filter((s) => s.priority === 1);
  const p2 = visible.filter((s) => s.priority === 2);
  const p3 = visible.filter((s) => s.priority === 3);

  return (
    <div className="sf-root">
      {/* Left panel — signal feed */}
      <div className="sf-panel sf-panel--feed">
        {/* Header */}
        <div className="sf-header">
          <div className="sf-header-title">
            <div className="sf-wordmark">M</div>
            <div>
              <div className="sf-header-label">Signal Feed</div>
              <div className="sf-header-sub">Analysis · 03 · Bookster</div>
            </div>
          </div>
          <div className="sf-header-meta">
            <span className="sf-run-badge">Run #7 complete</span>
            <span className="sf-period">Jun 1 – Jul 28</span>
          </div>
        </div>

        {/* Summary */}
        <SummaryBar signals={SIGNALS.filter((s) => !dismissed.has(s.id))} />

        {/* Filters */}
        <div className="sf-filters">
          <div className="sf-filter-row">
            {(["all", "opportunity", "anomaly", "warning", "confirmation"] as FilterKind[]).map((k) => (
              <button
                key={k}
                className={`sf-filter-btn ${filterKind === k ? "sf-filter-btn--active" : ""}`}
                onClick={() => setFilterKind(k)}
              >
                {k === "all" ? "All" : KIND_META[k as SignalKind].label}
              </button>
            ))}
          </div>
          <div className="sf-filter-row sf-filter-row--cats">
            {(["all", "concept", "placement", "audience", "budget", "creative"] as FilterCat[]).map((c) => (
              <button
                key={c}
                className={`sf-filter-btn sf-filter-btn--sm ${filterCat === c ? "sf-filter-btn--active" : ""}`}
                onClick={() => setFilterCat(c)}
              >
                {c === "all" ? "All categories" : CAT_LABEL[c as SignalCategory]}
              </button>
            ))}
          </div>
        </div>

        {/* Signal cards */}
        <div className="sf-feed">
          {visible.length === 0 && (
            <div className="sf-empty">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".3" />
                <path d="M10 16h12M16 10v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".3" />
              </svg>
              <span>No signals match the current filter.</span>
            </div>
          )}

          {p1.length > 0 && (
            <div className="sf-group">
              <div className="sf-group-label">
                <span className="sf-group-dot sf-group-dot--urgent" />
                Requires attention
              </div>
              {p1.map((s) => (
                <SignalCard
                  key={s.id}
                  signal={s}
                  onDismiss={dismiss}
                  onAction={act}
                  expanded={expanded === s.id}
                  onToggle={toggle}
                />
              ))}
            </div>
          )}

          {p2.length > 0 && (
            <div className="sf-group">
              <div className="sf-group-label">
                <span className="sf-group-dot sf-group-dot--normal" />
                Notable findings
              </div>
              {p2.map((s) => (
                <SignalCard
                  key={s.id}
                  signal={s}
                  onDismiss={dismiss}
                  onAction={act}
                  expanded={expanded === s.id}
                  onToggle={toggle}
                />
              ))}
            </div>
          )}

          {p3.length > 0 && (
            <div className="sf-group">
              <div className="sf-group-label">
                <span className="sf-group-dot sf-group-dot--low" />
                Informational
              </div>
              {p3.map((s) => (
                <SignalCard
                  key={s.id}
                  signal={s}
                  onDismiss={dismiss}
                  onAction={act}
                  expanded={expanded === s.id}
                  onToggle={toggle}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — context / acted on */}
      <div className="sf-panel sf-panel--context">
        <div className="sf-context-header">Quick actions taken</div>
        {acted.size === 0 ? (
          <div className="sf-context-empty">
            Click a signal action to log it here.
          </div>
        ) : (
          <div className="sf-acted-list">
            {[...acted].map((id) => {
              const s = SIGNALS.find((sig) => sig.id === id)!;
              return (
                <div key={id} className="sf-acted-item">
                  <div className={`sf-acted-dot sf-dot--${s.kind}`} />
                  <div>
                    <div className="sf-acted-action">{s.action}</div>
                    <div className="sf-acted-from">{s.title.slice(0, 52)}…</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="sf-context-section">
          <div className="sf-context-header">Account snapshot</div>
          <div className="sf-snapshot-grid">
            {[
              { label: "Total spend",    value: "$42,100" },
              { label: "Results",        value: "7,040"   },
              { label: "Blended CPA",    value: "$5.98"   },
              { label: "Active concepts",value: "6"       },
              { label: "Signals raised", value: String(SIGNALS.length) },
              { label: "Run window",     value: "58 days" },
            ].map((item) => (
              <div key={item.label} className="sf-snapshot-item">
                <div className="sf-snapshot-val">{item.value}</div>
                <div className="sf-snapshot-lbl">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="sf-context-section">
          <div className="sf-context-header">Concept ranking</div>
          {[
            { code: "C2A", name: "City Loyalist Comfort", cpa: 4.12, tier: 1 },
            { code: "C1B", name: "Geo-Pride Explorer",    cpa: 4.55, tier: 1 },
            { code: "C1A", name: "Heritage Stitch",       cpa: 5.21, tier: 2 },
            { code: "C3B", name: "Playful Geo-Pride",     cpa: 5.88, tier: 2 },
            { code: "C2B", name: "Comfort Collective",    cpa: 6.40, tier: 3 },
            { code: "C4A", name: "Two-Print Couple",      cpa: null, tier: 3 },
          ].map((c, i) => (
            <div key={c.code} className="sf-rank-row">
              <span className="sf-rank-n">{i + 1}</span>
              <div className="sf-rank-bar-wrap">
                <div className="sf-rank-label">
                  <span className="sf-rank-code">{c.code}</span>
                  <span className="sf-rank-name">{c.name}</span>
                </div>
                <div className="sf-rank-track">
                  <div
                    className={`sf-rank-fill sf-rank-fill--t${c.tier}`}
                    style={{ width: c.cpa ? `${Math.min(100, (8 - c.cpa) / 4 * 100)}%` : "4%" }}
                  />
                </div>
              </div>
              <span className="sf-rank-cpa">{c.cpa ? `$${c.cpa.toFixed(2)}` : "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
