# Metrix IAP · UI audit, round 4 (2026-09-05)

**What this is.** The findings of two full-route visual audits run on the build after PR #218
(`shoot:routes` at 1440 and 390 px for the fixture's Bookster account and for the no-cell manual
account `manual_9JGXU_AQJjxJ`, 204 shots, every one read), reconciled against the code. Every row
carries a verdict; nothing here is a finding until its verdict says so. The two raw reports were
produced by reading the shots only; the crawl runs against the route-crawl STUBS (every
`/api/metrix/**` endpoint answers `{}` except the seed, `auth/me`, the reports list, data windows
and the analysis summary), so any surface that reads an API list (analysis runs, generation runs,
members, sessions, workspace reports, live connection) is empty in a shot and full in production.
Those rows are classed **stub artifact** and are not defects.

**Verdict vocabulary.** `confirmed` (reproduced in the code or the shot), `stub artifact`, `by
design` (a documented decision the finding contradicts), `fixture` (the fixture lacks the data the
surface reads; production has it), `fixed` (with the commit or PR), `unverified` (needs a re-shoot
or a code read before it is filed). Rounds name the PR that carries the fix.

## A. Stub artifacts (not defects)

| Route | Reported | Why it is the stub |
|---|---|---|
| /app/analysis, /app/analysis/history | Hub "Nothing staged · No completed runs yet", Run history "No analysis runs yet", the Strategy gate "Run analysis first" | `GET …/analysis-runs` answers `{}`; the seed's `latest_analysis_run_id` is what the export card counts |
| /app/strategy, /app/creative, /app/mst | "GENERATED IN-APP" badge and notice beside a hub reading "No completed runs yet" / "No generation runs yet" | the badge reads the seed rows' `source`; the hub reads `GET …/generation-runs/:kind`, stubbed |
| /app/mst | "Brief set · 16 briefs" above "doesn't have any generated briefs yet" | the hub reads the seed's brief set, the module reads the generation-run list |
| /app/settings/users, /app/settings/security | members table empty, "No active sessions found" | both endpoints stubbed |
| /app/reports | "No reports yet · 0 on file" beside a History listing three | the hub reads `useListWorkspaceReports` (stubbed `[]`); History merges the seed's `report_builder.report_history`. In production both carry the API list; the hub does not merge the seed history, filed as P3 below |
| /app/listen/signal | "Signals appear here once analysis has run" | reads the run list |
| /app/overview/updates | checklist step 2 unchecked, "Next: Run analysis" | reads the run list |
| /app/settings/integrations | "not connected" for a live connection | `GET …/live-connection` stubbed |

## B. Confirmed, data honesty (round 5 PR unless noted)

