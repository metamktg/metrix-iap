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

**Phase 3 is unblocked.** The next session is the information-hierarchy pass against
`METRIX_Phase3_Design_Brief_202608.md`.

## Environment facts (no secrets here)

- Live Supabase project: one project, real data — additive/idempotent DDL only.
- Required env in the workspace: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (see `replit.md` for the full list).
- Deploys happen from the Replit workspace (Pull → Push → Republish); GitHub `main` is the
  source of truth for code.
- Real test account: AAFE (`manual_9JGXU_AQJjxJ`). **Before any live verification, run the
  BUG-45 upload reclaim** — register item S1: staged files are additive per slot, so stale
  staging silently changes run output.
