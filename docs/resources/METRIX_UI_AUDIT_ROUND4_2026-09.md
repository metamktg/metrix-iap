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
| /app/analysis/dna | TOTAL SPEND $68,535 (account $42,290) and $10,289 (Bookster, account $8,000); IMPRESSIONS 0 | confirmed: `dnaSource` sums the variable rows, one row per token an ad carries, so an ad counts once per token; impressions are null on the rows and read 0 | fixed, round 5 (change-log 32): the tiles read the campaign summary under the page's scope (`scopedAccountTotals`), captioned as account totals |
| /app/analysis/funnel | INTENT and CONVERSION stages empty on accounts with 4,323 leads / 486 installs | confirmed: the funnel reads only `adds_to_cart` / `checkouts_initiated` / `purchases` from the demographic rows (ecommerce hardcoding, CLAUDE.md's known systemic defect) | fixed, round 5: `buildFunnelStages` reads the rows' Result type (intermediate → intent, terminal → conversion), the export's columns win for their event, `describeLowerFunnel` names what the export lacked |
| /app/analysis/overview (Bookster) | "By result type" donut omits Mobile app installs ($4,766) and Checkouts ($1,746) | confirmed: the donut reads `performance_by_cell` result types only; the account's larger events live on ad rows | fixed, round 5: the donut reads the campaign summary's per-event totals (`resultTypeSpendSplit`) and carries its source; cell rows only under a narrowed run selection |
| /app/analysis/performance (Bookster) | IAP Library card "12 cell rows" vs Overview "8 cell rows" vs Library "4 of 4 cells" | confirmed: Ad Performance counted every cell × event row of every run's variables, the Overview the scoped rows, the Library distinct cells | fixed, round 5: cells are counted as cells (`countCells`) on all three, ads with performance when there is no cell library, the variable rows the current run's |
| /app/analysis/library (no-cell) | tiles "53 ads · $8,455 · 2,649" beside "ADS WITHOUT CREATIVE CELLS (629)" | confirmed as a missing coverage note: the tiles read the result scope (All conversions), the grid every ad; the scope bar says which but the count tile does not | fixed, round 5: the count tile's sub reads "of 629 ads with performance · 576 under other result types" |
| /app/analysis/library (no-cell) | "Top performers 0", "Ad copy 0" | fixture: the fixture account has no `top_performers_event` and no `ads[].creative`; Pure Path has both (PR #218 tests) | none |
| /app/analysis/library (Bookster) | 15 "no performance data yet" cards read SPEND $0 · 0 results | confirmed | fixed, round 5: null stats, rendered as a dash (`creative-card-null-stats.test.tsx`) |
| /app/settings/general, /app/settings/integrations | a manual account reads "Meta ad account · Meta Ads · connected" with a CONNECTED badge; Integrations prints the raw `manual_reports` / `imported_from_iap_loop_package` | confirmed: both read `status === "configured"`, not `source_status` (the source-is-the-source decision) | fixed, round 5: `describeAccountSource` on General, the agency list and the per-account panel; only a live connection reads as connected |
| /app/settings/general | "Objectives" module with check-marked cards and "Terminal metric: purchases / ROAS" | partly confirmed: the section is read-only ("Determined from your data") and shows the derived objective, which the owner decision (2026-09-01) says is an analysis lens, not a property to describe an account to a reader | fixed, round 5: module removed, `cohortOptions.ts` deleted, `check:cohort-reach` no longer allows settings |
| /app/settings/general | "SAMPLE / DEMO DATA" on a real manual account | confirmed: static text | fixed, round 5: the line names the seed and its assembly date, the integrity note behind "About this data" |
| /app/analysis/budget (no-cell) | "No cell rows match the current metric selection" on an account with no cell library | confirmed (same class as the Library note) | fixed, round 5: "No creative cell library" with the ad count and a link to the Library |
| /app/analysis/performance, /app/strategy/avatars, /app/analysis/placements | demographic-row subsets ($26,907 / 732,861) shown under the account scope with no coverage share | confirmed: the demographic and placement exports cover a share of spend; the surfaces say "this result scope" where the difference is coverage | fixed, round 5: `breakdownSpendShare` (reconciliation summary first, else rows against the summary total) on the Audience stats, the funnel caption, the Avatars row and the Placement spend tile |
| /app/reports | hub counts API reports only; History merges seed history | confirmed (P3) | round 7 |

## C. Confirmed, layout at 390 px (round 6 PR)

| Route | Finding | Verdict | Round 6 |
|---|---|---|---|
| /app/analysis/overview | KPI values clip mid-number ("$8,0", "2,57", "5,84") in a 2×2 grid beside the donut; Top placements loses its name column | confirmed in the shot | fixed, round 6 (change-log 33): the donut sits under the 2×2 grid below lg; re-shot at 390, every value whole, the placement names present |
| /app/strategy/overview | message pillar cards two per row, titles clamp to letters ("15 M", "Rc S."); "Hypothesis sta…" and "Variabl…" side by side | confirmed in the shot | fixed, round 6: `grid-cols-dashboard-3-md` (one column on a phone), the donut over the heatmap below lg; re-shot, every pillar title whole |
| /app/strategy/map | three panes do not stack; the hypotheses rail clips; the detail pane is not rendered | confirmed by both reports; to re-shoot after the fix | fixed, round 6: the panes stack below lg; the first cut left the centre pane at 0 px (a zero flex basis with a zero automatic minimum, measured by a probe on every account), now `flex-none`; re-shot on Bookster and the no-cell account, rail · statement · source cells · hypotheses in order |
| 39 account-scoped pages | H1 clips the account name mid-token ("Fresh Import 1786839868") | confirmed by both reports (Account Overview wraps) | fixed, round 6: the H1 may break below lg ("Fresh Import / 1786839868960 · / Analysis Overview"); beside a right-hand chip it then broke inside words ("Bookst / er ·"), so the title block asks for 16 rem and the chip wraps under it; re-shot on Creative Scan, Sprints, Creative DNA and Data provenance |
| /app/analysis/placements, /app/analysis/funnel, /app/analysis/budget | bars collapse to stubs; values clip inside bars; the metric segmented control renders as an empty pill | confirmed by both reports | fixed, round 6: fractional label columns below sm, the funnel's share yields to the value, `SegmentedToggle` keeps its label when the option has no icon; re-shot, every bar with a track and a value, the Budget switch reading Spend · Results · CPA · Clicks |
| /app/creative/builder | CTA chip does not wrap, the hook renders one word per line; key/value grid overflows | confirmed by both reports | fixed, round 6: the hook row wraps, the spec grid is one column under 420 px; re-shot, the hook a paragraph, every spec cell whole |
| /app/account | loop chain, results table header and loop tabs clip with no scroll affordance | confirmed by both reports | fixed, round 6: `.mx-scroll-x` with the scroll-driven edge fade, the table floor; re-shot, the chain and the table scroll with the fade at the overflowing edge (`check:scroll-fade`: the stepper overflows 251 px, fades 0 / 14 px at rest) |
| /app/strategy/hypotheses, /app/strategy/avatars, /app/mst/sprints, /app/reports/builder, /app/reports/history, /app/creative/scan | tables and tab bars clip at the container edge with no scroller | confirmed by both reports | fixed, round 6: the shared scroller on every rail and the `min-width: max-content` floor on a table inside one; re-shot on all six, the tables scroll instead of squeezing; Report History's card also squeezed its text beside two buttons that never shrink, now the buttons wrap under it |
| /app/settings/billing | paragraph edge to edge | confirmed | fixed, round 6: `PendingState` and `NoDataInRangeState` carry `px-6`; re-shot |
| /app/exports/reports (no-cell) | the page never leaves the boot splash at 390 | unverified: re-shoot with `SHOOT_ONLY` | re-shot alone at 390 on the no-cell account: renders ("No report configuration yet"), 0 errors; the round-4 capture was the crawl's timing, not the page |
| /app/settings/provenance | the lower ~2,450 px of the 390 capture is blank canvas | unverified: capture cap or paint; re-shoot | re-shot alone at 390: content to the foot (a 9,774 px page, the crawl's cap is the capture); the H1 read one letter a line beside the provenance chip until the header fix, now one line |

## D. Confirmed, vocabulary and first layer (round 7 PR)

| Finding | Verdict | Action | Round 7 |
|---|---|---|---|
| Recommendation kinds render "Investigate", "Budget", "Test", "Data" (`KIND_LABEL`), and tiers "Avoid", "Explore", "ELIMINATE", "SCALE WINNERS" | confirmed: `KIND_LABEL` carries eight labels; the rule is four verbs | map budget → Optimize, investigate / test / data → Validate, keep the engine kind in the title attr; tier labels through the same map | fixed, round 7 (change-log 34): `KIND_LABEL` maps the eight kinds onto the four verbs with the kind on the chip's title (`engineKindNote`), `BUCKET_LABEL` and Findings' `tierBadge` speak the same four |
| Raw engine codes on the first layer (`onb_initiate_checkout`, `validation_required`, `traffic_quality`, `placement_engagement_no_conversion`, `cpm_device_divergence`, `audience_network`) on Findings, Action Queue, Listen, Alerts, Report Builder | confirmed by both reports | route through `humanizeDiagnosis` / `eventLabel` / platform labels | fixed, round 7: `flagHeadline` and the failure-pattern diagnosis through `humanizeDiagnosis`, the flag's platform through `platformLabel`, Listen's Scopes tile spaces an unknown key; the recommendation kinds above were the remaining raw words on the Action Queue |
| Hypothesis Queue cards use the sentence as the title | confirmed: `HypothesisQueueView` renders `deriveLabel(h.label, 72)` under the chips; Strategy Map and Avatars use `HypothesisLabel` | one component | fixed, round 7: the queue renders `HypothesisLabel` with `inButton` (a static clamp, the whole sentence on the title, no control inside the button card) |
| "Success criteria" label with nothing under it on recommendation tiles | to verify in `RecommendationSlider` | | confirmed and fixed, round 7: the derived test recommendation's rationale was `Success criteria: <sentence>` and `deriveLabel` cuts at the colon; the sentence is the rationale, the drawer keeps the labelled field |
| Double arrows "Full → →" on module buttons | confirmed by both reports (text arrow plus icon) | drop the text arrow | fixed, round 7: thirteen labels; `round7-vocabulary.test.tsx` fails any `CrossLink` label under pages or components that ends in an arrow |
| MST centre has no pages strip | confirmed: `explore={mstReady ? children : []}` hides the strip until a matrix exists; every other centre renders it always | always pass the pages | fixed, round 7: `explore={children}` |
| Listen "Connect Meta in Settings" strip on a manual account | to verify against `isManualAccount` | | confirmed and fixed, round 7: `ConnectionNudgeBanner` takes the account and renders nothing for `source_status: "manual_reports"`; imported and legacy accounts keep the nudge |
| Warning-glyph overload (Hypotheses, Alerts, Findings, Signals worth acting on) | confirmed by both reports; the friction ratchet holds the counts, so a fix lowers the baseline | caveats behind `DetailReveal`, one glyph per module | partly, round 7: Alerts' data-quality findings show three and fold the rest, the two logo-policy caveats are captions; the per-card risk glyphs on Hypotheses and Findings stay (each names a different risk) and the friction baseline records the new counts |
| Raw table names as source chips on every page | by design (Q6 provenance labels, 2026-09-04): the chip names the source and opens the tooltip; a humanised label with the table behind it is a later polish | round 7 if time allows | not in round 7 (recorded in change-log 34 as held) |
| "Render MST as active for Bookster." notice | imported `integrity_note` text; by data | replace the note in the package or render it as provenance, not a warning | not in round 7 (recorded in change-log 34 as held) |
| Two "›" chevrons at the bottom right of every 1440 page; a floating clipboard with a badge under the topbar | confirmed: the task tray's collapsed rail renders two "Expand task tray" handles (a clickable div and a button, `TaskTray.tsx` 741 to 754) under its badge button; the badge button is the rail's own toggle beside the topbar's "Tray" | round 7: one handle, labelled; the rail's badge deferred to the topbar count | fixed, round 7: the strip is one labelled button (the priority cue as its colour), the count lives on the topbar's Tray button, `TaskTray.test.tsx` asserts one handle and the topbar's count |

## E. Polish (P3, folded into the nearest round)

Round 7 (change-log 34) closed: the Data window row and the re-run link on Analysis Overview, the
heatmap caption and the sub-dollar CPA, "n/a" on Account Overview, the tray's duplicate
affordances, the three empty frames on Updates, the Creative Scan "0" tile, the leftover "Run
analysis" card and the amber logo-policy rule on Settings and the Report Builder, the ISO stamp on
Provenance, Listen's tile grid, Alerts' fold. Open: NBA tile numerals with no label, the Exports
grid's two card anatomies, Provenance's zip filenames (data), Alerts' raw source labels (the
source-chip decision above).


Orphan "Data window ⓘ" label and the floating "Re-run analysis" button on Analysis Overview; the
uppercase sentence under the heatmap; "$0 / $1" heatmap cell; "n/a" instead of "–" on Account
Overview; duplicate tray affordances (topbar "Tray 9+" plus the floating clipboard); NBA tile
numerals with no label; three stacked empty frames on Updates; the Creative Scan tile "0 · Scan not
yet run" beside a dash; the leftover "Run analysis · Moved to the Analysis command center" card and
the amber "Use Metrix branding on first load" rule on Settings; raw ISO timestamps and zip filenames
on Provenance; the Exports grid mixing two card anatomies; Listen's two half-width single-number
tiles; Alerts' thirteen amber boxes with raw source labels.

## G. Design conformance pass (round 8 PR)

The owner's flag of 2026-09-05 ("significant UI interface regressions … incorporate the UI/UX
design interface into our validation process") opened this section. Its findings come from two
sources: `check:controls` (new, `scripts/src/check-controls.mjs`), the first check in the bar to
OPEN a control, and a read of the round 7 crawl (204 shots, both accounts, both widths) against
the standard's checklist (`docs/resources/METRIX_DESIGN_CONFORMANCE_PASS_2026-09.md` §2). The
pass itself, and what it must catch, is that document; this section is the register of what it
caught.

### G.1 Controls (`check:controls`, 404 controls across 204 visits)

- **KPI tile metric picker unbounded, unreachable, unlabelled** (`KpiMetricDropdown`, every KPI
  tile on Analysis Overview, Ad Performance, Budget, Avatars, the creative dialogs and the
  drill-downs). The hand-portalled fixed menu was as tall as its catalog (633 px on Analysis
  Overview): past the bottom of a 900 px window, past the fold at 390 px with no way to reach
  the lower rows (the window scroll listener closed it on its own scroll), promised
  `aria-haspopup="listbox"` and rendered a div with no role, and had no Escape. `confirmed`,
  `fixed` (round 8): bounded to the viewport's room (below the trigger, or above it when there
  is more room there), internal scroll, `role="listbox"` of `role="option"` rows in labelled
  groups, named by the trigger through `aria-controls`, Escape closes and returns focus.
- **Tile metric pickers on the shared Popover off the viewport at 390 px** (`MetricPickerTile`
  and `RankSortBar` in `analysis/rankSort.tsx`, `MetricPickerButton` in
  `creative/MetricPicker.tsx`): a 490 px catalog with no height bound and no collision padding
  flipped above the Audience page's "Spend" tile and ran 34 px past the top of the screen.
  `confirmed`, `fixed` (round 8): bounded to `--radix-popover-content-available-height` with an
  internal scroll; `PopoverContent` and `HoverCardContent` in `artifacts/command-deck` default
  `collisionPadding` to 8 so every popover in the product keeps off the edges.
- Every other control (402 of 404, and the six native selects) opened, was populated, kept
  inside the viewport, carried its promised role and closed on Escape at both widths on both
  accounts.

### G.2 The crawl, read against the standard

Two reviewers read every shot of the round 7 crawl (Bookster: 51 routes × 2 widths; the no-cell
manual account: 51 × 2), each against §2 of the standard and against §A to §E of this register,
so a stub artifact or a row already filed was not filed twice. Their two reports, reconciled
against the code, give the rows below. `fixed` rows carry round 8's PR; `round 9` rows are
task #53's, filed here so nothing is dropped; `data` means the reviewer read an imported string,
not app copy; `by design` names the decision.

**Defects (a figure or a surface a reader cannot use)**

- **Engagement Funnel and the Ad Performance funnel card read 3,074 purchases and 1,244
  leads on the no-cell account where Account Overview reads 26 purchases and 4,323 leads**, and
  no caption named the rows. Reconciled: the funnel reads the demographic export's own rows
  (3 rows "Website purchases", $17,965, 3,074 results; 15 rows "Leads (form)", $8,935, 1,244),
  Account Overview the ad summary's ($987 and 26 under "Website purchases", $17,417 and 2,847
  under an unclassified result type). The two exports disagree on what they call the same ads;
  neither figure is fabricated, and nothing on the page said which export it read. `fixed`: both
  funnels carry their source on the first layer ("Read from the demographic export · 64% of
  spend"), the share the reconciliation summary reports; the disagreement between the two
  exports is the reconciliation waterfall's (task #34).
- **Ad Performance's funnel read 31,542 impressions under a KPI tile reading 2,572,802**
  (Bookster; the same on the Funnel page beside Budget), with no share between them. Same
  cause, same fix: the export is 9% of the account's spend, and the line above the bars says so.
- **Engagement Funnel's intent and conversion bands read "No … data in this window" on
  Bookster while Audience read 78 registrations off the same rows.** Bookster's 62 rows carry
  no Result type; their $701.29 and 31,542 impressions are exactly the summary's "Website
  registrations completed" and nothing else's. `fixed`: `summaryEventForRows` names an untyped
  export's event from the campaign summary when exactly one event owns its totals (never when
  the rows carry a type, never "unknown", never when two events could); the stage says it was
  "Read from the campaign summary's result type".
