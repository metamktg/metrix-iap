---
name: Supabase bytea file serving
description: PostgREST bytea read/write perf ceiling for file uploads stored as hex-encoded columns.
---

- PostgREST returns bytea as a hex string with a `\x` prefix on read; bytea fetches for large images are slow (10-17s) and can time out under concurrent load — use an in-process TTL cache + in-flight Promise map to coalesce requests.
- **Writes are equally constrained, not just reads.** Inserting a file as `\x${buffer.toString("hex")}` via a Supabase/PostgREST insert gets slow (~15-20s) starting around 10-20 MB of raw file content, and has been observed to intermittently time out (502) under shared-dev-Supabase load well before any application-level size limit is reached.
- **Why:** the insert path holds multiple full in-memory copies of the payload at once (raw JSON string, base64-decoded buffer, hex-re-encoded string), and PostgREST's own request handling for large bytea columns is not fast. Pushing an app-level upload limit to 150-200 MB (to accommodate a "why not just raise it" request) reproduced a hard Node OOM crash — not just slowness.
- **How to apply:** don't set an upload-size cap for bytea-backed file storage past what's been empirically verified to complete reliably (found ~75 MB decoded to be a reasonably safe ceiling with real-world CSVs in this project, still slow but survivable). If a feature genuinely needs larger files, move that storage to Object Storage with a streamed upload instead of raising the bytea cap further.
