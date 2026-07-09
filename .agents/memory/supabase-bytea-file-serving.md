---
name: Serving bytea file content from Supabase via PostgREST
description: How to decode a Postgres bytea column read back through supabase-js/PostgREST for binary file serving (e.g. staged upload previews).
---

When a `bytea` column is inserted via supabase-js as `` `\\x${buf.toString("hex")}` ``, reading it back through PostgREST also returns a hex string prefixed with `\x` (Postgres's default bytea output format), not raw bytes and not base64.

**Why:** PostgREST serializes bytea using Postgres's `bytea_output` setting, which defaults to `hex` and includes the `\x` prefix on the wire — the same text form used for insert.

**How to apply:** When implementing a binary passthrough route (e.g. `GET .../file` serving a staged upload for `<img>`/`<video>` src), strip a leading `\x` before hex-decoding: `Buffer.from(raw.startsWith("\\x") ? raw.slice(2) : raw, "hex")`. Only select the `content` column on the one route that needs bytes — list/metadata endpoints should never select it, to avoid pulling large blobs unnecessarily.
