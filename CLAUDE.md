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

### `docs/resources/`

Planning and audit record — handoff synthesis, document briefs, and the Phase 1 cohort-awareness
audit. Context for *why*, not specification for *what*.

Two files there are live working records rather than history, and are the entry point for any
session picking up phase work:

- `README_HANDOFF.md` — the reading order, and where each phase actually stands.
- `CARRY_FORWARD_REGISTER.md` — the E6 register, reconciled against live code. Every item
  carries a verdict (`[shipped]` / `[open]` / `[decision]`) established by reading the file it
  names. Update an item's status in place as you work it; never drop one silently.

## Working rules for docs

- **The blueprint is canonical.** `docs/product/` and `docs/security/` hold verbatim extractions
  from it. If a blueprint section changes, update the extraction to match — never the reverse.
- **Do not invent content you cannot source.** Every file under `docs/` traces to a canonical
  source. If something is missing, say so rather than filling the gap.
- **Variable codes come from the registry.** `CN_`, `FW_`, `TN_`, `HK_`, `ST_`, `AW_`, `HP_`,
  `PR_`, `CTA_` are defined in `docs/iap/VARIABLES_REGISTRY.md`. Do not introduce new codes without
  going through its Code Addition Protocol.
- **Watch for ecommerce hardcoding.** The known systemic defect is ROAS/CPA/purchase-funnel
  assumptions baked in as if every client sells physical products. New code and docs should read
  the terminal metric from cohort configuration rather than assuming ROAS.
