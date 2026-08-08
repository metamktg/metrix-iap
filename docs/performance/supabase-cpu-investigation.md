# Supabase CPU / 522 Investigation — Critical Review

**Status:** revised after self-critique. The original investigation was conducted live,
in-chat, over a live incident, using only `get_logs`, `execute_sql`, and point-in-time
`pg_stat_activity` snapshots — no `pg_stat_statements`, no `EXPLAIN ANALYZE`, no CPU/RAM
telemetry from the Supabase dashboard. Treat every claim below accordingly: this is a
plausibility assessment, not a proven root cause. **No code, config, index, or
infrastructure change has been made as a result of this document.**

Project: `lqryrmaipryeqtjbxjdh` ("Metrix"), Supabase Postgres 17.6.1, region us-east-2.

---

## 1. What actually happened (facts, not interpretation)

- Sustained window (~45+ minutes) where every `/rest/v1/*` PostgREST call returned
  **522** (edge/gateway timeout — the gateway gave up waiting on the origin).
- Concurrent `postgres` log lines during that window: repeated `canceling statement due
  to statement timeout`, `FATAL: canceling authentication due to timeout`, and a small
  number of `LOG: duration:` lines showing individual statements completing in
  17,000–108,000 ms (a single-row `insert into auth.users` took 107,944 ms).
- Also present in the same log window: `AccessExclusiveLock` acquisition/wait lines
  on one relation (`relation 18928`, PID 6054) — `acquired ... after 7531 ms`,
  `still waiting ... after 1044 ms`.
- The project's management-API status was `ACTIVE_HEALTHY` throughout — the control
  plane never considered the project down or paused.
- The user restarted the project from the Supabase dashboard. After restart, the
  overwhelming majority of REST calls returned 200 immediately, and two manual test
  queries (`select now()`, `select count(*) from ad_accounts`) both returned instantly.
- One narrow, distinct issue survived the restart: `GET /rest/v1/manual_imports?
  select=*&kind=eq.creative_asset&ad_names=not.is.null` returned `500` (not 522) three
  times over ~47 seconds, against an account named `act_test_deconstruct_e2e_...`. The
  identical filter run directly via SQL returned correct rows with no error. That
  traffic pattern stopped on its own; it was not re-observed afterward.
- A live `pg_stat_activity` snapshot during the "why do agents keep stalling" follow-up
  showed a PID that had just run `insert into client_memberships (...) values
  (..., 'oper...')` and was sitting `idle in transaction`. This was reported in-chat as
  a likely leaked/orphaned transaction and a termination was proposed. On re-query
  seconds later, the **same PID** was already mid-way through a fresh, unrelated
  `insert into analysis_runs (...)` with a transaction age of 0.2 s — i.e., a pooled
  connection had simply been reused. **The "orphaned transaction" claim was retracted
  in-chat before any termination was executed.** No `pg_terminate_backend` call was
  ever made.

### New evidence gathered for this review (not available at investigation time)

```
max_connections        = 60
shared_buffers          = 224 MB   (28672 * 8kB)
effective_cache_size    = 384 MB   (49152 * 8kB)
work_mem                = 2.1 MB   (2184 kB)
maintenance_work_mem    = 32 MB
statement_timeout       = 120,000 ms  (2 minutes)
autovacuum_max_workers  = 3
```

`pg_stat_user_tables` dead-tuple counts across the 10 most-bloated tables: 16–75 dead
tuples each. This is trivially small — bloat/vacuum pressure is not a plausible
contributor and can be ruled out with reasonable confidence.

`shared_buffers` (224 MB) and `work_mem` (2.1 MB) are small enough to be consistent
with the smallest paid Supabase compute tier. This was **not checked at the time of
the incident** — it is inferred here from Postgres settings, not read directly from
Supabase's infra/billing metadata (no tool used in this investigation exposes that
field directly).

---

## 2. Finding-by-finding classification

### F1 — "This is sustained resource exhaustion, not a transient network blip"
**CONFIRMED.** Directly supported by repeated statement/auth timeouts and multi-second-
to-108-second query durations recorded in the Postgres logs, sustained across a
45+ minute window. This is the one claim in the whole investigation backed by direct,
first-party evidence rather than inference.

### F2 — "The restart fixed it"
**SUPPORTED BUT UNPROVEN.** Before/after comparison is real (522s → 200s, instant test
queries), and the timing lines up with the dashboard restart. But no counterfactual
exists — the outage could plausibly have been at or near its natural end anyway (e.g.
a batch job finishing, a spike in agent activity subsiding). A single before/after
comparison with no control is suggestive, not proof of causation. Treat "restart is a
reliable remediation" as unproven until it's needed and works a second time.

