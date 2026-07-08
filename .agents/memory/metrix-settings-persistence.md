---
name: Metrix settings persistence pattern
description: How Settings (invites, notification prefs) persist — seed defaults + DB overrides merged client-side
---

Settings persistence follows an override model, not a replace model.

**Rule:** The seed bundle stays read-only. Persisted rows (workspace_invites, workspace_notification_prefs) are *overrides/additions* keyed by workspace id (`manager.id`, e.g. `metrix_manager`); the client merges them onto seed defaults at render time (seed value used when no DB row exists).

**Why:** The seed is the demo's source of truth and is regenerated; writing user changes into it would be lost and would violate the seed rules (guided-preview dialogs never mark accounts configured or generate data).

**How to apply:** New persistent settings should add a scoped override table + OpenAPI endpoints (codegen via `@workspace/api-spec`), then merge in the view: `override.get(id)?.field ?? seedDefault`. Invite dedupe: rows whose email matches a seed member are filtered out client-side; server is idempotent per (workspace, email).
