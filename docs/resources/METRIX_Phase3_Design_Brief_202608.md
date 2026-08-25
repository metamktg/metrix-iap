# METRIX Phase 3 Design Brief — Information Compression & Hierarchy Pass

> Provenance: external design assessment supplied by the repo owner on 2026-08-25,
> recorded verbatim below as the canonical Phase 3 work order. The section-by-section
> codebase touchpoint map and execution sequencing live in
> `METRIX_Phase2_Enabler_Sprint_202608.md` — read that FIRST when implementing:
> several of this brief's mandates are data-contract work, not CSS, and doing the
> visual pass before those contracts exist forces the UI to fake structure the
> server doesn't provide.

---

## Overall design assessment

The platform has a **credible premium foundation, but it is not yet expressing premium SaaS authority at the level the underlying product appears to warrant**.

The dark visual system, restrained accent palette, consistent navigation, border treatment, and overall component language are directionally correct. The problem is not that the interface looks amateur. It does not. The problem is that **too much of the product's intelligence is being presented as interface content rather than being converted into hierarchy**.

The result is a product that currently feels closer to a sophisticated internal intelligence console than a highly refined commercial MarTech product.

Assessment across the supplied views:

| Dimension | Current effectiveness | Assessment |
| --- | ---: | --- |
| Visual consistency | **8/10** | Strong |
| Premium visual foundation | **7.5/10** | Strong foundation |
| Data scanability | **5.5/10** | Needs substantial refinement |
| Optical authority | **6/10** | Too many elements compete |
| Perceived intelligence/value | **6.5/10** | Intelligence is visible but insufficiently distilled |
| Progressive disclosure | **4/10** | Major weakness |
| Information hierarchy | **5.5/10** | Too flat |
| Enterprise/MarTech polish | **6.5/10** | Credible, not yet category-leading |

The central mandate:

> **Show less intelligence by default, while making the intelligence feel deeper.**

### 1. The primary issue is information hierarchy, not aesthetics
Too many elements compete at approximately the same visual level ("component democracy" — everything gets a container, a label, a border, explanatory copy). Premium software requires a deliberate hierarchy of dominance answering, in order: Where am I? What matters? What changed/what did Metrix discover? What should I do? Where can I inspect the reasoning?

### 2. Analysis > Ad Performance exposes the problem most clearly
The KPI row performs well; below it authority deteriorates: warning row, "Signals worth acting on", three signal categories, "All Signals", filters, large diagnostic cards, paragraphs, evidence links, action buttons, technical classifications. Default interface should behave as **Observation → implication → action**, with methodology on demand. Signal cards are too verbose: the default state needs `Underspend / $57.97 of $1,000 deployed / 5.8% of planned spend / Why this matters →` — the reasoning sentence belongs in a disclosure panel.

### 3. Technical intelligence is leaking into the presentation layer
`zero_conversions`, `partial_reporting_cell`, `GEN_ICP_6423823a_1`, `validation_required`, "C2A, C2D…", raw numeric identifiers, diagnostic classifications in prose. Separate three layers: **Presentation** (what does this mean?), **Analytical** (why does Metrix believe it?), **Diagnostic/system** (what source/cell/rule produced it?). A premium system appears simpler because the complexity has been mastered.

### 4. Progressive disclosure as a platform-wide rule
Permanently visible: primary KPI, signal title, severity, essential quantified evidence, one-line interpretation, recommended action, decision-relevant confidence. Behind hover/tooltip/disclosure: definitions, methodology, identifiers, source terminology, long diagnostics, classification rationale, secondary context. In drawers/expanded states: complete evidence, supporting rows, source records, alternative interpretations, affected entities, timestamps, audit history.

### 5. Strategy > Avatars/ICP/PMF has too much visible metadata
Give the ICP name primary authority; reduce ICP number, confidence classification, generated identifier, initials, quote, nested recommendation containers to subordinate metadata behind `View profile`.

