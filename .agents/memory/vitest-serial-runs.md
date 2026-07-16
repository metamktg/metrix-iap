---
name: Vitest runs must be serial in this workspace
description: Two concurrent vitest processes both die silently; run one at a time and pipe output to a log file.
---

Running two vitest processes concurrently in this workspace (e.g. a second run
while a previous one is still alive, or alongside a validation that runs
vitest) makes runs exit `-1` with **no output at all** — indistinguishable from
a hang or an environment failure.

**Why:** the runs contend for resources/worker pools; neither prints a report.
A full `artifacts/metrix-iap` suite also takes ~2 min, longer than a single
120 s bash timeout, so full runs get killed mid-report (exit 124) with partial
failure lists that look real but are incomplete.

**How to apply:** run vitest one invocation at a time; before retrying a
mysterious `-1`-with-no-output run, `pgrep -fl vitest` first. Pipe output to
`/tmp/*.log` and grep the log instead of relying on truncated stdout. For the
metrix-iap suite, run test directories in a few separate invocations rather
than one full-suite run.
