---
name: Metrix Meta ad backfill pipeline
description: How real creatives + Ads Manager deep links flow in once raw Meta exports arrive; the account-id trap.
---

# Metrix Meta ad backfill pipeline

- Backfill path: drop `meta_ads_export.json` in `scripts/data/metrix/` → re-run the idempotent importer → seed exposes per-account `ads[]` + `meta_ad_account_id` → client resolves a primary ad per creative cell.
- **Rule:** Ads Manager deep links (`act=` param) must use the numeric Meta ad account id (`meta_ad_account_id`, no `act_` prefix) — never the internal account id (e.g. "bookster"). Passing the internal id produces a syntactically valid but broken link.
- **Why:** the internal id and the Meta id are both "the ad account id" in casual conversation; the card assembly opts were deliberately renamed to `metaAdAccountId` to prevent recurrence.
- **How to apply:** any new surface linking to Meta must take the link context from the seed adapter (`getCreativeLinkContext`), and asset + deep link must come from the same ad row so the link matches the creative shown.
- Verified deep-link format (July 2026): `https://adsmanager.facebook.com/adsmanager/manage/ads?act=<numeric-id>&selected_ad_ids=<AD_ID>`.
- The importer can run live from this environment (`SUPABASE_DB_URL` is set); it's idempotent and logs unmatched ad names instead of failing.
- Pipeline dress-rehearsed end-to-end with a synthetic export (July 2026): matched/unmatched logging, `act_` stripping, seed exposure, card images, modal, and deep-link URL all verified, then reverted (re-running the importer without the file restores NULLs). Only the real export file is missing.
- Verification recipe without browser login: creative cards on IAP Library / Concept Map / Brief Builder are drawer-gated (0 imgs at initial render is normal); use `/app/analysis/library?focus=<cell>` to open the drawer, and the Ads Manager button exists only inside the expanded card dialog.
- Manual accounts never get `ads.cell` (only the Meta export backfill sets it), so cell→creative resolution must fall back to the MST library cell's `mapped_ad_names` matched against `ads.ad_name` — otherwise manually uploaded creatives silently never render in library/MST subpages.
