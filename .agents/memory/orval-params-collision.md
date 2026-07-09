---
name: Orval Params-type name collision
description: Why generation endpoints use a path param for `kind` instead of a query param
---

Rule: in `lib/api-spec/openapi.yaml`, avoid giving an operation BOTH path and query parameters when a sibling operation on the same resource would generate the same `<OperationName>Params` type — Orval derives the Params type name from the operation and collides silently, producing broken generated code.

**Why:** `GET /metrix/accounts/{accountId}/generation-runs/latest?kind=...` generated a `GetLatestGenerationRunParams` name that collided; moving `kind` into the path (`/generation-runs/{kind}/latest`) removed the query-params type entirely and fixed codegen.

**How to apply:** when adding spec operations that need a discriminator (kind/type/mode), prefer a path segment over a query param; after codegen, check the generated client compiles before wiring the client.
