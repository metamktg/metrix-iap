---
name: Generated brief pillar ID patching
description: Generated brief payloads store pillar refs in two JSON fields; seed reads strategic_foundation.message_pillar first. Must patch both when realigning briefs to a new strategy run.
---

When the generation engine stores a brief in `imported_creative_briefs`, the `payload` JSONB column contains the pillar reference in **two places**:

1. `payload -> 'strategic_foundation' -> 'message_pillar'` — comes from `b["strategic_foundation"]["message_pillar"]` in the AI output
2. `payload -> 'brief_metadata' -> 'strategic_source'` — set explicitly by the generation engine as `pillarId`

The seed assembly (`metrixSeedAssembly.ts` line ~408) reads:
```typescript
source_pillar: foundation["message_pillar"] ?? meta["strategic_source"] ?? ""
```
where `foundation = b["strategic_foundation"]`. So `foundation.message_pillar` has **priority** over `meta.strategic_source`.

**When realigning briefs after a new strategy run replaces pillar IDs:**

```sql
-- Must patch BOTH fields
UPDATE imported_creative_briefs
SET payload = jsonb_set(
  jsonb_set(
    payload,
    '{strategic_foundation,message_pillar}',
    to_jsonb(replace(payload->'strategic_foundation'->>'message_pillar', 'OLD_RUN_TAG', 'NEW_RUN_TAG'))
  ),
  '{brief_metadata,strategic_source}',
  to_jsonb(replace(payload->'brief_metadata'->>'strategic_source', 'OLD_RUN_TAG', 'NEW_RUN_TAG'))
)
WHERE account_id='...' AND source='generated'
  AND payload->'strategic_foundation'->>'message_pillar' LIKE '%OLD_RUN_TAG%';
```

**Why:** If you only patch `brief_metadata.strategic_source`, the seed assembly silently ignores it because `strategic_foundation.message_pillar` takes priority via the `??` chain. The brief cards in BriefBuilderView.tsx use `pillarOf(b.source_pillar)` which looks up by pillar `id` — misaligned refs cause every brief to show the raw pillar ID instead of its label.

**How to apply:** Any time two strategy generation runs exist for the same account (e.g., a stuck run was reset and re-triggered), the newer run replaces the pillar IDs. If briefs were generated against the old run's pillar IDs, patch both payload fields using the SQL above. Verify alignment with `strategic_foundation.message_pillar LIKE '%NEW_TAG%'`.

Also: the seed cache (30s TTL, in-memory) must expire before the fix is visible. After patching the DB, wait ~35s and re-fetch `/api/metrix/seed` to confirm `source_pillar` aligns to current `message_pillars[].id` values.
