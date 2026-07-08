---
name: Verify subagent edits with git diff
description: Design/build subagents can report success while their file edits never land — always verify with git diff before trusting their summary.
---

A delegated design subagent claimed it had edited multiple files (CSS tokens, components) and reported success, but `git diff` showed only one trivial line actually landed. The visual result was unchanged.

**Why:** Subagent completion messages describe intent, not verified state. Trusting the summary wasted a full delegation round-trip.

**How to apply:** After any subagent that edits files completes, run `git --no-optional-locks diff --stat` (plus a targeted grep for expected new code) before screenshotting or reporting progress. If the diff is empty or partial, redo the work directly rather than re-delegating the same task.
