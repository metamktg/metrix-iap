> **Historical planning record (July 2026).** Read for context on why later decisions were made; this is not a specification of current state — verify any specific claim against the live codebase before treating it as current fact. Several P0 items in the roadmap this audit produced (`IAP_ROADMAP_SPEC_BRIEFS_2026-07.md`) were rebuilt against a much-later `main` in August 2026 rather than merged from the stale branch they originated on.

# METRIX IAP — Infrastructure & UX Audit (July 2026)

Comprehensive audit of the Metrix IAP platform as deployed on Replit (autoscale)
and hosted on GitHub (`metamktg/metrix-iap`). Scope: bottlenecks, optimizations,
and improvements with a primary focus on user experience, progressive
disclosure, cross-account UI consistency, IAP loop robustness, and a target
architecture that scales to future accounts without divergence.

---

## 1. Platform snapshot

| Layer | Implementation |
| --- | --- |
| Frontend | `artifacts/metrix-iap` — React 18 + Vite + Tailwind v4 + shadcn/Radix, wouter routing, TanStack Query |
| API | `artifacts/api-server` — Express 5, pino logging, Orval-generated client + Zod schemas from `lib/api-spec/openapi.yaml` |
| Marketing | `artifacts/marketing` — separate Vite site at `/www/` |
| Data | Supabase Postgres (Metrix IAP data: importer schema + official 22-table schema, RLS throughout) + Replit Postgres (users, sessions, waitlist, generated reports) |
| AI | `generationEngine.ts` — claude-sonnet-4-6 via Replit AI integration; evidence packs from real Supabase rows; Zod validation + one repair retry |
| Deployment | Replit autoscale; frontend served statically (SPA rewrite), API as a service; six validation workflows (smoke, tests, codegen drift, builds) gate merges |

### What is already at or above professional SaaS standard

These are genuine strengths that the target architecture should preserve, not
rework:

- **Single-source navigation.** `navigation/navTree.ts` is the only definition
  of the 9-section IA; Sidebar consumes it; route tests (`nav-routes`,
  `inpage-nav-targets`, `focus-deeplink`) verify it; legacy routes redirect with
  zero dead ends.
- **Uniform scoped-module contract.** 22 account-scoped views wrap content in
  `ModuleScopeGate` (no account → picker prompt; unconfigured → connect state;
  else render), and `account-scoping.test.tsx` renders *every* scoped view in
  *every* account state asserting no cross-account data leaks. This is the
  backbone of cross-account UI consistency and it is enforced, not aspirational.
- **Honest-data principle.** Loop stages without real data render explicit
  pending/empty states (`optimization_loop: null`, creative scan pending);
  totals overrides are stated separately from ad-level coverage gaps; nothing is
  fabricated. This is a differentiator — keep it non-negotiable.
- **Account-generic seed assembly.** `buildAccountObject()` builds any account
  from tables filtered by `account_id` — no hardcoded ids — so every future
  account gets the identical UI shape by construction.
- **Per-account result terminology.** `resultTerm()` derives the conversion
  noun (registrations/purchases/trials/…) from each account's own analysis
  rows, so copy adapts per client without forking views.
- **Contract-driven API.** OpenAPI → Orval codegen with a drift gate
  (`check:api-codegen-drift`) prevents silent client/server divergence.
- **Security posture.** RLS on all official tables plus deny-by-default RLS on
  importer tables; hashed session tokens; login rate limiting;
  non-enumerating auth responses; AES-256-GCM Meta tokens; HMAC OAuth state;
  approval-gated learning registry writes enforced by trigger (BYPASSRLS-proof);
  security tests run against rolled-back transactions.

---

## 2. Bottlenecks (ranked by impact on UX and scale)

### B1 — Monolithic seed bundle: the primary architectural bottleneck

`GET /api/metrix/seed` assembles the **entire dataset for all accounts** on
every cache miss: 26 `SELECT *` queries across every Metrix table
(`metrixSeedAssembly.ts:652-677`), grouped in memory, cached in-process for
30 s, then filtered per user per request. The client blocks the whole app
behind one fetch of this bundle (`MetrixDataContext`) with
`staleTime: Infinity`.

Consequences as accounts grow:

- **Payload is O(all accounts).** The pilot fixture is already ~528 KB of JSON
  for essentially one configured account. Ten configured accounts with full
  analysis history means a multi-MB first paint for every user on every load —
  including members granted a single account (grants filter rows *after*
  assembly, not at query time).
