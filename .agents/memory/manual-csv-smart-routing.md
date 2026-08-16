---
name: Unified auto-routing CSV upload
description: How the Metrix IAP manual-import dialog classifies dropped CSVs into slots without asking the user to sort them
---

The manual-import dialog (`ManualUploadPanel`/`ManualImportDialog` in
`artifacts/metrix-iap/src/pages/metrix/ConnectAccountDialogs.tsx`) uses a
single `SmartCsvUpload` dropzone for all 4 Meta performance CSV kinds
(demographic/placement required, ad_summary/conversion_device optional)
instead of separate upload boxes per kind.

**Why:** users don't think in terms of "slots" — asking them to pick which
box a Meta export belongs in, then showing a "wrong slot" error when they
guess wrong, was reported as unfriendly/high-friction. The server already
classifies CSVs by header signature (`detectCsvClassMismatch` in
`artifacts/api-server/src/lib/iapCsvSpec.ts`), so the client can just try a
kind and silently retry with the server's suggested correction — no
user-visible error for a merely-misfiled drop.

**How to apply:** any future upload flow with content-classifiable files and
multiple destination slots should default to "one dropzone + auto-route +
silent self-correction," not one box per slot. Keep the retry/correction
logic capped (bounded attempts) to avoid infinite loops if classification is
ambiguous, and only surface an error when no slot fits after exhausting
corrections.
