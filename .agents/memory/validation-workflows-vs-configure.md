---
name: Validation workflows vs configureWorkflow
description: How check:* scripts get wired into workflows in this project
---
The check:*/smoke:* workflows (command-deck-contrast, css-token-contrast, …) are validation workflows registered via `setValidationCommand` (validation skill), NOT `configureWorkflow`.

**Why:** the 10-custom-workflow limit is already exceeded, and configureWorkflow refuses to touch existing validation workflows ("cannot be switched to a non-validation workflow"). configureWorkflow can also report success while creating nothing — verify with listWorkflows.

**How to apply:** to satisfy the workflow-coverage guard for a new check script, call `setValidationCommand({ name, command })`; it lands in .replit and the guard test passes. Also: completion validation runs the whole suite — api-server tests can flake with Supabase Cloudflare 522s under concurrent load; verify in isolation before assuming your change broke them.
