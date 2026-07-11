---
name: Vite HMR module-graph corruption after mass edits
description: Phantom provider/context crashes in the browser after heavy HMR churn; restart the dev server before browser testing.
---

After a large batch of file edits (codemods, sed sweeps, parallel subagent passes) hits a running Vite dev server, the HMR module graph can corrupt: the browser throws phantom errors like "useAuth must be used within an AuthProvider" or "Invalid hook call" with stack traces pointing at line numbers that do not exist in the current file (duplicate context/React module instances).

**Why:** dozens of "Could not Fast Refresh" invalidations leave stale module copies in the graph; even fresh page loads can serve an inconsistent bundle.

**How to apply:** before any browser/e2e verification that follows heavy HMR churn, restart the artifact's dev workflow first. Diagnostic tell: the reported crash line number exceeds the file's actual length, or the provider wiring is verifiably intact in source.
