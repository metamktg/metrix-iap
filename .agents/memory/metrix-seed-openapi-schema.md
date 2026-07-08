---
name: Metrix seed keys must be declared in OpenAPI schema
description: New top-level seed bundle keys are silently stripped by the API unless added to the MetrixSeedBundle schema in openapi.yaml.
---

# Rule
Adding a new **top-level** key to `metrix_seed_bundle.json` is not enough — it must also be declared as a property of `MetrixSeedBundle` in `lib/api-spec/openapi.yaml`, then `pnpm --filter @workspace/api-spec run codegen` and restart the API server.

**Why:** The seed endpoint validates with the Orval-generated Zod schema (`GetMetrixSeedResponse.parse`). Orval's zod output ignores `additionalProperties: true` on the object, so undeclared top-level keys are silently stripped from the API response. The UI then sees the key as missing even though the JSON file has it — no error anywhere.

**How to apply:** Whenever a seed extension shows up as "missing" in the client despite being in the JSON, check the API response first (`curl localhost:80/api/metrix/seed`). Keys nested *inside* `ad_accounts[]` / `manager_account` pass through fine (those are loosely typed records); only new top-level keys need the spec change.