| Route | Finding | Verdict | Action |
|---|---|---|---|
| /app/analysis/audience | RESULTS tile 0 beside a prime segment carrying 1,270 results | fixed, commit d482836 (audit round 4): a strict null total is a dash with the reason | shipped with PR #219 |
| /app/analysis/overview | IAP Library module "606 variable rows" for a run of 126 | fixed, d482836 | shipped with PR #219 |
| /app/analysis/library | "No cells in selection · adjust the metric selection" above 629 ad tiles | fixed, d482836 | shipped with PR #219 |
| /app/analysis/dna | TOTAL SPEND $68,535 (account $42,290) and $10,289 (Bookster, account $8,000); IMPRESSIONS 0 | confirmed: `dnaSource` sums the variable rows, one row per token an ad carries, so an ad counts once per token; impressions are null on the rows and read 0 | round 5: totals from the ad rows (`ads[].performance`) or the cell rows, never variable rows; a dash for a field the rows do not carry |
| /app/analysis/funnel | INTENT and CONVERSION stages empty on accounts with 4,323 leads / 486 installs | confirmed: the funnel reads only `adds_to_cart` / `checkouts_initiated` / `purchases` from the demographic rows (ecommerce hardcoding, CLAUDE.md's known systemic defect) | round 5: stage the funnel from the account's derived result events (link clicks → intermediate events → terminal event), name the events it reads, say when the cohort has no intermediate event |
| /app/analysis/overview (Bookster) | "By result type" donut omits Mobile app installs ($4,766) and Checkouts ($1,746) | confirmed: the donut reads `performance_by_cell` result types only; the account's larger events live on ad rows | round 5: read `result_events` when present, else label the donut "from cell rows" |
| /app/analysis/performance (Bookster) | IAP Library card "12 cell rows" vs Overview "8 cell rows" vs Library "4 of 4 cells" | confirmed in principle (three counts, three scopings); the exact rule per surface to be read | round 5 |
| /app/analysis/library (no-cell) | tiles "53 ads · $8,455 · 2,649" beside "ADS WITHOUT CREATIVE CELLS (629)" | confirmed as a missing coverage note: the tiles read the result scope (All conversions), the grid every ad; the scope bar says which but the count tile does not | round 5: the count tile's sub reads "of 629 ads · 576 under other result types" |
| /app/analysis/library (no-cell) | "Top performers 0", "Ad copy 0" | fixture: the fixture account has no `top_performers_event` and no `ads[].creative`; Pure Path has both (PR #218 tests) | none |
| /app/analysis/library (Bookster) | 15 "no performance data yet" cards read SPEND $0 · 0 results | confirmed | round 5: a dash when no performance row exists |
| /app/settings/general, /app/settings/integrations | a manual account reads "Meta ad account · Meta Ads · connected" with a CONNECTED badge; Integrations prints the raw `manual_reports` / `imported_from_iap_loop_package` | confirmed: both read `status === "configured"`, not `source_status` (the source-is-the-source decision) | round 5: read `isManualAccount` / `hasLiveMetaConnection`; "Manual reports" / "Imported package" / "Live Meta connection" |
| /app/settings/general | "Objectives" module with check-marked cards and "Terminal metric: purchases / ROAS" | partly confirmed: the section is read-only ("Determined from your data") and shows the derived objective, which the owner decision (2026-09-01) says is an analysis lens, not a property to describe an account to a reader | round 5: remove the module; the run's coverage report already names the terminal metric |
| /app/settings/general | "SAMPLE / DEMO DATA" on a real manual account | confirmed: static text | round 5: read the seed's `integrity_note` / environment |
| /app/analysis/budget (no-cell) | "No cell rows match the current metric selection" on an account with no cell library | confirmed (same class as the Library note) | round 5 |
| /app/analysis/performance, /app/strategy/avatars, /app/analysis/placements | demographic-row subsets ($26,907 / 732,861) shown under the account scope with no coverage share | confirmed: the demographic and placement exports cover a share of spend; the surfaces say "this result scope" where the difference is coverage | round 5: "from demographic rows · N% of spend" from the reconciliation summary |
| /app/reports | hub counts API reports only; History merges seed history | confirmed (P3) | round 7 |

## C. Confirmed, layout at 390 px (round 6 PR)

| Route | Finding | Verdict |
|---|---|---|
| /app/analysis/overview | KPI values clip mid-number ("$8,0", "2,57", "5,84") in a 2×2 grid beside the donut; Top placements loses its name column | confirmed in the shot |
| /app/strategy/overview | message pillar cards two per row, titles clamp to letters ("15 M", "Rc S."); "Hypothesis sta…" and "Variabl…" side by side | confirmed in the shot |
| /app/strategy/map | three panes do not stack; the hypotheses rail clips; the detail pane is not rendered | confirmed by both reports; to re-shoot after the fix |
| 39 account-scoped pages | H1 clips the account name mid-token ("Fresh Import 1786839868") | confirmed by both reports (Account Overview wraps) |
| /app/analysis/placements, /app/analysis/funnel, /app/analysis/budget | bars collapse to stubs; values clip inside bars; the metric segmented control renders as an empty pill | confirmed by both reports |
| /app/creative/builder | CTA chip does not wrap, the hook renders one word per line; key/value grid overflows | confirmed by both reports |
| /app/account | loop chain, results table header and loop tabs clip with no scroll affordance | confirmed by both reports |
| /app/strategy/hypotheses, /app/strategy/avatars, /app/mst/sprints, /app/reports/builder, /app/reports/history, /app/creative/scan | tables and tab bars clip at the container edge with no scroller | confirmed by both reports |
| /app/settings/billing | paragraph edge to edge | confirmed |
| /app/exports/reports (no-cell) | the page never leaves the boot splash at 390 | unverified: re-shoot with `SHOOT_ONLY` |
| /app/settings/provenance | the lower ~2,450 px of the 390 capture is blank canvas | unverified: capture cap or paint; re-shoot |

## D. Confirmed, vocabulary and first layer (round 7 PR)

| Finding | Verdict | Action |
|---|---|---|
| Recommendation kinds render "Investigate", "Budget", "Test", "Data" (`KIND_LABEL`), and tiers "Avoid", "Explore", "ELIMINATE", "SCALE WINNERS" | confirmed: `KIND_LABEL` carries eight labels; the rule is four verbs | map budget → Optimize, investigate / test / data → Validate, keep the engine kind in the title attr; tier labels through the same map |
| Raw engine codes on the first layer (`onb_initiate_checkout`, `validation_required`, `traffic_quality`, `placement_engagement_no_conversion`, `cpm_device_divergence`, `audience_network`) on Findings, Action Queue, Listen, Alerts, Report Builder | confirmed by both reports | route through `humanizeDiagnosis` / `eventLabel` / platform labels |
| Hypothesis Queue cards use the sentence as the title | confirmed: `HypothesisQueueView` renders `deriveLabel(h.label, 72)` under the chips; Strategy Map and Avatars use `HypothesisLabel` | one component |
| "Success criteria" label with nothing under it on recommendation tiles | to verify in `RecommendationSlider` | |
| Double arrows "Full → →" on module buttons | confirmed by both reports (text arrow plus icon) | drop the text arrow |
| MST centre has no pages strip | confirmed: `explore={mstReady ? children : []}` hides the strip until a matrix exists; every other centre renders it always | always pass the pages |
| Listen "Connect Meta in Settings" strip on a manual account | to verify against `isManualAccount` | |
| Warning-glyph overload (Hypotheses, Alerts, Findings, Signals worth acting on) | confirmed by both reports; the friction ratchet holds the counts, so a fix lowers the baseline | caveats behind `DetailReveal`, one glyph per module |
| Raw table names as source chips on every page | by design (Q6 provenance labels, 2026-09-04): the chip names the source and opens the tooltip; a humanised label with the table behind it is a later polish | round 7 if time allows |
| "Render MST as active for Bookster." notice | imported `integrity_note` text; by data | replace the note in the package or render it as provenance, not a warning |
| Two "›" chevrons at the bottom right of every 1440 page; a floating clipboard with a badge under the topbar | confirmed: the task tray's collapsed rail renders two "Expand task tray" handles (a clickable div and a button, `TaskTray.tsx` 741 to 754) under its badge button; the badge button is the rail's own toggle beside the topbar's "Tray" | round 7: one handle, labelled; the rail's badge deferred to the topbar count |

## E. Polish (P3, folded into the nearest round)

Orphan "Data window ⓘ" label and the floating "Re-run analysis" button on Analysis Overview; the
uppercase sentence under the heatmap; "$0 / $1" heatmap cell; "n/a" instead of "–" on Account
Overview; duplicate tray affordances (topbar "Tray 9+" plus the floating clipboard); NBA tile
numerals with no label; three stacked empty frames on Updates; the Creative Scan tile "0 · Scan not
yet run" beside a dash; the leftover "Run analysis · Moved to the Analysis command center" card and
the amber "Use Metrix branding on first load" rule on Settings; raw ISO timestamps and zip filenames
on Provenance; the Exports grid mixing two card anatomies; Listen's two half-width single-number
tiles; Alerts' thirteen amber boxes with raw source labels.

## F. Rounds

- **Round 5, data honesty** (B): DNA totals, funnel stages from result events, the Overview donut,
  the cell-row counts, the Library coverage sub, the "$0" creative-only cards, the Settings
  connection and objectives, the demographic coverage share, the Budget cause.
- **Round 6, 390 px layout** (C): the KPI 2×2 grid, the pillar grid, the Strategy Map panes, the
  H1 wrap, bars and segmented controls, the Creative builder, the clipped tables and tab bars.
- **Round 7, vocabulary and first layer** (D, E): the four verbs, the raw codes, the hypothesis
  titles, the MST strip, the double arrows, the glyph overload, the Reports hub merge.

Each round ships as one PR through the full bar (typecheck, the full app suite, the static gates,
the five browser gates against the dev server, the em-dash guard), is merged on green, converged
and published, and re-shot; the re-shoot's verdicts go into this file beside the originals.