- **Time-to-first-render degrades linearly.** Cold assembly latency = the
  slowest of 26 full-table PostgREST reads; the UI shows a full-screen loader
  until all of it lands.
- **Data staleness is all-or-nothing.** `staleTime: Infinity` means a
  teammate's analysis run, a new grant, or a new account never appears until a
  full reload (the only invalidation is your *own* run completing, which then
  refetches the *entire* bundle).
- **Autoscale cache incoherence.** The 30 s cache and
  `invalidateMetrixSeedCache()` are per-instance. Under autoscale with N
  instances, an invalidation on one instance leaves stale bundles on the
  others; users can see data flip back and forth across requests routed to
  different instances.

**Recommendation (highest-leverage single change):** split the seed contract
into
`GET /metrix/seed/manager` (light rollup: accounts list, totals, statuses) and
`GET /metrix/seed/accounts/:id` (one account's full IAP object), pushing
`account_id` filtering into the Supabase queries (`.eq("account_id", …)`).
Key React Query per account id. The existing OpenAPI/codegen pipeline and the
`buildAccountObject()` generic make this a mechanical split, and the payload
per navigation becomes O(one account) forever, independent of tenant growth.
Add an `ETag`/`updated_at` marker so refetches are cheap 304s.

### B2 — No frontend code splitting

`App.tsx` eagerly imports all ~30 views; `vite.config.ts` defines no
`manualChunks`; recharts, jspdf + jspdf-autotable, framer-motion,
embla-carousel, react-icons, and papaparse all land in the single main chunk.
Every login-page visitor downloads the full analytics app.

**Recommendation:** `React.lazy` at the section level (Analysis, Strategy,
MST, Reports, Settings) with a `Suspense` fallback matching the existing
loader; move jspdf behind a dynamic `import()` inside the export action (it is
only needed when a user clicks Export). Expect a large cut in initial JS with
no UX change — this is the cheapest visible performance win available.

### B3 — In-process background jobs on autoscale

Generation and analysis runs are fire-and-forget promises inside the request
process (`void (async () => { … })()` in `generationEngine.ts`). Replit
autoscale may scale an instance down mid-run: the stale-`running` → `error`
recovery keeps state honest, but the user's generation simply dies and must be
re-run. In-memory login rate-limit counters are also per-instance, weakening
the 20/10-min limit proportionally to instance count.

**Recommendation:** near-term, pin the API service to a reserved-VM style
deployment (single always-on instance) — it also fixes B1's cache incoherence
without code. Longer-term, move runs to a durable queue (a `jobs` table +
worker loop is enough; the idempotent run records and partial-unique-index
concurrency guard already exist) so a killed instance never loses work.

### B4 — Whole-bundle refetch as the only refresh signal

Run completion invalidates the entire seed query; there is no
refetch-on-window-focus or periodic revalidation. With B1's split, switch to
invalidating only the affected account's key, and enable
`refetchOnWindowFocus` with the ETag so returning users see fresh state at
near-zero cost.

### B5 — Repository weight

`attached_assets/` (61 MB) and `exports/` (34 MB) are committed. `.replitignore`
keeps them off deploys, but clones and CI checkouts pay for them, and they grow
monotonically. Move generated exports out of git (Supabase storage or release
artifacts); keep `attached_assets` as historical reference only.

---

## 3. User experience & progressive disclosure

### Working well

Progressive disclosure is already a deliberate pattern with real depth:

- Collapsible `CaveatNote` pills (truncate → expand), collapsible
  `DataSourceBadge`, `InfoDrawer`, tiered drill-downs (tile →
  `MetricDiagnosticModal` → `SegmentDrilldownModal` / `VariableDrilldownModal`),
  `ModuleTabs` layering inside modules, customizable metric tiles with a
  catalog-driven picker.
- Orientation infrastructure: `ScopeBanner` (which account), `RangeScopeBar`
  (which dates, which grain), `FlowCrumb` + `BackLink` (`?from=` convention),
  `?focus=` deep links with `StaleFocusNotice` when a link no longer resolves.
- Empty/edge states are first-class: `UnconfiguredState`, `PendingState`,
  `NoDataInRangeState` (with a one-click "show all data" recovery), stale-run
  recovery, non-fabricating pending stages.

### Gaps and recommendations

1. **In-module tab state is invisible to the URL.** `ModuleTabs` is local
   `useState`, so a shared link or refresh always lands on the first tab, and
   Back doesn't return to the tab a user was on. Adopt a `?tab=` param using
   the same conventions as `?focus=` (the wouter test-harness constraint that
   ruled out `#hash` doesn't apply to query params). Low effort, high polish.

2. **Personalization is per-browser, not per-user.** Metric tile layout,
   metric selection, and sort preferences persist in `localStorage`; a user on
   a second device (or after a browser reset) loses their workspace. The
   settings-persistence pattern (seed defaults + per-workspace DB overrides
   merged client-side) already exists — extend it to metric-tile and view
   preferences keyed by user. This is the main "professional SaaS" gap in the
   personalization story.

3. **Account selection doesn't survive new tabs.** The active account persists
   in `sessionStorage` (plus `?account=` URL sync). Opening a fresh tab drops
   the user back to manager view. Switch to `localStorage` with the URL param
   keeping precedence — the URL-sync design already handles the sharing case
   correctly.

4. **Guided path for new/unconfigured accounts.** The sidebar always shows all
   nine sections; for a just-created account every module resolves to
   `UnconfiguredState`/`PendingState`. The `loop_status` data (which stages
   have real data) is already in the seed — use it to drive readiness cues in
   the sidebar (subtle dimming or a stage badge per section) and a short
   "Connect → Upload → Run analysis → Explore" checklist on
   `AdAccountOverview`. This converts the honest-empty-state architecture into
   an actual onboarding funnel and is the highest-value progressive-disclosure
   improvement available.

5. **Notification of long-running completions.** Generation/analysis progress
   is visible only while watching (2.5 s polling, TaskTray). A user who
   navigates away learns nothing until they return. Near-term: surface run
   completion as a toast + nav badge from the existing poll; the
   `notifications` settings section is currently a natural home for opt-in
   email on completion (Resend is already integrated).

6. **Accessibility floor.** Interactive semantics are good (`aria-pressed`,
   `aria-current`, Radix primitives), but a large share of text is set at
   10–11 px with muted/50–70 opacity. For WCAG 2.1 AA (and buyers' security/
   accessibility questionnaires), audit the contrast of the
   `text-[10px] text-muted-foreground/60` tier and establish a minimum
   readable tier for information-bearing text (decorative labels exempt).

### Cross-account UI consistency

The consistency mechanism is structural, which is the right design: one
`navTree`, one `ModuleScopeGate`, one shared primitive set (`shared.tsx`), one
generic account builder, per-account result nouns, and a regression suite that
renders every scoped view against every account state. Two things will keep it
true as accounts multiply:

- **Codify the "module contract."** Every account-scoped view should compose
  `ModuleHeader + ScopeBanner + RangeScopeBar + ModuleScopeGate`. It's the de
  facto pattern already — write it down (docs + a lint-style test that walks
  the view modules) so view #31 written six months from now can't drift.
- **Keep account-conditional logic out of views.** Today no view branches on a
  specific account id (verified by the scoping tests). Guard that invariant in
  review: any per-client behavior must come through seed data
  (`overview_state`, `resultTerm`, modules payloads), never `if (accountId === …)`.

---

## 4. IAP loop robustness

The loop today: **Listen → Analysis → Strategy → Briefs → MST**, with
generation closing Analysis→Strategy→Briefs in-app (202 + run id, background
job, evidence packs, hallucinated-reference dropping, generated-replaces-
imported, one-running-run-per-account+kind, stale-run recovery). The loop CTAs
(`LoopAction`, `CrossLink`, `FlowCrumb`) make the loop legible in the UI, and
`linkClosedLoop()` fills cross-entity back-references at generation time.

Robustness gaps:

1. **The optimization stage is specified but not implemented.**
   `IAP_OPTIMIZATION_LOOP_v2.0` (cohort-aware re-weighting, lift detection,
   feed-forward into Strategy Map and Brief Builder) exists as a prompt spec;
   at runtime `optimization_loop` is permanently `null` and Creative Scan
   permanently pending. The loop therefore doesn't yet compound — its defining
   promise. The infrastructure to close it already exists: implement
   `kind: "optimization"` in `generationEngine` (same run lifecycle), consume
   `iap_runs` + cell/variable performance as the evidence pack, and gate
   `learning_registry` writes through the existing approval-event trigger.
   This is the single most important *product* investment identified by this
   audit.

2. **Run history and auditability are thin in the UI.** `iap_runs` and
   generation runs store model, status, and timestamps, but users can't see a
   run ledger per account (what ran, when, by whom, what replaced what).
   A compact "Runs" panel (Analysis Overview or Settings) closes the
   trust gap that agencies' clients will ask about.

3. **Single repair retry, no backoff.** Model calls get one Zod-repair retry;
   transient provider errors surface as failed runs. Add bounded retry with
   backoff for transport-level failures (distinct from validation failures,
   which correctly fail fast).

4. **Loop-stage configuration is implicit.** Which stages apply to an account
   (e.g. manual-CSV accounts can't do Creative Scan without uploads) is derived
   ad hoc. Making `loop_status` an explicit, per-account stage state machine in
   the seed (stage → available | pending | ran(at) | not_applicable(reason))
   would let the sidebar readiness cues (§3.4), the overview, and future
   automation all read one source of truth.

---

## 5. Security & operational notes (secondary scope)

- `app.use(cors())` is a wide-open allowlist. Same-origin static serving plus
  httpOnly cookies keeps practical risk low, but tighten to an explicit origin
  list (app + marketing origins) — one line, removes a questionnaire finding.
- Admin console uses a single shared `ADMIN_PANEL_PASSWORD`; per-admin
  accounts already exist (`role: admin`) — converge the standalone `/admin`
  gate onto real admin sessions when convenient.
- No compression middleware on the API. Replit's proxy may compress; verify
  `content-encoding` on `/api/metrix/seed` in production — if absent, one
  `compression()` use cuts the seed transfer ~5–10×. (Superseded long-term by
  the B1 split, still worth checking now.)
- Dev/prod Replit Postgres split is a recurring operational trap (documented
  in memory): approvals in dev don't exist in prod. The admin console banner
  helps; consider printing the environment name on the admin approval screen
  itself.

---

## 6. Target architecture synthesis

The platform's core abstractions are correct; the scaling plan is to *narrow
the data plane and harden the compute plane while keeping the consistency
machinery exactly as it is*.

```
                    ┌──────────────────────────────────────────┐
                    │  React app (code-split by section)       │
                    │  Query keys: [manager], [account, id]    │
                    └───────┬──────────────────────┬───────────┘
                            │                      │
              GET /seed/manager          GET /seed/accounts/:id   (ETag/304)
                            │                      │
                    ┌───────┴──────────────────────┴───────────┐
                    │  Express API (single reserved instance,   │
                    │  later: N instances + shared cache)       │
                    │  · per-account assembly (filtered queries)│
                    │  · run queue: analysis | strategy |       │
                    │    briefs | optimization  (jobs table)    │
                    └───────┬──────────────────────┬───────────┘
                            │                      │
                  Supabase (Metrix data,   Replit Postgres (users,
                  RLS, approval gates)     sessions, reports, jobs)
```

Sequenced roadmap (each step independently shippable):

| Priority | Change | Effect |
| --- | --- | --- |
| P0 | Route-level code splitting + dynamic jspdf import | Fastest visible load-time win, zero behavior change |
| P0 | `?tab=` URL state; localStorage account persistence; toast on run completion | Daily-use polish to SaaS standard |
| P0 | Tighten CORS; verify seed compression in prod | Hygiene |
| P1 | Split seed API per account (+ ETag, per-account query keys, focused invalidation) | Removes the O(all-accounts) payload; new accounts become O(1) cost forever |
| P1 | Sidebar readiness cues + onboarding checklist driven by explicit `loop_status` state machine | Progressive disclosure for every current and future account, from data already in the seed |
| P2 | Reserved-VM API (then jobs-table queue) for generation/analysis runs | Runs survive scaling events; rate limits and cache become coherent |
| P2 | Implement `kind: "optimization"` per IAP_OPTIMIZATION_LOOP v2.0 with approval-gated learning writes | Closes the loop — the platform's compounding-value promise |
| P3 | Server-side per-user view preferences (metric tiles, selections, sorts) | Consistent experience across devices/users |
| P3 | Run-ledger UI; a11y contrast pass on the 10–11 px muted tier; move `exports/` out of git | Trust, compliance, repo health |

The through-line: every improvement above routes *through* the existing
single-source mechanisms (navTree, ModuleScopeGate, seed contract, codegen,
honest states) rather than around them. That is what keeps the platform
cohesive as accounts, users, and loop stages multiply — consistency stays a
property of the architecture, not of discipline.
