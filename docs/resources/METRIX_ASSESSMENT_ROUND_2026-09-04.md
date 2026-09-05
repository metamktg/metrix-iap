# METRIX, assessment round 2026-09-04: three validation passes, two high-confidence passes, and the execution queue

Owner brief (intent, from the 2026-09-04 messages): *keep executing end to end and autonomously while I am away; triple validation with high-confidence double-check passes; get the interface as user friendly as possible; reconcile the Pure Path uploads against the totals in the files, the run quad-counted rows and spend; hold big schema or implementation changes for approval; then round it up so autonomous execution can start.*

This document is that round-up. §0 says how to read it. §1 to §3 are the three validation passes. §4 and §5 are the two high-confidence passes. §6 is the live record of the Pure Path reconciliation. §7 is the execution queue in the order it runs. §8 is what stays held for the owner.

---

## 0. Read first

- **Every verdict names the command or the file that produced it.** A gate is PASS because its log says so, not because it passed yesterday. The logs live in the session scratchpad under `assess/`; the commands are the ones in `replit.md`.
- **A crawl finding is filed against the route that produced it,** with the screenshot's name, and classified as live (the deployed app would show it) or stub (an artefact of the crawl's stubbed API, which answers every unmapped `/api/metrix/**` call with `{}`).
- **Severity is about the reader, not the code.** HIGH: a reader is told something false or loses data. MEDIUM: a reader is told two contradicting things, or sees a state that is not theirs. LOW: polish a reader would notice second.
- **Nothing here changes runtime behaviour.** The queue in §7 is what will; each item says what proves it when done.

---

## 1. Pass 1, the static battery (no server, no browser)

