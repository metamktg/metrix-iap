---
name: Creative browser caching
description: Browser caching policy for immutable uploaded creative assets.
---

Uploaded creative files use a unique import URL, and replacing an asset produces a new URL. Treat those file responses as immutable and allow long-lived private browser caching; do not use localStorage for image bytes.

**Why:** Browser and disk caches can render repeat visits without a network request, while localStorage is small, awkward for binary image data, and risks duplicating protected asset bytes.

**How to apply:** Preserve unique asset URLs when replacing files, keep the file endpoint authenticated, and use lazy/async image decoding for large creative grids so visible cards receive priority.