- **Strategy Map at 390 px cut the hypotheses pane off under the "Next actions" strip** (the
  P1 card's sentence, its More and its ISOLATES line unreachable; the page 1,264 px tall, so
  not the capture). Round 6 gave the centre column `overflow-visible` below lg and left the
  right pane scrolling inside itself. `fixed`: the pane flows in the page below lg.
- **Creative DNA's formula cards at 390 px rendered two per row at 150 px**, badges clipped to
  "VALIDATE" and "Med", the third card's title gone. `fixed`: `grid-cols-dashboard-3-md`, one
  column on a phone (the round 6 token the pillar grid already uses).

**Regressions, fixed in round 8**

- Ad Performance's module chip row at 390 px clipped the Audience row's "Open" link at the
  card edge (both accounts): the text column now yields before the link does.
- Analysis Overview's "By result type" donut: five segments and no legend (`showLegend` only
  under four). The legend renders always; Strategy Overview's hypothesis donut the same.
- Audience's positioning map: "median" split by the C1 mark, "EXPLORE" and "AVOID" under C6
  and C4 (the corner words sat where a low-results group lands). The quadrants are a legend
  above the plot with what each means; the medians are a line under it with their values; the
  in-plot words are gone. The quadrant labels speak the four verbs (Validate, Retire).
