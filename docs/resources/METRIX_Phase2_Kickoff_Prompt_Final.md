# Paste this as the first message in the new Claude Code session

Read these in order before touching any code:

1. `docs/resources/METRIX_Phase2_Enabler_Sprint_202608.md` — this session's core work order.
2. `docs/resources/CARRY_FORWARD_REGISTER.md` — the final reconciliation pass across every
   open item in `BUG_TRACKER.md` and `METRIX_Data_Consistency_Audit_Phase1.md`, labeled
   **E6** below. This is real audit output, not new guessing — every line cites its source.
3. `docs/resources/METRIX_Phase3_Design_Brief_202608.md` — the consumer of everything built
   in this session; read it for context now, do not implement it yet.
4. `CLAUDE.md`, `replit.md`.
5. `docs/resources/METRIX_Phase1_Closeout_202608.md`, `BUG_TRACKER.md`.
6. `.agents/memory/MEMORY.md` index — check it before debugging anything that smells like a
   known gotcha.

## Your job this session

Two tracks, in this order:

**Track 1 — E1–E5 (the enabler sprint, unchanged from the work order):**
E1 structured signals (critical path) → E2 KPI period context → E3 status-semantics
normalization → E4 account display names → E5 route split (`routes/metrix.ts`, ~2.7K
lines, into uploads/creatives/accounts/admin routers, zero behavior change).

**Track 2 — E6 (carry-forward hardening sweep, from `CARRY_FORWARD_REGISTER.md`):**
Work it in the register's own priority order:
1. **C1** — `AvatarsView.tsx` "Creative combos" renders two disjoint row sets under a
   header promising a join that was never computed. Fix before anything else in this
   track: it's the one item that visually implies false structure, not just an honest gap.
2. **C5** — pick ONE aggregation-null policy (recommend `sumStrict` semantics: null unless
   every contributing row carries the field, plus a per-metric coverage note) and migrate
   `metricsCatalog.ts`, `date-scope.ts sumInRange`, `summaryTrends.ts`, `reportExport.ts`
   onto it. Do this before Track 1's E2 (KPI context) ships new comparison-series code on
   top of the current split policies.
3. **S1** — review and clear the ~77 MB of stale staged performance files before running
   any live verification; staged files are additive per slot and silently change run output.
4. **R1 / R2** — remove the `as any` read in `KpiDrilldownModal.tsx` and the untyped
   index-signature reads in `run-scope.ts` / `date-scope.ts`; both are silent-failure holes
   with no compiler or runtime signal today.
5. The remainder of the register (C2–C11, E-a–E-d, F-a–F-d, S2–S5) — any order, none block
   Phase 3 individually, but land as many as the sprint has room for. Anything left over
   stays in the register for the next pass — do not silently drop items, update their status
   in-file (`[shipped]` / `[in progress]` / still open) as you go.

Do NOT start the Phase 3 visual/information-hierarchy pass in this session — that is a
separate session against `METRIX_Phase3_Design_Brief_202608.md`, opened only after Track 1
and Track 2 are merged and verified live.

## Standing rules (unchanged from Phase 1 — they worked)

Feature branch → PR → CI → merge, never push to main. `pnpm run typecheck` and the metrix
suites stay green after every task — run the owning suite after each change. Verify against
the real AAFE account (`manual_9JGXU_AQJjxJ`), not fixtures. OpenAPI
(`lib/api-spec/openapi.yaml`) is the contract: edit spec → `pnpm --filter @workspace/api-spec
run codegen` → never hand-edit `lib/*/src/generated/**`. Schema changes are idempotent
additive DDL in `scripts/src/metrix-supabase/schema.sql`, and every new table goes into the
RLS enforcement array — no exceptions, this is the platform's actual security boundary.

The honesty invariant is non-negotiable across BOTH tracks: no fabricated values, no
suppressed true-positive warnings, nulls stay nulls, and — new for E6 — no UI structure that
implies a computation the server never ran (this is exactly what C1 is). No chat-pasted DB
credentials — if live-data verification is blocked, hand the repo owner exact queries to run.

## Definition of done

Track 1: E1–E4 merged and verified live (structured fields visible in the seed payload; KPI
deltas match hand computation for one window; every legacy status value maps through the new
normalizer; an account renamed end-to-end); E5 merged with zero route-behavior diffs.

Track 2: C1 and C5 merged and verified live at minimum; every other register item either
merged or explicitly re-flagged with a reason it's deferred (never silently dropped).

Only once both tracks are done: open the Phase 3 information-hierarchy pass, and read
`docs/resources/DESIGN_SESSION_RECONCILIATION.md` first if a separate design-exploration
session's output is handed to you alongside the brief — it flags what from that exploration
still holds up against the real brief and what doesn't.
