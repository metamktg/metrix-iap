# METRIX Phase 2 — Kickoff Prompt

Paste the block below as the first message in the new environment, with all three handoff
documents attached.

---

You are picking up **Metrix IAP** at the start of Phase 2. Three documents come with this
message; read them in this order before touching anything:

1. `METRIX_Phase1_Bug_Triage_and_Audit_Prompt.md` — the original Phase 1 work order.
2. The Phase 2 handoff package (zip) — the plan as it stood at the end of Phase 1.
3. **`docs/resources/METRIX_Phase2_Entry_Handoff_202608.md` — read this one last and treat it
   as authoritative.** It was written against the merged code and the live database rather
   than against a plan, and it supersedes the other two wherever they disagree.

Then read, in the repository: `replit.md`, `CLAUDE.md`, `BUG_TRACKER.md`, and
`docs/resources/METRIX_Phase2_Enabler_Sprint_202608.md` (your actual work order, E1–E5).

## Where things stand

The buffer session between Phase 1 and Phase 2 is closed. `main` is green on CI, and fifteen
defects (`BUG-28` … `BUG-42`) were found and fixed, each with evidence in `BUG_TRACKER.md`.
The full IAP chain — analysis → strategy → briefs — is proven end to end on one live account.

**Before you write any code, do these two things:**

1. **Confirm the deployed build matches `main`.** A green `main` is not a deployed `main`, and
   nothing in the product shows which build is live. Two of this session's bug reports were
   fixes that had merged but not deployed, reproducing with an identical signature and reading
   as "the fix didn't work". Handoff §7.
2. **Establish your own baseline** by running the gate set in handoff §1 and confirming you
   reproduce it. Do not trust the table; reproduce it. If a browser-dependent gate fails on a
   missing Chromium revision, §7 has the one-line fix — it is recoverable, not a limitation.

## Your work, in priority order

1. **E5 first — split `routes/metrix.ts` (3,636 lines).** Structural only, no behaviour change.
   Do it *before* Phase 3 multiplies the UI contact surface; afterwards it is far more
   expensive.
2. **E1 — structured signals**, the critical path. Then E2, E3, E4 as the sprint doc specifies.
3. The still-live Phase 2 backlog named in handoff §9: BUG-08 (restage discoverability),
   retention policy for processed performance files, the ephemeral-upload-warning surfacing
   gap. The Optimization Loop build is 3–4.5 days and only on explicit request.

## Two rules that are not negotiable

**The honesty invariant.** Never fabricate data. Null stays null. A true-positive warning is
never suppressed. Every defect in handoff §2a is a violation of this that got shipped by the
phase whose entire purpose was honesty — so it is not self-enforcing.

**Derive at the point of use.** The single most useful finding of the buffer session
(handoff §3): an honesty primitive built correctly at the boundary and then distributed to
the UI *by hand* will reliably miss call sites. If a component needs a guarantee, it should
read that guarantee itself and accept an override — never depend on every caller remembering
to pass it. Phase 3 is exactly the condition that turns one missed call site into five.

## How to work

- **Verify empirically, not by reading.** The RLS audit probed the live database as `anon` and
  as a membership-less `authenticated` user across all 64 tables rather than reading policy
  text. A closeout warning that had been carried for weeks turned out to be false.
- **"No defect found" means *not found*, not *not there*.** This session reported no defect on
  a code path that was genuinely broken, because the bug lived in a branch reachable only when
  a model response truncates. Where you cannot force a branch by reading, get a live run — or
  say plainly that you could not reach it.
- **Prove a test can fail before trusting it.** Revert the fix, watch the test fail, restore.
  A test that has never been seen to fail is not yet evidence.
- **Audit your own proposed change against live data before recommending it.** A prepared
  cleanup script in this session would have destroyed user-edited mappings; that was caught
  only by checking it against real rows first.
- **State corrections plainly and move on.** Several diagnoses in this session were wrong
  before they were right. The record says so, and that is the point.

## Standing constraints

- **Never paste, request, or echo database credentials in chat.** This rule was breached once
  in the buffer session; the credential was rotated. It never reached a file or a commit.
- **The security register is deferred by explicit operator decision**, not oversight. One open
  defect is documented in handoff §4 — SECURITY DEFINER tenancy helpers exposed over PostgREST.
  Do **not** simply revoke EXECUTE: six run-scoped tables call that function inside their RLS
  policies, so revoking breaks tenant reads outright. It is the first item of the security
  phase, not of yours.
- **Deferred with reasons, not forgotten** (handoff §5): storage reclaim (~408 MB, script
  written and deliberately unexecuted), `multiple_permissive_policies`, the `unused_index`
  linter INFOs (do **not** act on these — acting would undo the fix), and the Postgres patch.
- **The known systemic defect is ecommerce hardcoding** (handoff §10): ROAS/CPA/purchase-funnel
  assumptions baked in as though every client sells physical products. Read the terminal metric
  from cohort configuration. `docs/iap/` is deliberately exempt.

## Before you report anything as done

Run the full gate set, not a subset, and report the numbers you actually observed. One
verification claim in this session was stale — an earlier result reported as though it still
held — and it turned CI red on `main`. If a gate cannot run here, say which and why rather
than omitting it.

Start by reading the three documents and confirming the deployed build. Tell me what you find
before you change anything.