- Audience's KPI row read the demographic export with no share of the account (Bookster's
  "All conversions" scope over a 9% export): a source line under the tiles.
- Engagement Funnel rendered the "vs previous stage / vs top of funnel" switch once per band
  (three controls for one choice) and a "CTR comparison" module repeating the KPI row's three
  rates: one switch above the bands, the ratio line the module alone carried kept.
- Two amber notices on the Funnel page (the lower-funnel note and the video caveat): the video
  caveat is a disclosure line.
- Strategy Overview at 1440 px: "Hypothesis sta…" in a 200 px column, family-map labels cut to
  "FRAME…" and "CONC…": the donut column is 260 px, the label column `minmax(112px,150px)`.
- Audience at 390 px: "Share of spend vs. share of re…": a `SectionCard` title wraps below lg
  and stays one line from lg up (the round 6 rule, applied to the module title). The dumbbell
  rows drew one dot per row at 390 px (three grid columns left the rail no width, so both dots
  sat on one point): below sm the plot takes a row of its own under the label.
- MST centre's avatars read "Spend share 0% of top" for two avatars with no stat row: a share
  needs a performance row.
- MST › Creative Scan read "MAPPED TO PERFORMANCE 0 · HIGH MAPPING CONFIDENCE 0" before any
  scan, where Creative › Creative Scan reads a dash: a dash until a cell carries a grade.