### 6. Internal identifiers materially reduce premium perception
"Fresh Import 1786839868960 · Avatars / ICP / PMF" reads as an implementation artifact. Page titles need semantically meaningful names; generated identifiers stay in metadata.

### 7. Overuse of containers
A border should communicate interaction, selection, grouping, state, or separation — not "this is another piece of information." Use spacing to group before another rectangle.

### 8. Empty space is not functioning as intentional whitespace
Left-heavy compositions with dead right-side canvas read as unfinished, not luxurious. Widen useful content, add a contextual secondary pane, use width for visualization/evidence, or deliberately center-constrain.

### 9. Data-rich views need more visualization, less prose
Compact quantified visual evidence: mini trends, deltas, contribution bars, comparative baselines, distribution/confidence indicators, sparklines, anomaly markers, period-over-period movement. Scan in three seconds and perceive substantial analysis.

### 10. KPI cards need analytical context
One restrained secondary dimension per KPI: `↑ 14.2% vs prior period`, or `82% of expected pace`, or a microtrend — not all simultaneously. Reporting → analysis.

### 11. Typography requires hierarchy reduction
Too many simultaneous micro-hierarchies; the letter-spaced uppercase micro-label pattern is overused — reserve for genuinely structural labels.

### 12. Secondary text contrast is over-applied
Secondary must not converge visually with inactive/disabled.

### 13. Account Overview > Updates is clean but too instructional
Collapse the four "Getting started" modules to a tight numbered sequence; explanatory sentences on hover/selection/incomplete/first-run only; collapse or disappear when complete.

### 14. Repetition reduces signal authority
"Signals worth acting on" followed by "All Signals" explains the same domain twice. Priority signals + counts + `View all N signals`.

### 15. Status semantics need normalization
Collapse the multiple state languages into: **Priority** (Critical/Important/Informational), **Confidence** (High/Medium/Low), **Workflow** (New/Reviewed/Saved/Actioned). Everything else is descriptive metadata.

### 16. Buttons and actions need prioritization
One dominant action per module; secondary operations become icon/overflow/disclosure/text actions.

### 17. Top action/header regions are compressed and fragmented
Group into clear control clusters: **Date | Compare | •••** with Summary/Export/secondary ops in overflow.

### 18. Answer-first design (the most important product-level recommendation)
Metrix forms conclusions from data; the interface should lead with conclusions:
> **Your account has one immediate constraint: insufficient spend.** Nothing else is currently reliable enough to optimize. **Recommended action:** restore delivery before evaluating conversion performance. `View evidence`

## Universal design mandates
1. One page, one dominant answer. 2. Reduce visible text ~30–50% — relocate, don't delete. 3. Default to conclusion, disclose reasoning (`Finding → quantified evidence → action → reasoning`). 4. Remove implementation language from the presentation layer. 5. Eliminate unnecessary containers — spacing and type before borders. 6. One primary action per module. 7. Use the full canvas intentionally. 8. Every KPI gets exactly one analytical-context dimension. 9. Reduce typography vocabulary. 10. Platform-wide status semantics. 11. Evidence available, not omnipresent. 12. Contextual help over repeated explanation. 13. Collapse completed onboarding UI. 14. Decision utility above data completeness.

## What should remain
Dark navy foundation, restrained cyan/purple accents, compact left navigation, low-radius rectangular language, subtle borders, restrained shadows, dense analytical positioning, current spacing rhythm, monochromatic analytical character, sparing semantic status colors. The redesign is **subtractive**: remove roughly one-third of the visible interface while preserving essentially all capability.

## Final assessment
The product communicates complexity, capability and seriousness — not yet command. Pursue: **less UI, fewer words, fewer boxes, stronger numbers, stronger conclusions, deeper disclosure.** The foundation does not require another visual redesign; it requires a disciplined information compression and hierarchy pass across the design system.
