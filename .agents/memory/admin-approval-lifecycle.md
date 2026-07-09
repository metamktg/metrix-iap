---
name: Admin approval lifecycle
description: Strict state transitions and failure-path honesty for waitlist / access-request approval flows
---

- Rule: approval/rejection endpoints only transition `pending` entries. Terminal states are sticky — approve-after-reject and reject-after-approve return 409; repeats return `already_approved` / `already_rejected` without mutation.
- Rule: when approval spans two stores (mark-approved in Supabase + provision credentials in Replit Postgres), mark the status FIRST and fail the whole request (503) if it doesn't stick — never return "approved" after a partial write, or retries silently rotate the user's password.
- **Why:** architect review caught the original order (provision → mark) returning 200 even when the status update failed, leaving pending rows with already-provisioned users and misleading admins.
- **How to apply:** any future multi-store approve/provision flow (e.g. new admin actions) should follow status-first ordering and strict pending-only transitions.