- Creative › Creative Scan read "LIBRARY ASSETS 9" for nine concept cells with no asset, and
  rendered a five-column table header over its empty state: assets are staged files, the checks
  are chips inside the empty state.
- The Analysis centre's export row counted every run's variable rows (606 for a run of 126) and
  no ads; the Exports page card and Exports › Analysis read "Run analysis first" on an account
  whose run completed (the engine writes no cell library). One read, `lib/analysisExport.ts`:
  cells when the importer wrote them, else one row per ad with performance, and the current
  run's variable rows; empty only with no row at all.
- Findings read "No intelligence data yet · Run the full IAP loop" on an account whose run
  completed: it names the missing intelligence package (the analysis run does not produce one)
  and links to Ad Performance.
- Two "Full history" links on the Analysis centre (the hub's and the run card's): the hub's stays.
- "Date range to analyze" read as a label with nothing under it: the chosen range sits beside it.
- "READY FOR BRIEF 0" beside "DRAFT BRIEFS 16" on three Strategy pages: "Hypotheses ready for
  brief" (the count is of hypotheses, and it was honest).
- The four verbs, where round 7 left them: Ad Performance's tier chips (Explore · Avoid),
  Strategy Overview's playbook lanes (SCALE NOW · EXPLORE · AVOID), Direction's "Validate +
  avoid", the positioning map. The explore list folds into Validate, avoid is Retire, one
  key (`bucketVerbKey`).