### F3 — "AccessExclusiveLock contention (consistent with schema DDL) explains the
platform-wide 522 storm"
**SPECULATIVE, and the causal chain as originally stated does not hold up.**
This is the weakest claim in the original investigation and should have been flagged
harder at the time. An `AccessExclusiveLock` on a single relation only blocks queries
against *that relation*. It cannot, by itself, explain 522s on `ad_accounts`,
`variable_registry`, `campaign_windows`, and every other unrelated table
simultaneously — those tables have no lock dependency on relation 18928.
The only mechanism by which a single-table lock could cascade platform-wide is
**connection-pool exhaustion**: if enough backends stack up waiting on that one lock
and hold their pooled connection while waiting, the pool has fewer connections left for
everything else, and *unrelated* queries start timing out for lack of a connection —
not because of the lock directly. That mechanism is plausible given
`max_connections = 60`, but was never verified: relation 18928 was never identified,
no timestamp correlation was drawn between the lock-wait log lines and the *onset* of
the 522 storm (both were pulled from the same broad log window, not shown to be
concurrent), and connection-pool saturation at the time of the incident was never
measured. **Revise this from "root cause" to "one plausible contributing mechanism,
unconfirmed."**

### F4 — "Multiple Replit Agents/sessions hitting the same Supabase project concurrently
is the sporadic trigger"
**SUPPORTED BUT UNPROVEN.** The evidence offered for this was indirect: the volume and
variety of test-account names/patterns in the logs (`act_test_deconstruct_e2e_...`,
repeated `@test.invalid` auth inserts, RLS/check-constraint violations consistent with
a security test suite) and a burst of ~10–20 concurrent PostgREST connections during
one seed-load. None of that actually proves *multiple concurrent sessions* — a single
session running a test suite sequentially, or one agent's seed-assembly firing many
parallel per-table requests, produces a very similar log signature to two or three
agents overlapping. `pg_stat_activity.client_addr` and `application_name` were
available and could have been used to distinguish "one client hammering many
connections" from "several distinct clients each holding a few" — this was not done.
**The concurrency-pressure theory is plausible and consistent with a 60-connection
cap, but "multiple agents" specifically was asserted, not demonstrated.**

### F5 — "The `client_memberships` idle-in-transaction PID was a leaked/orphaned
transaction; recommend terminating it"
**INCORRECT — and already self-retracted in the same conversation.** A second query
against the same PID, seconds later, showed it had already moved on to a new,
unrelated, fast-completing transaction. The original read was a misinterpretation of a
single point-in-time snapshot of a **pooled** connection — a backend PID being briefly
"idle in transaction" mid-request is completely normal and is not evidence of a leak by
itself. No termination was executed, which was the correct outcome, but the finding
should never have been raised as a probable "smoking gun" without a second sample
first. **Process note for next time:** never call an `idle in transaction` state
actionable from a single sample — take two samples a few seconds apart on the same PID
before concluding anything is stuck.

### F6 — "The `manual_imports` 500 on `kind=eq.creative_asset&ad_names=not.is.null` is a
genuine, separate backend bug"
**SUPPORTED BUT UNPROVEN — and under-investigated.** Reproducing the equivalent
`WHERE` clause via direct SQL (which bypasses PostgREST and runs as a privileged role)
succeeding proves the *data* isn't the problem. It does not prove anything about *why*
PostgREST specifically returned 500 for that exact request shape — the actual
PostgREST/Postgres error body was never captured (`get_logs` for `postgres` around
that exact timestamp was not cross-referenced for the specific error text), and no
attempt was made to reproduce it through PostgREST itself (e.g. via `curl` against the
project's REST endpoint with the same filters and the same role the API server uses).
This is the one narrow finding in the whole investigation that would benefit most from
direct reproduction before being written off as "traffic stopped, not urgent" — a
500 on a specific, real product code path (creative-asset upload mapping) deserves
root-causing on its own, independent of the infra outage.

### F7 (implicit, from the final exchange) — "Undersized compute tier is a plausible
root cause; the user's own framing suggests this project may be on Supabase's smallest
tier"
**SPECULATIVE, but now better supported than at the time it was raised.** At the time,
this was raised by the user, not investigated. This review pulled `shared_buffers`
(224 MB) and `work_mem` (2.1 MB), which are small enough to be *consistent* with the
smallest Supabase compute tier — but Postgres settings are an indirect proxy, not a
direct read of the project's actual instance size, vCPU allocation, or (most
importantly) **actual CPU utilization at the time of the incident**, none of which any
tool used in this investigation can retrieve. This document is titled a "CPU
investigation" but at no point was CPU utilization actually measured. That is the
single largest methodological gap in the whole exercise.

---

## 3. What was never checked (and should have been)

- **`pg_stat_statements`** — never queried (not confirmed to even be enabled on this
  project). Without it, there is no ranked view of which queries dominate total time or
  call count; every conclusion about "what's expensive" in this investigation is
  inferred from a handful of `LOG: duration:` lines that happened to scroll past, not
  from aggregate data.
- **`EXPLAIN (ANALYZE, BUFFERS)`** on any slow statement — never run. No index or
  query-shape recommendation in this document is backed by an execution plan, and none
  should be treated as validated until one is produced.
- **Actual CPU/RAM utilization graphs** (Supabase dashboard → Reports/Infrastructure)
  — never pulled. No tool available in this session exposes point-in-time compute
  metrics; this document's compute-tier discussion (§2, F7) is inference from Postgres
  settings, not a measurement.
