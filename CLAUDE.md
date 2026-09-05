# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Operating instructions

@replit.md

`replit.md` is the operational source of truth: commands, auth model, stack, architecture
decisions, gotchas, and user preferences. Read it before running or changing anything. This file
adds the documentation map that `replit.md` does not cover.

## Documentation map

Canonical product and protocol documentation lives under `docs/`. It is reference material —
changing it does not change runtime behaviour — but it is what the IAP prompt chain and the
Supabase schema are built against, so keep code and docs in agreement.

### `docs/architecture/`

- `METRIX_IAP_MASTER_BLUEPRINT_v2.0.md` — **canonical.** Supersedes v1.1–v1.5 entirely. Four-plane
  architecture, naming convention system, cohort architecture, creative identity resolution,
  confidence grading, BSIL, the full 18-table Supabase schema, RLS rules, gap register, roadmap.
  When any other document disagrees with this one, this one wins.

### `docs/data-model/`

- `METRIX_Cohort_Architecture_v1.md` — the four business-model cohorts (ecommerce / lead_gen /
  service / app), their funnel stages, intent-score weights, and terminal metrics.
- `METRIX_Listen_Layer_125_Metric_Contract_v1.md` — the 125-metric ingestion contract (base 61 plus
  conditional cohort blocks).
- `README_MIGRATIONS.md` and `reference/` — migration conventions and combined SQL.

### `docs/prompts/`

The executable IAP chain, v2.0: `IAP_DATA_BUNDLE_PREP` → `IAP_ANALYSIS_CORE` →
`IAP_REPORT_SUMMARY` / `IAP_STRATEGY_MAP` → `IAP_BRIEF_BUILDER` → `MST_TEST_ENGINE` →
`IAP_OPTIMIZATION_LOOP`.

### `docs/iap/`

Cohort-agnostic reference layer — `MST_METHOD_REFERENCE`, `MST_CREATIVE_SCAN`,
`VARIABLES_REGISTRY`. These define creative language and matrix mechanics, sit one layer below
business-model logic, and are deliberately exempt from the cohort-awareness repair.

### `docs/product/`

- `METRIX_Product_Loop.md` — Blueprint §4, extracted verbatim.

### `docs/security/`

- `METRIX_RLS_and_Service_Role_Security.md` — Blueprint §12, extracted verbatim. Required reading
  before touching `service_role` Edge Functions or implementing `supabase/policies/`.

### `docs/specs/`

Implementation specifications, written before the code and kept in agreement with it.
`result-events-and-intent-classes.md` is the contract for result events, intent classes and the
one result scope the analysis surfaces read (awareness is never weighted against a purchase-intent
event; blending is terminal conversions only). The first is
`iap-multi-report-reconciliation.md` — the reconciliation-first evidence layer (report classes and
grains, ad/asset identity, source authority, the ledger, evidence states, the IAP deconstruction
integration, UI behaviour, the modelled-tier contract). Its §0 records where the code disproved the
brief that commissioned it; read that before trusting any figure elsewhere about coverage.

### `docs/resources/`

Planning and audit record — handoff synthesis, document briefs, and the Phase 1 cohort-awareness
audit. Context for *why*, not specification for *what*.

Two files there are live working records rather than history, and are the entry point for any
session picking up phase work:

- `README_HANDOFF.md` — the reading order, and where each phase actually stands.
- `ARCHITECTURE_CHANGE_LOG.md` — one entry per architectural change, append-only: what changed,
  why, where it lives, what proves it, how far it reaches. Read it before touching a module it
  names; add an entry when you change the architecture.
- `CARRY_FORWARD_REGISTER.md` — the E6 register, reconciled against live code. Every item
  carries a verdict (`[shipped]` / `[open]` / `[decision]`) established by reading the file it
  names. Update an item's status in place as you work it; never drop one silently.
- `METRIX_UI_LIFT_MASTER_PLAN_2026-09.md` — the UI/UX lift master plan and session
  reconciliation: a verdict per task this session claimed (with the file or finding that proves or
  disproves it), the bug register from four audits with a status per finding, the module-by-module
  lift to demo standard, the navigation plan, the demo-readiness bar and the handoff. Read its §0
  before trusting a verdict; every number in it names the command that produced it.
- `METRIX_EXECUTION_LAYER_SWEEP_SPEC_2026-09.md` — the specification for the Execution Layer sweep
  (2026-09-05): the shared `StageLayout` shell, the per-page status hub, the "base this run on"
  control, and every backend-driven surface designed in before the pages are redrawn, with the
  ordered vertical slices and the validation each one must pass. Read its §0 and §1 (the
  non-regression list) before touching a stage page. Its sources are the owner's reconciled package
  in `handoff_2026-09-05/`.
- `METRIX_DESIGN_CONFORMANCE_PASS_2026-09.md`: the design gate every UI pull request passes
  (owner flag, 2026-09-05): `check:controls` over every route, the crawl read against the
  standard (hierarchy, disclosure, controls and their persistence, charts, layout), and an
  interaction sweep of every control the PR touches. Read §0 for what its first run caught and §2
  for the checklist.
- `METRIX_UI_REFACE_REGISTER_2026-08.md` — the UI reface register. What the design pass has
  closed, what is open, the Watermelon component mapping, and the phased plan. Every claim in it
  is produced by a re-runnable command (`check:ui-inventory`, `check:field-coverage`, and the
  seven design gates); where a number is an estimate it says so, and where a check is known to
  be approximate the approximation is named. Read §0 before trusting any figure in it.

## Working rules for docs

- **The blueprint is canonical.** `docs/product/` and `docs/security/` hold verbatim extractions
  from it. If a blueprint section changes, update the extraction to match — never the reverse.
- **Do not invent content you cannot source.** Every file under `docs/` traces to a canonical
  source. If something is missing, say so rather than filling the gap.
- **Variable codes come from the registry.** `CN_`, `FW_`, `TN_`, `HK_`, `ST_`, `AW_`, `HP_`,
  `PR_`, `CTA_` are defined in `docs/iap/VARIABLES_REGISTRY.md`. Do not introduce new codes without
  going through its Code Addition Protocol.
- **The objective is derived from data, and it is only an analysis lens.** Owner decision
  (2026-09-01): it is NOT a property of an account, NOT something a user is asked, and NOT a
  toggle. The analysis run reads it from each ad's Meta `Result type` via `inferObjectives()`
  in `artifacts/api-server/src/lib/cohortConfig.ts` and writes it to the account. There is no
  control that sets it and no override. Its reach is bounded by `check:cohort-reach` — it may
  decide which terminal metric a run reports and which optional column groups it assesses, and
  nothing else. Do not treat it as a core concept or use it to describe an account to a reader.
- **Watch for ecommerce hardcoding.** The known systemic defect is ROAS/CPA/purchase-funnel
  assumptions baked in as if every client sells physical products. New code and docs should read
  the terminal metric from the derived objective rather than assuming ROAS — and when nothing
  was derived, say "cost per result", never fall back to purchases.
