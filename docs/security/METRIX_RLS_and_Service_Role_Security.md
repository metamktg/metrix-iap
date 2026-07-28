# METRIX RLS and Service-Role Security

**Source:** `docs/architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md` §12 — reproduced verbatim.
The blueprint remains canonical. This file is the standing reference for the tenancy rules that
must hold before `supabase/policies/` is implemented.

---

## 12. RLS and Service-Role Security

Any Edge Function using the `service_role` key bypasses RLS and must manually enforce tenancy:

```
verify caller identity
verify org membership
verify client access
verify requested object belongs to client/org
only then write with service role
```

```
assertUserCanAccessClient(user_id, client_id)
assertUserCanAccessOrg(user_id, org_id)
assertObjectBelongsToClient(object_id, client_id)
```

Applied to: `validate-upload`, `run-pipeline`, `bridge-transform`, `resolve-creatives`, `export-report`, `severity-scheduler`. Scheduled jobs with no human caller use strict system-scoped job authorization plus the same client/org scoping.

---

## Related

- Blueprint §11.1 — identity and access tables (`organizations`, `clients`, membership)
- Blueprint §11.5 — migrations remain GitHub-canonical
- Blueprint §13 — Edge Functions and config-as-data
- `docs/data-model/README_MIGRATIONS.md` — migration conventions