- The status hub's input labels broke inside themselves at 390 px ("Nothing / staged"): a
  label is one fragment; the detail wraps under it.

**Filed for round 9 (task #53), confirmed**

- First-layer prose over 220 characters: the Creative hub's brief cards (~300 characters, no
  clamp), the Strategy Map's ISOLATES line (~500), Avatars' recommendation at 1440 (~560; the
  390 px clamp holds), Direction's budget reallocation at 1440, Provenance's source-file values.
- IAP Library: an amber "Map creative" chip on every one of 629 tiles; the count tile ("53 of
  399") against the grid ("629") and the tab ("Creative cells 0" over 629 items); tiles with no
  stats block beside tiles with one; stat labels and ad names clipped; three tile anatomies and
  an orphan ⓘ (Bookster: tab 8, tile 4, "4 of 4", 15 without performance).
- Creative builder: titles squeezed beside the GENERATED · HIGH badge; identifiers breaking
  mid-word; raw GEN_BRIEF and GEN_ICP ids and CN_/FW_ chip codes where names exist (also
  Communications, the Strategy Map and the Overview's pillar chips); "Generated 8/23/2026".
- Report Builder: `onb_initiate_checkout`, `audience_network`, `PAIN_PROOF`; a paragraph
  printed twice; hypothesis rows clipped mid-word; a sentence in the micro-label role; C2B three
  times with nothing saying why. Reports "FORMATS pdf · google_doc · html"; Report History
  `white_label`; Settings General "formats: pdf, google_doc, html"; Act queue `audience_network`
  and "Cpm"; Provenance's stage keys and unformatted totals; the Action agent's table names.
- Every section header carries two ⓘ that look the same (purpose and provenance).
- Empty states whose action is prose only: Analysis and Strategy History, Sprints, Exports ›
  Reports, the Report Builder's dead end, the Members header over no rows, Creative Scan's two
  notices.
- Layout: Avatars at 1440 scrolls ~2,150 px past its last module; Avatars and Settings General
  at 390 squeeze text beside a right-hand slot; Analysis Overview's "Daily / trend" title and
  the two adjacent ⓘ; the Library's view switcher and buttons at 390; the creative builder's
  list before its detail at 390; the NBA rail's fourth tile cut with no fade at 1440.
- Vocabulary and counts: Cross-Map named three ways; "concepts" 4 / 6 / 9 / 15 across four
  pages; Alerts "ACTIVE ALERTS 1" over no alert; Listen's "→ Review Analysis →"; Exports' two
  card anatomies; Placements' "V3 + C4E" (task #38); Budget's zero-result Checkouts dropped
  while zero-result Trials stays; DNA's gene-loci axis caption; Strategy Overview's empty
  pillar-coverage bars and one-segment donut; the MST centre's scope bar above the spine;
  Avatars' "TOTAL SPEND $26,906.86" against Audience's "$26,907"; the accent border on one tile
  per KPI row with no stated meaning.

**Not defects**

- "N/A - diagnostic, not creative test", "SCALE WINNERS", "ELIMINATE", "VALIDATE AT SCALE",
  "AVOID / REBUILD", the Golden formula's em dash, the ISOLATES paragraphs' wording: `data`,
  imported strategy and intelligence text, rendered as it arrived.
- Creative DNA opens on "Unclassified result type" (no-cell) or "Checkouts initiated"
  (Bookster) while its siblings open on "All conversions": `by design`, each surface lands on
  the scope its own rows carry (`defaultScopeId`), and DNA's variable rows carry those events.
- "Run analysis" dimmed on the Analysis centre, empty run lists, the GENERATED badge beside an
  empty hub, "Objectives · Ecommerce + Lead Generation" on the run card: `stub artifact` (the
  crawl's stubs answer `{}` for imports and runs); the objectives line is the run card's lens
  label and is task #37's.
- Provenance at 390 blank below ~6,000 px: the crawl's paint cap (§C).
- Pages that passed at both widths on both accounts: Exports › Brief and › Strategy, Listen
  › Recommendations, Report History, Settings › Billing and › Security; Bookster also Action
  agent, Analysis and Strategy History, Exports › Analysis and › Reports, Listen › Signal,
  Sprints, Updates.

## F. Rounds

- **Round 5, data honesty** (B): DNA totals, funnel stages from result events, the Overview donut,
  the cell-row counts, the Library coverage sub, the "$0" creative-only cards, the Settings
  connection and objectives, the demographic coverage share, the Budget cause. Shipped: PR #220,
  merged `d93aa365`, live on app.metrix.ad 2026-09-05 17:56Z (change-log 32, Live).
- **Round 6, 390 px layout** (C): the KPI 2×2 grid, the pillar grid, the Strategy Map panes, the
  H1 wrap, bars and segmented controls, the Creative builder, the clipped tables and tab bars.
  Every row carries its re-shoot verdict (change-log 33). Shipped: PR #221, merged `8f6a226e`,
  live on app.metrix.ad 2026-09-05 19:08Z (change-log 33, Live).
- **Round 7, vocabulary and first layer** (D, E): the four verbs, the raw codes, the hypothesis
  titles, the MST strip, the double arrows, the glyph overload, the Reports hub merge. Every row
  carries its verdict (change-log 34); the Reports hub merge is held for the sweep's slice 5.
  Shipped: PR #222, merged `0ca2cb15`, live on app.metrix.ad 2026-09-05 20:04Z (change-log 34, Live).

Each round ships as one PR through the full bar (typecheck, the full app suite, the static gates,
the five browser gates against the dev server, the em-dash guard), is merged on green, converged
and published, and re-shot; the re-shoot's verdicts go into this file beside the originals.
