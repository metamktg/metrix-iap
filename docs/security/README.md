# docs/security — tenancy and service-role enforcement

| Document | Source | Purpose |
| :---- | :---- | :---- |
| [`METRIX_RLS_and_Service_Role_Security.md`](METRIX_RLS_and_Service_Role_Security.md) | Blueprint v2.0 §12 | The manual tenancy checks every `service_role` Edge Function must perform, the three `assert*` helpers, and the list of functions the rule applies to. |

## Why this matters

The `service_role` key bypasses RLS entirely. Any Edge Function holding it is responsible for
enforcing tenancy by hand — caller identity, org membership, client access, and object ownership,
in that order, before any write. This is required reading before `supabase/policies/` is
implemented, and before adding any new service-role function.

Scheduled jobs have no human caller and therefore cannot verify caller identity the same way; they
use strict system-scoped job authorization plus the same client/org scoping.

## Related

- [`../architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md`](../architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md) — §11.1 identity/access tables, §13 Edge Functions
- [`../data-model/README_MIGRATIONS.md`](../data-model/README_MIGRATIONS.md) — migration conventions