Run on the branch head at `d185376` (PR #204's commit) before the merge; the merge added no code.

| Check | Verdict | Time |
|---|---|---|
| `pnpm run typecheck` | PASS | 37 s |
| `scripts` unit tests (vitest) | PASS | 3 s |
| api-server pure suites (the CI list in `.github/workflows/ci.yml`) | PASS | 23 s |
| `check:text-primary-contrast` · `check:css-token-contrast` · `check:text-muted-contrast` · `check:command-deck-contrast` | PASS | 1 s each |
| `check:disclosure-rulebook` (ratchet) | PASS | 1 s |
| `check:unused-exports` · `check:signal-weights-drift` · `check:type-scale` · `check:optical-authority` | PASS | 1 s each |
| `check:chart-palette` · `check:token-colors` · `check:stray-shell-output` · `check:payload-legibility` | PASS | 1 s each |
| `check:interaction` (hover-only affordances, 24 px targets, nested buttons) | PASS | 2 s |
| `check:locator-ambiguity` | PASS | 0 s |
| `check:cohort-reach` · `check:command-deck-token-drift` · `check:communications-section-icons` · `check:generation-runs-migration` | PASS | 1 s each |
| `check:ui-inventory` · `check:field-coverage` | PASS | 1 to 2 s |
| `check:metrix-settings-api` | NOT RUN (needs the composite router on port 80; the cloud session has none) | – |
| metrix-iap client tests (vitest, full) | PASS | 213 s |
| `check:api-codegen-drift` (sandbox regen + full typecheck) | PASS | 17 s |

One check could not run here and is not counted either way. It is covered by the smoke in §2 that checks the same routes through the preview server.

---

## 2. Pass 2, the browser gates, the visual crawl and the smokes

A dev server on 5178 served the checked-in fixture through the route-crawl stubs.

| Gate | Verdict | What it measured |
|---|---|---|
| `check:friction` | PASS, clean | 204 visits, 51 routes × 2 accounts × 2 widths. Zero defects (no console error, no overflow, no nested button, no retired copy). 2 routes now sit BELOW their ratchet baseline (a gain to lock, §7 Q7). |
| `check:accessible-names` | PASS | 556 controls, 100% named |
| `check:chart-geometry` | PASS | no clipped or overlapping chart geometry |
| `check:unexplained-dashes` | PASS | 684 dashes, all resolvable to a null rendering or a house label join |
| `shoot:routes` | 102 shots, 51 routes × 2 widths | 0 unlabeled icon buttons on every route; no route reports console or page errors; no horizontal overflow |

Smokes (each boots its own server; api-server smokes with the CI placeholder AI credentials):

| Smoke | Verdict |
|---|---|
| `smoke:metrix-iap-build` (production build, pre-auth forms, deep links, authenticated boot) | PASS (managed routing check skipped, no router here) |
| `smoke:metrix-iap-first-run` (unconfigured manual account at 1440 and 390) | PASS, 6/6 |
| `smoke:metrix-iap-manual-import` (create → upload → map → review → run → grade; malformed CSV; leave gate; xlsx) | PASS, 4/4 |
| `smoke:metrix-iap-route-crawl` (70 routes × 3 accounts) | PASS, 210 clean |
| `smoke:metrix-iap-dom-validity` | PASS, 677 controls across 16 routes |
| `smoke:api-server` (`/api/healthz`) | PASS |
| `smoke:login-page-layout` | PASS, 10/10 |
| `smoke:metrix-iap-ad-account-overview` | PASS, 4/4 |
| remaining `smoke:metrix-iap-*` (avatars tooltips, review queue, section info icons and tooltips, shared layout, hover popover, slider persistence, tests) | see §2.1 |

### 2.1 Smoke completion record

The battery finished at 10:56Z: every smoke PASS. The wrapper `smoke:metrix-iap-tests` ("All Metrix IAP smoke checks passed") ran the avatars tooltips, review queue, section info icons and tooltips, shared layout, hover popover and slider persistence suites inside it; the shared-layout morph suite also ran standalone (PASS). No smoke failed, none was skipped.

---

## 3. Pass 3, reading the crawl

Per-route first-layer text (characters of visible text before any disclosure) at 1440 px, the five heaviest:

| Route | Text | Buttons | Reading |
|---|---|---|---|
| `/app/settings/provenance` | 9,904 | 45 | The audit surface. Exhaustive by design; the record's raw keys render in uppercase (`LOOP_RUN_CLIENT`, `MANUAL_UPLOADS[0]_VERIFICATION`), see F6. |
| `/app/reports/builder` | 7,259 | 19 | The report preview itself; the text IS the deliverable. No finding. |
| `/app/strategy/avatars` | 5,822 | 55 | Four ICP profiles with performance and recommendation on the face, theory behind an expander. Dense but disclosed. No finding. |
| `/app/account` | 5,807 | 155 | The Account Overview at full width: rail, totals, sprint, results by event, core controls, deck. Reads cleanly in the shot; the button count is the deck and the rail's per-tile actions. No finding. |
| `/app/act/queue` | 5,425 | 81 | 23 cards grouped by kind. Consistent anatomy; the TEST group's titles are whole sentences, see F7. |

Every other route is under 3,700 characters. The 390 px shots carry the same text within a few characters of the 1440 px shots, which is the intended behaviour: nothing is hidden by width, only re-flowed.

---

## 4. High-confidence pass A, adversarial review of the two backend hardenings

Scope: PR #203 (`chunkedInsert.ts`, batch-insert recovery) and PR #201 (`schema-apply.ts`, `schema-apply-runner.ts`, per-statement schema apply). PR #202's review ran earlier in the session and produced PR #204, merged this round (`c713fd6`).

### 4.1 Findings

The review ran read-only over `git show 9ae83e8` and `git diff f054ee5^1 f054ee5`, the table definitions in `schema.sql` for every table on the new paths, and a scratch run of the real statement splitter over the real `schema.sql` (242 statements, checked one by one).

What holds in #203, with the evidence: the expected-count arithmetic is right at every recursion depth and against a non-zero baseline (traced lost-before and lost-after at depths 1 to 3); no path can insert a row twice silently, because all thirteen tables carry a unique key a re-sent batch would hit and the two signal tables are wiped per account before their insert; every run-scoped table has `manual_analysis_run_id` and every row builder stamps it; retries are bounded (`attempt >= maxAttempts` throws); nothing is swallowed. What holds in #201: the splitter is sound against the real file (every `$$` body balanced, no comment residue, no statement begins with `begin` or `commit`); the fingerprint is written only after every statement succeeds; a non-lock error is fatal with a non-zero exit; the per-statement split separates nothing unsafely.

| # | Sev | Where | Finding | Disposition |
|---|---|---|---|---|
| A1 | LOW | `chunkedInsert.ts` | A retry that meets 23505 on a run-scoped table fails the run even when a count would prove the original batch landed (a client timeout while PostgREST still commits). Loud failure and cleanup, never corruption; rare. | Open, recorded. |
| A2 | LOW | `analysisEngine.ts` count wrapper | The recovery count filtered on the run id alone; no wide table has an index led by that column, so the baseline read scanned the largest table (~89k rows per run). | Fixed in the hardening PR: the count also filters on `account_id`, which leads every composite index. |
| A3 | LOW | `chunkedInsert.ts` classification | An HTTP-level failure without a SQLSTATE (an HTML 522 page, "timed out") read as a database error; the bare words "network" and "timeout" retried genuine database errors. | Fixed: the HTTP status rides along, 0 or 5xx is retryable, the bare words are gone, "timed out" is in. |
| A4 | LOW | `analysisEngine.ts` creative_assets | The upsert loop stayed on the bare path. | Fixed: an idempotent retry with the same backoff. |
| A5 | LOW | `chunkedInsert.test.ts` | The unscoped test asserted a prefix and never checked `stored`, so a regression in the 23505 branch would pass. | Fixed: both halves planned, calls asserted exactly, stored length asserted. |
| B1 | MEDIUM | `apply-supabase-schema.ts` wait | The running-analysis wait keyed on `status = 'running'` alone. A dead run (a deploy restarted the server mid-run, flipped only lazily on a read) held every later apply for the full wait; the hook then gave up with exit 0 and recorded no fingerprint, so the schema change never landed. The catch also read every error as "nothing running". | Fixed: alive means a sign of life within the engine's 10-minute threshold; only a missing table (42P01) reads as nothing to wait for. |
| B2 | MEDIUM | `apply-supabase-schema.ts` marker table | `metrix_schema_state` is created in `public` by the applier, outside `schema.sql`'s RLS block, so under Supabase's default grants the browser-embedded anon key could read it and write the current fingerprint, turning every later apply into a no-op. | Fixed: RLS enabled and anon/authenticated revoked right after the create, idempotently. |
| B3 | LOW | `post-merge.sh` | The hook's `timeout` targets pnpm, not the node grandchild holding the connection; a second merge could start a second applier beside a surviving one. Data-safe (statements idempotent). | Open, recorded. |
| B4 | LOW | `schema-apply.ts` | The splitter's theoretical gaps (nested block comments, `E'…'` strings, `$` in identifiers, `"a;b"` identifiers) are absent from the file today; a test asserting that would keep them absent. | Open, recorded. |

### 4.2 Verdict

#203 ships as is; #201 needed B1 and B2 before the post-merge hook is relied on in production, and both are in the hardening PR of this round with A2 to A5. A1, B3 and B4 stay recorded.

### 4.3 The reconciliation profile (the stage that held the run)

A second read-only pass synthesised Pure Path's shape (1,751 ads over 30 days: a daily Ad Summary, whole-period Age × Gender, Platform × Placement, Device × Platform × Placement and Gender × Age × Text pivots, 182k rows) and timed the three builds the engine runs synchronously.

| ads | buildObservations | buildTruth | buildLedger | ledger scaling |
|---|---|---|---|---|
| 438 | 1.8 s | 0.3 s | 1.1 s | |
| 875 | 3.0 s | 0.6 s | 4.0 s | 3.6× for 2× ads |
| 1,751 | 6.2 s | 1.2 s | 17.6 s | 4.4× for 2× ads |

`buildLedger` was quadratic in ads: one line (`reconciliation.ts:899`) looked up each ad's result type with `obs.find(...)` over the whole breakdown's observation list, about 98 million string comparisons at this shape, 95% of the ledger's time. Reading the result type off the ad's first observation when its entry is created (four lines) makes the output byte-identical (checked on rows, summary and observations at two sizes) and the ledger 20 to 25 times faster. The observation and truth builds are linear. All three are pure and synchronous, so no heartbeat can fire inside them; the hardening PR writes progress between the three calls, which turns the event loop and attests liveness.

---

## 5. High-confidence pass B, the user journey read for clarity

Method: the Bookster and ECAS fixture accounts, walked through the loop on the shots (Account Overview → Listen → Analysis → Analysis Overview → Strategy → Creative → MST → Action queue → Reports → Provenance) at both widths, asking one question per surface: does the page tell the reader one thing, and is it true for this account?

| # | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| F1 | MEDIUM | Every loop hub eyebrow (`pages/metrix/shared.tsx:518`, the `SECTION` constants such as `"Analysis · 03"`) | Two numberings compete: the eyebrow reads the nav ordinal ("Listen · 02", "Analysis · 03" … "Action · 07") while the sidebar spine and the stage strip number the loop 1 to 6. `replit.md`: one loop shape, one vocabulary, never a competing number. | On a hub the eyebrow reads the loop stage from `navTree` ("Agency view · Stage 2 · Analysis"); sections without a loop stage render the bare label. Update `shared-exports.test.tsx:294`. |
| F2 | MEDIUM | `PrerequisiteGate` (`shared.tsx:2281`) on Strategy, Creative and MST | The gate renders the locked copy ("Run analysis first", "Generate briefs first") whenever `met` is false, and `useStageStatus` returns `unlocked: false` / `status: "none"` while its query is in flight, so every visit shows the lock for one round trip and then swaps. The crawl's "Generate briefs first" beside "16 briefs" and "MST active" is the stub answering `{}` for stage-status; the flash is live. | `PrerequisiteGate` takes `loading` and renders a quiet placeholder until the status resolves; the three centres pass `status.isLoading`. Test: locked copy never appears while loading. |
| F3 | MEDIUM | Analysis centre run card (`ManualAnalysisControls.tsx:1442`), period bar (`shared.tsx:2078`), daily trend (`TrendSection.tsx:121`) | For an account whose analysis came from an imported package (Bookster, ECAS) the page contradicts itself: "No analysis has been run yet." beside "Analysis export · 12 cell rows"; "No data uploaded yet" beside $8,000.84 of spend; "Select a data window to see the daily trend." with no window to select. | Run card: "No in-app run recorded; this account's analysis was imported." when outputs exist without runs. Period bar: "No day-level rows for this account". Trend: "The daily trend needs an ad-level daily export; none is staged for this account." |
| F4 | LOW | `AnalysisOverview.tsx:302`, `:371` | Axis ticks round to thousands with no decimals, so a range under $5k reads "$0k $0k $0k $1k $1k". | One compact-currency tick formatter: plain dollars under $1k, one decimal under $10k, whole k above. |
| F5 | LOW | `HeatMatrix.tsx:227` and `:242` | The legend lists "Not measured" twice: once from `divergingLegend()` (grey, `chartTokens.ts:264`) and once as the hatch. | Filter the diverging entry, as `VerdictLegend` already does (`chartChrome.tsx:191`). |
| F6 | LOW | Data provenance (`/app/settings/provenance`) | Record keys render raw and uppercase (`LOOP_RUN_CLIENT`, `BUNDLE_METADATA_CLIENT_ID`, `MANUAL_UPLOADS[0]_VERIFICATION`). | Humanise the label (underscores to spaces, `[0]` to "upload 1"), keep the raw key in the title attribute. |
| F7 | LOW | Action queue TEST tiles (`ActionQueueView.tsx`) | The tile title is the whole hypothesis sentence ("We believe that isolating Row B …"). Elsewhere a hypothesis shows its code chips first (`HypothesisLabel`). | Reuse `HypothesisLabel` on the queue tile; the sentence stays in Full detail. |
| F8 | LOW | Listen signal cards | A raw reference id shows truncated under the severity chip (`core_reanalysis_read.prim…`). | The id moves to the title attribute; the face shows the source family. |
| F9 | LOW | Creative centre tile "Video + UGC" | "9 · no source-backed drafts yet" reads as 9 briefs and none. | "9 briefs · none source-backed yet". |

Nothing HIGH was found on the journey: no false figure, no lost input, no dead control. The shots that prove each finding are `assess/shots/<route>@1440.png`.

---

## 6. Live record, the Pure Path reconciliation (account `manual_3mqlgWFEyGw3`)

The owner's report: the run quad-counted rows and spend, and new pivots were uploaded for better demographic and placement confidence.

- **Cause, proven and shipped (PR #202, #204).** Meta's ad-level exports without the Day breakdown carry "Reporting starts" on every row; the parser aliased it to "Day", so a whole-period pivot read as one day and every file that covered the same ads was summed. Ad rows: $4,072,100 against Meta's $1,437,538. The rule now: the Day header decides whether a file is a period; files of one class that cover the same ads count once (daily beats whole-period, finer breakdown next, later staged last); breakdown rows carry the period they cover.
- **Run 5e3ad66b** (09:14Z, PR #202 build): correct ad rows written ($1,430,311, 21,034 rows, 1,751 ad ids, 2026-08-04 to 09-02), then failed at 88% writing the ledger: `fetch failed`, PostgREST killed the thread under the seed read storm.
- **Run 628db37d** (09:32Z): same rows, hung in the same stage, reclaimed as stale after 16 minutes of silence.
- **Hardening shipped (PR #203).** A batch is one statement; on a lost connection the run counts the rows it holds and either carries on or resends the batch in halves; database errors never retry.
- **Run 8148628c** (10:16Z, PR #203 build): see §6.1.
- **Hazard recorded (H1).** A failed re-run leaves the account with no ad rows for the window: the rebuild clears the window before its insert and the failure cleanup removes the partial output. Between the failure and the next success the account reads as unconfigured. The fix (write under the run id, swap on success) is a backend change and is held, §8.
- **Hazard recorded (H2).** The seed rebuild pages the whole evidence layer on every invalidation (task 22): 275 PostgREST pages per build while someone uploads or deletes files. That is what killed the two runs. Held for approval, §8.

### 6.0 The re-run on the fixed build, and the read storm after the publish

- **12:20Z** main (PR #205) published. The API server warmed its seed: the evidence reads for the
  now-successful run (162k ledger rows, 76k breakdown rows) used offset pages under a filter the
  composite index could not serve, so every page re-scanned the 292k-row ledger; PostgREST killed
  the later pages on its statement timeout, the read fell back to an empty evidence layer and the
  next rebuild repeated it (thread kills every few minutes, 504s at 12:40Z, direct SQL connections
  timing out). Fixed in this branch: keyset pages per (account, run) (change-log 25, addendum).
- **12:28Z** the re-run request answered 422: the successful run had destaged its seven files, so
  no delivery report was staged. Restaging and re-running while the storm was on would have put
  the account's only good rows at risk (H1), so the re-run is held until the paging fix is live.
  The heartbeat fix is proven by its unit tests and will be proven live on the next run.

### 6.1 Run 8148628c outcome

**Success at 11:52:48Z after 96 minutes**, 21,130 rows ingested, window 2026-08-04 to 2026-09-02. It survived the hazard by luck: nothing read the run list between the heartbeat ceiling (10:46Z) and the finish. The stage times are the record that produced the fix in §4: 24 minutes to 82% (parse, buckets, rollups), 37 minutes of one synchronous reconciliation stage (10:39:47Z to 11:16:31Z, the quadratic ledger scan), 15 minutes writing 305 breakdown batches, 21 minutes writing the ledger and evidence.

Verified by SQL against the run id (the queries are the ones in the check-in prompt):

| Table | Rows | Spend | Dates |
|---|---|---|---|
| `ad_performance` | 21,034 rows, 1,751 Meta ad ids | $1,430,311.34 | daily, 2026-08-04 to 09-02; 08-06 alone $47,190.82 |
| `placement_performance` | 37 | $1,340,876.32 | period 2026-08-06 to 09-02 |
| `platform_performance` | 11 | $1,340,876.32 | period 2026-08-06 to 09-02 |
| `device_performance` | 8 | $1,340,876.32 | period 2026-08-06 to 09-02 |
| `demographic_performance` | 40 | $1,340,876.21 | period 2026-08-06 to 09-02 |
| `ad_breakdown_performance` | 75,969 | | |
| `reconciliation_ledger` | 162,141 | | |

Against the owner's report: the ad rows read $1,430,311 where the previous run read $4,072,100, and Meta's own account total for the window is $1,437,538, so the ad rows are within 0.5% of Meta (the remainder is ads only the whole-period exports carry). The four breakdown classes each carry the same $1,340,876 of the 28-day pivots at period grain, never added to the daily rows.

The run's own warnings say what happened to every file: the two demographic pivots cover 1,461 of the same ads, the later-staged plain Gender × Age file is used and the Text-asset file's 32,183 rows ($1,168,587) are not counted again; the coarse placement pivot loses to the device pivot (finer breakdown, 15,705 rows, $1,340,876 not counted again); the whole-period Ad Summary workbook loses its 3,157 rows ($1,248,138) to the two daily Ad Summaries on the ads they share; the two daily Ad Summaries overlap on 13 ad-days only; 96 rows of the earlier run in the window were replaced. Coverage: demographic and placement at 93.7% of the $1,430,311 daily baseline (whole-period, 958 ad names), the daily ad summary at 100%.

**One finding the run surfaces (F10, HIGH, held).** The reconciliation control is the whole-period Ad Summary workbook: "selected control reports $1,248,138.43, the daily Ad Summary (per Ad ID) reports $1,430,311.34 (14.6% apart)", and every breakdown's residuals are computed against it, which is why the demographic and placement classes read "107.43% of the Ad Summary" in the ledger notes although they are 93.7% of the daily rows. `buildTruth` ranks a per-Ad-ID Ad Summary above a daily summary by class, before coverage, so a whole-period workbook covering 1,494 ads outranks two daily files covering 1,751. The spec's own overlap rule (a daily file beats a whole-period file per ad) argues the control should be the per-ad union, daily first. This is a reconciliation-spec decision, not a UI change: it is recorded here and in §8, and the ledger's signed residuals stay honest in the meantime because the disagreement is recorded, never averaged.

### 6.2 The paging fix published and verified live (2026-09-05, 01:29Z)

- **01:15Z** PR #206 merged (6c33e24); the Replit workspace converged (schema fingerprint
  unchanged, nothing applied; HEAD f5e6601); app.metrix.ad published at 01:28Z; no run in flight.
- **Caught on the way:** the workspace's own API Server had restarted at 01:16:26Z from a bundle
  built before the merge landed, so it was still issuing the old offset pages against the shared
  Supabase (the `content-range: 1000-1999/*` shape in the edge logs). Its workflow was restarted so
  the dev script rebuilds from the merged source. The workspace dev server and production share
  one database: a stale bundle there is load on production.
- **The warm on the new build, both processes, 01:29:10Z to 01:34:56Z, from the edge logs and
  `pg_stat_statements` (cumulative since the reset at 04:24Z the day before; the new shapes exist
  only from 01:29Z):**

| Table | Requests | Keyset pages | Errors | Page mean (db) | First page per (account, run), mean / max (db) |
|---|---|---|---|---|---|
| `reconciliation_ledger` | 222 | 199 | 0 | 232 ms (206 calls) | 5.2 s / 54 s (20 calls) |
| `ad_breakdown_performance` | 115 | 89 | 0 | 580 ms (92 calls) | 4.6 s / 58 s (20 calls) |
| `variable_segment_performance` | 76 | 53 | 0 | 684 ms (56 calls) | 1.2 s / 15 s (27 calls) |
| `variable_evidence` | 35 | 2 | 0 | 9 ms | 38 ms / 0.4 s |

  Against the old shape over the same statistics window: 5,700 ledger calls at 692 ms mean
  (3,946 s of database time) and 3,007 breakdown calls at 1,804 ms (5,424 s), with maxima over
  89 s and the statement timeouts that produced the 504s. New shape: 0 responses over 400 at the
  edge, 0 statement timeouts, 0 cancels; PostgREST logged 34 "Thread killed by timeout manager"
  lines in the window with no request failing behind them (they continue at the same rate between
  warms).
- **What the numbers say (F11, MEDIUM, schema, held).** The keyset pages are cheap (a quarter of a
  second on the ledger). The FIRST page of every (account, run) is not: `explain analyze` on the
  live table shows the planner serving `where account_id = $1 and manual_analysis_run_id = $2
  order by id limit 1000` by walking the PRIMARY KEY in id order and filtering, so it skips every
  lower id in the table before the run's rows (92,260 rows removed by filter, 9.2 s on
  `ad_breakdown_performance` for Pure Path), and for a run whose ids sit below another run's the
  last page walks to the end of the table (the 54 to 58 s maxima). None of the existing composite
  indexes end in `id`, so no index serves "equality on the two run keys, range on id, in id
  order". One additive index per table, `(account_id, manual_analysis_run_id, id)`, turns every
  page into one index range; the statements are drafted in `schema.sql` on the working branch as
  a separate, flagged PR and are NOT applied: the owner holds schema changes for approval. Cost
  of applying: a plain `create index` holds a SHARE lock (blocks writes, not reads) for the build,
  seconds on these tables, and the applier already waits for a running analysis first.
- **Caught by reading the payload, not the logs (F12, HIGH, fixed the same hour).** Production's
  seed (200, 23.7 s, 116.7 MB) carried Pure Path's 75,969 breakdowns and 26,675 segments and an
  EMPTY ledger; the workspace's seed read the same. Both API logs carry one warning: "evidence rows
  could not be read for this run", table `reconciliation_ledger`, `RangeError: Maximum call stack
  size exceeded`. Every page had been read (163 ledger pages at each process, 0 errors); the
  aggregation `out.push(...rows)` spread 162,141 rows into one call, which V8 refuses above about
  125,000 arguments (Node 22, measured). Fix: `appendRows` (a loop) is the only way whole-table
  rows are appended; regression tests at 170k (the spread throws, the loop does not) and a 131k-row
  keyset read. Verified after the next publish by the same payload read. Production's warm on this
  build took 549 s (the workspace's 191 s): the payload, task 22, held.
- **The check's own first run was vacuous (fixed before it reached production).** `check:seed-evidence`
  read the evidence layer off the account's top level; the layer lives under `iap.analysis`, so it
  printed "no run" for every account and exited 0 against a 198 MB workspace seed that carried the
  ledger. It now reads `iap.analysis`, and a seed in which no account carries that block exits 2
  ("nothing checked"), never 0; both pinned in `check-seed-evidence.test.ts`.
- **Held with it:** the Pure Path re-run (the seven files need restaging from Analysis › History
  before Run analysis), task 22 (the seed still ships the whole evidence layer; this makes each
  page cheap, not the payload small), and H1.

---

## 7. Execution queue (autonomous, UI only, no schema, in this order)

| # | Item | Proves it |
|---|---|---|
| Q1 | F2: gates wait for the stage status (Strategy, Creative, MST) | new test in `pages/metrix/__tests__`; `check:friction` clean |
| Q2 | F3: the three imported-account copy lines | `analysis-run-error-message.test.tsx` updated; crawl shot of `/app/analysis` |
| Q3 | F1: hub eyebrow reads the loop stage | `shared-exports.test.tsx`; crawl shots of the six hubs |
| Q4 | F5 legend, F4 axis formatter | `HeatMatrix` test; `check:chart-geometry` |
| Q5 | F7, F8, F9 first-layer polish | `check:disclosure-rulebook` (counts may only fall) |
| Q6 | F6 provenance labels | shot of `/app/settings/provenance` |
| Q7 | Lock the friction gain (`check:friction -- --write-baseline`) | the baseline diff |
| Q8 | Publish the merged main (after the Pure Path run settles), re-run Pure Path on the #204 build, verify by SQL against the file totals | §6.1 |

Each item ships as its own commit on the working branch, typechecked and unit-tested before push; the battery in §1 and §2 re-runs once at the end of the queue.

---

## 8. Held for the owner

- **Task 22, evidence on demand.** The seed carries evidence summaries only; per-ad and per-segment rows move to per-account endpoints. Backend change required by the UI; the local reference implementation exists and is not pushed. Needs approval.
- **Task 23, run performance.** 30 minutes for 22k ad rows through PostgREST. Profile and cut; a backend change. Needs approval.
- **H1, failed re-run empties the window.** Write under the run id, swap on success. Backend change. Needs approval.
- **F10, the reconciliation control ranks class over coverage** (§6.1). `buildTruth` in `reconciliation.ts` picks a whole-period per-Ad-ID Ad Summary over two daily ones that cover 257 more ads, so the ledger's residuals are measured against a control 12.7% below the daily total. Proposed: rank per-Ad-ID candidates by the overlap rule per ad (daily first) and reconcile against their union; a spec change (`docs/specs/iap-multi-report-reconciliation.md`). Needs a decision.
- **F11, keyset-supporting indexes on the four evidence tables** (§6.2). `(account_id,
  manual_analysis_run_id, id)` on `ad_breakdown_performance`, `reconciliation_ledger`,
  `variable_segment_performance`, `variable_evidence`. Additive DDL, drafted and NOT applied. It
  is commit `d09cb6d` (schema.sql, change-log entry 26, the replit.md seed note), reachable as
  `refs/pull/208/head`; PR #208 was closed unmerged because a held PR on the working branch
  would have blocked every later merge from it. On approval: `git cherry-pick d09cb6d` onto a
  fresh PR. Needs approval.
- **Task 24, boot-time and payload smokes.** A scripts-only addition; queued after §7 unless the owner objects.
- **Open decisions O1 to O7** from the earlier register, unchanged.
- **The LinkedIn video**, deferred.
