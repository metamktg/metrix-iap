---
name: API server dev workflow rebuilds on restart, no HMR
description: New/changed Express routes on the API server keep 404ing until the dev workflow is manually restarted; the dev script does a full esbuild+start, not hot reload.
---

The `artifacts/api-server` dev workflow runs `pnpm run build && pnpm run start` — an esbuild bundle followed by `node dist/index.mjs`. There is no file-watcher/HMR loop like Vite. Editing route files has zero effect on the running process.

**Why:** After adding new routes to `metrix.ts` and confirming a clean `pnpm run typecheck`, manual `curl` testing against the running server returned `Cannot POST ...` 404s for routes that clearly existed in source. The code was correct; the running process was stale.

**How to apply:** After adding/editing server routes, always restart the `artifacts/api-server: API Server` workflow before doing any curl/manual verification against it. Typecheck passing is not sufficient signal that the server reflects your changes.
