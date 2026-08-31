---
name: Stable Meta creative identity
description: Durable identity and correction rules for linking Meta ad exports to manually uploaded creative assets.
---

Map creatives by the normalized exported Meta Image name or Video name within an account and media type. Match tolerantly only on first encounter, reject tied candidates, then reuse the persisted mapping without routine rescoring.

**Why:** Ad names and Meta ad IDs are not stable creative identities: one creative can be reused by many IDs, and different IDs can share one ad name. Collapsing performance by ad name loses external objects and can permanently attach the wrong upload.

**How to apply:** Preserve exact Meta ad IDs as strings and use them as the primary performance-row identity, with ad name only as a fallback when the export omits the ID. Keep unresolved aliases visible, and make corrections auditable and ID-scoped when names collide.