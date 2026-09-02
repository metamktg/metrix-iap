# Metrix — Phase 2/3 Handoff Bundle

Originally cut 2026-08-25 as a courier zip; landed in the repo and reconciled 2026-08-26.
`docs/resources/` is now the canonical home for all of it — a fresh clone carries the
complete record and the zip is no longer needed.

## Read in this order

1. `CARRY_FORWARD_REGISTER.md` — **start here.** The E6 register, reconciled line by line
   against live code on 2026-08-26. Every item carries a verdict (`[shipped]` / `[open]` /
   `[open — upgraded]` / `[decision]`) established by opening the file, not by re-reading the
   audit. Several items in the original register were overtaken by BUG-28 → BUG-46 and are
   marked as such; one (S5) is worse than the audit recorded and says so.
2. `METRIX_Phase2_Enabler_Sprint_202608.md` — the E1–E5 work order, each section annotated
   with its landed status and the two places the specification was corrected against live data.
3. `METRIX_Phase3_Design_Brief_202608.md` — the design assessment the whole sprint feeds.
4. `METRIX_Disclosure_Audit_202608.md` — audit only, no code changed. Which hover-gated
   content is a descriptor (correct) and which is IAP run output the user came to read
   (the violation). 14 sites across 8 files, tiered by severity.
5. `DESIGN_SESSION_RECONCILIATION.md` — read before using output from any separate
   design-exploration session; it flags what from that exploration holds up against the real
   brief and what the brief overrides.
6. `METRIX_Phase1_Closeout_202608.md`, `../../BUG_TRACKER.md` — where Phase 1 ended, and the
   full defect register.
7. `METRIX_Phase2_Kickoff_Prompt_Final.md` — the sprint's original kickoff prompt, kept for
   provenance. Its Track 1 / Track 2 instructions are now history: both tracks are merged.

## Where the work actually stands

- **Track 1 (E1–E5)** — merged. Structured signal contract, KPI period context, status-semantics
  normalisation, account display names, route split.
- **Track 2 (E6)** — substantially merged. The entire UI-honesty group except C6 (a breadth
  sweep, not a defect), all three duplicate-logic sites, and all three type-safety holes.
- **Open** — storage (S1–S5) and efficacy (F-a, F-b, F-d), plus the decisions in register §6.
  None of it gates Phase 3.

**Phase 3 shipped.** The information-hierarchy / UI-reface pass closed on 2026-08-31 at
`main` `38cea8a6` (PRs #154–#160). Its reconciliation is
`METRIX_UI_REFACE_REGISTER_2026-08.md` §7 — shipped / needs another look / missed. Read §7
before starting anything below.

**Navigation audit shipped (2026-09-02).** `METRIX_Navigation_Audit_2026-09.md` — the
user-journey pass the release brief asked for: the sidebar's deferred-click model, fourteen
in-app links routed through context-dropping redirects, three orphan pages, no Back, no
palette. Nine findings, all shipped with tests; the open remainder is in its §3. The
register's §8 re-verifies every open item above against the same tree.

---

## Next phase — Release Readiness (R1–R5)

**Planned as Phase 4** in `METRIX_Phase4_Release_Plan_2026-09.md` (v3, owner-answered): four
sprints, ten exit criteria, and the owner's decisions recorded in the register's §9.

Ordered by what actually blocks a paid release. Each item names its own exit test.

### R1 · Build the optimize/act producer  *(the one true blocker — explicit go recorded 2026-09-02, register §9)*

Register item **F-e**. `optimization_loop` and `recommendation_cards` are read by six UI
surfaces and written by nothing but the static importer, which writes `"pending"` + null.
Every real account shows "No actions yet" forever. Add `optimize` as a fourth
`GenerationKind` in `generationEngine.ts` (alongside `strategy` / `briefs` / `deconstruct`),
build its evidence pack from real analysis rows, and expose
`POST /api/metrix/accounts/:id/generate/optimize`. Follows the existing running/success/error
honesty pattern and the one-running-run-per-account+kind rule.

**Exit:** a real (non-demo) account, after an analysis run, renders populated recommendation
cards in Action Queue, sourced from its own data.

**Read `CARRY_FORWARD_REGISTER.md` F-f before starting.** The destination tables
(`intelligence_cards`, `bsil_suggestions`) already exist in the official schema and match the
UI's card shape closely — but nothing in the product reads that schema, and no `clients` ↔
`ad_accounts` bridge exists. That is an owner decision, and it changes R1's size.

### R2 · Surface the creative intelligence already being written

Register item **F-a**, the register's own "single best value-per-effort" item.
`ad_creative_metadata` carries each ad's body text, headline, CTA type, link destination and
link caption; `ad_performance.extra_metrics` carries the rest. Both are written on every run
and read by nothing. Consumer: the Creative dialog's Overview tab. **F-b** (`reach`,
`clicks_all` dropped from per-ad stats) rides along in the same read path.

**Exit:** `check:field-coverage` shows these fields read; the Creative dialog shows real ad
copy next to real performance.

### R3 · Billing surface, or drop billing from the contract

7 of 8 `WorkspaceBilling` fields and `WorkspaceInvoice.amount_usd` are declared and read
nowhere. A paid platform needs the surface; an unpaid one should not carry the contract.
**This is an owner decision, not an implementation guess.**

### R4 · Strategy weighting engine

Spec at `CARRY_FORWARD_REGISTER.md` §6a — the owner's stated intent. Analysis stays
objective-faithful; the strategy layer applies algorithmic weighting to find patterns,
correlations and coincidences between avatars, Concept IDs and angles **across** objectives,
and curates direction from those relationships without distorting the source. **Awaiting an
explicit go.**

### R5 · Design remainder

`ConnectAccountDialogs` and the popup class closed in the reface register §7.4; shell TYPE
was the instrument (§7.5); Phase 6 ports are all dispositioned (§7.3). What remains: the
Panel MOTION revision (needs an owner's agreement), the C6 placeholder sweep (171 / 28 on
2026-09-02), and the navigation audit's §3 (collapsed-rail icon behaviour, Findings'
place in the menu). Lowest release risk of the five — none of it blocks a customer from
getting value, and all of it is measured and re-runnable.

## Environment facts (no secrets here)

- Live Supabase project: one project, real data — additive/idempotent DDL only.
- Required env in the workspace: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (see `replit.md` for the full list).
- Deploys happen from the Replit workspace (Pull → Push → Republish); GitHub `main` is the
  source of truth for code.
- Real test account: AAFE (`manual_9JGXU_AQJjxJ`). **Before any live verification, run the
  BUG-45 upload reclaim** — register item S1: staged files are additive per slot, so stale
  staging silently changes run output.
