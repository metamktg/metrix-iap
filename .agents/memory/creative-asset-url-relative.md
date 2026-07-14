---
name: Creative asset URLs must be relative paths
description: ads.creative_asset_url must be stored as a relative path, never an absolute URL; Replit dev domain instability causes silent image load failures.
---

## Rule

`ads.creative_asset_url` (and any server-generated URL persisted to the DB that the browser then fetches) must be stored as a **relative path** — e.g. `/api/metrix/accounts/bookster/manual-imports/{id}/file` — never as an absolute URL like `https://{domain}/api/...`.

**Why:** Replit dev domains change across sessions (e.g. `...2cv06h10pnw2i.spock.replit.dev` vs `...2cv06h10pnw2i-ymw6fxfx.spock.replit.dev`). Absolute URLs written during one session become unreachable in the next. The failure is silent: `<img src={staleAbsoluteUrl}>` fires `onError`, the card drops to the `PlaceholderVisual` ("No asset"), and no network request appears in server logs (browser fetches the wrong domain entirely, never reaching the API).

**How to apply:**
- `manualImportFileUrl(accountId, importId)` → `` `/api/metrix/accounts/${accountId}/manual-imports/${importId}/file` `` (no `getAppBaseUrl()` call)
- `syncAllCreativeLinksForAccount(accountId)` → constructs the relative path directly; removed `appBaseUrl` parameter
- If stale absolute URLs exist in prod Supabase, extract the path from the stored URL (everything after the domain) and write it back via the REST API

**Diagnosis signal:** Supabase has `creative_asset_url` set for N ads but the Library shows "No asset" and the API server log shows zero `/file` requests — means the stored domain doesn't match the current `REPLIT_DOMAINS`.
