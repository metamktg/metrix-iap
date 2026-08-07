---
name: Workflow coverage guard for check/smoke scripts
description: Every check:*/smoke:* script must run in a workflow or be explicitly allowlisted with a reason
---

Rule: any new `check:*` or `smoke:*` script must run in a configured workflow (directly or as an IAP smoke orchestrator step) or be explicitly allowlisted with a reason (manual-only allowlist, or the IAP exclusion list for `smoke:metrix-iap-*`). Blanket category-level bypasses in coverage guards are rejected in review — each exception must be individual and reasoned.

**Why:** scripts were being added without ever running anywhere, so regressions shipped silently.

**How to apply:** when adding a check/smoke script, wire it into a workflow or add a reasoned allowlist entry; if workflow invocation syntax changes, verify the guard's `.replit` parsing still matches.