- **`pg_stat_activity.client_addr` / `application_name` correlation across the outage
  window** — never done. This is the direct way to confirm or refute "multiple
  concurrent agents" (F4) and was available the whole time.
- **Autovacuum/bloat** — checked in this review (not at incident time): ruled out,
  dead-tuple counts are trivial (16–75 rows) across the most-bloated tables.
- **WAL archiving backlog** — a `pg_ls_archive_statusdir()` query appeared in the raw
  logs (likely Supabase's own internal monitoring), but its actual result was never
  captured or reviewed for a backlog.
- **Reproducing the `manual_imports` 500 through PostgREST itself** (not just via
  direct SQL) — never done; see F6.

---

## 4. Revised root-cause assessment

No single root cause was proven. In order of likelihood, given everything above:

1. **Concurrency pressure against a small connection/compute budget** (`max_connections
   = 60`, small `shared_buffers`/`work_mem`) from some combination of interactive
   testing, an automated test suite, and a schema-applying import script overlapping in
   time. This is consistent with all observed symptoms (widespread timeouts, auth
   timeouts, one relation's lock wait) without requiring any single exotic cause — it's
   the simplest explanation that fits, but "simplest that fits" is not "proven."
2. **A specific slow or lock-holding statement** (candidate: whatever acquired the
   `AccessExclusiveLock` on relation 18928 — never identified) tipped an
   already-pressured connection pool over the edge. Plausible contributing mechanism,
   not shown to be sufficient on its own (see F3).
3. **Undersized compute tier for the concurrent workload it's now being asked to
   carry** — plausible, under-evidenced (F7). This and #1 are not mutually exclusive;
   a small tier plus real concurrency is arguably the same root cause described at two
   different levels.

---

## 5. Answers to the standing questions

**1. Most likely root cause:** Concurrency pressure — multiple things (interactive
testing, an automated test/e2e suite, and/or a schema-applying import) hitting this
project's Postgres instance at the same time, against a 60-connection cap and a small
memory footprint. Not proven; most consistent with the evidence available.

**2. Second most likely root cause:** The project's compute tier is undersized for
concurrent, multi-agent/automated-test usage (vs. its likely-intended light/prototype
load). Distinct from #1 in framing but probably the same underlying constraint viewed
from the infrastructure side rather than the traffic side.

**3. Evidence still needed, in priority order:**
   - Enable/query `pg_stat_statements` to get a ranked, aggregate view of expensive
     queries instead of relying on log lines that happened to be captured.
   - Pull actual CPU/RAM utilization graphs from the Supabase dashboard for the
     incident window — the one thing this "CPU investigation" never actually measured.
   - Identify relation 18928 and the statement that took the `AccessExclusiveLock`,
     and confirm its timestamp precedes the 522 storm's onset (not just "in the same
     log window").
   - Correlate `pg_stat_activity`/log `client_addr` and `application_name` across the
     outage window to confirm or refute concurrent multi-session access.
   - Reproduce the `manual_imports` 500 (F6) through PostgREST directly, capturing the
     actual Postgres error, not just confirming the data is queryable via SQL.

**4. Safest immediate change:** None required right now — do not make any config or
infra change on the strength of this document. If forced to name the single lowest-risk
operational improvement: avoid deliberately overlapping heavy operations (schema
migrations/imports, automated test suites, and interactive load-testing) against this
same project at the same time, as a process discipline, not a code change.

**5. Highest-impact code/database change:** Cannot be named responsibly yet — no
change in this document is backed by `EXPLAIN`/`pg_stat_statements` evidence, and
proposing one now would be exactly the "optimization without evidence" this review
exists to catch. The most promising candidate for investigation (not action) is
whatever query/transaction was holding the `AccessExclusiveLock` on relation 18928,
once identified.

**6. Should Nano → Micro happen immediately?** No — not on this evidence. The
Postgres settings pulled for this review (`shared_buffers`, `work_mem`) are consistent
with a small tier, which is suggestive, but this review never obtained actual CPU
utilization data, and an upgrade taken on inference rather than measurement is a cost
change with no confirmed problem statement behind it. Get the CPU/RAM graphs for the
incident window first (see §5.3); if they show sustained saturation, the upgrade
decision will be easy and evidence-backed instead of a guess.

**7. What we should NOT change yet:**
   - No index additions/removals — none were proposed with `EXPLAIN` evidence, and
     none should be added without it; an unjustified index on a small-memory instance
     has its own write-amplification and cache-pressure cost.
   - No `statement_timeout` reduction — 120 s is generous, but shortening it without
     knowing which real workflows legitimately need more than a few seconds
     (bulk imports, generation runs) risks turning slow-but-correct operations into
     hard failures.
   - No compute-tier change (see §6).
   - No "fix" for the `manual_imports` 500 (F6) until it's actually reproduced and the
     real Postgres/PostgREST error is captured — patching blind risks masking the
     actual defect.
   - No standing assumption that "restart when it happens again" is an acceptable
     runbook — it interrupts in-flight transactions/connections and was validated
     exactly once, with no control (F2).
