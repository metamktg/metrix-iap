---
name: Creative deconstruction flow
description: Durable rules for classifying uploaded creatives into the IAP library — gate, atomic replacement, provenance.
---

# Creative deconstruction (uploads → IAP library)

- **80% gate is deterministic**: overall grade = mean of per-variable confidences computed server-side; never trust a model-supplied overall. Below-gate results go to the review queue; bypass is an explicit user action recorded as an override.
- **Replacement is atomic per import** — never delete a prior classification or its filed library entry before the new one is computed and committed (single upsert on the account+import unique key, then swap the library cell). **Why:** an earlier ordering deleted first and a transient model failure permanently erased library content; code review rejected it. Run-failure cleanup must NOT delete deconstruction outputs by run id — every committed row is a complete valid replacement with nothing to restore.
- **Registry validation is prefix-based** (family→code prefix), because families are fixed but codes extend; the client mirrors the family/prefix map — keep both sides in sync.
- **Cell alignment**: use the mapped ad's grid cell, else the linked brief's matrix cell, else a NEW column — never guess a creative into an existing grid column.
- Filed library payloads carry deconstruction provenance keys; all dedupe/cleanup (re-classification, discard, import delete) works via those keys — any new writer must preserve them.
## Video creatives
Videos are classified via keyframes extracted with system ffmpeg/ffprobe (lib/videoKeyframes.ts): deterministic opening/middle/closing timestamps, JPEG frames fed as multiple image blocks in one model call. Video detection (MIME OR extension) takes precedence over image media-type resolution — a .mp4 with a misdetected image MIME must never be sent to the model as an image. Only non-video unknown formats (or ffmpeg-undecodable files) stay `unsupported`; unsupported rows are re-runnable from the upload panel (Retry button + included in "Deconstruct all").
## Bulk backfill & run progress
- Bulk backfill endpoint targets server-side: every creative_asset import with no non-discarded classification (discarded rows get retried; unsupported/needs_review/filed are skipped).
- generation_runs carries progress_done/progress_total, updated after each per-import commit; UI polls the latest-run endpoint for the n-of-m meter. Pacing: sequential model calls + pause every few items.
