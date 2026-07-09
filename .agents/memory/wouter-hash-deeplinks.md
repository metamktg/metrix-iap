---
name: Wouter hash deep-links break tests
description: Why in-app deep-links in the Metrix IAP use ?focus= params, never URL hashes
---

Rule: for in-app deep-links (scroll-to/highlight/open-drawer on arrival), use the existing `?focus=<id>` convention (`useFocusParam()` in `pages/metrix/shared.tsx`), never a `#hash`.

**Why:** wouter's `memoryLocation` (used by the nav test harness) matches routes against the raw path string — a hash like `/page#x` fails to match `/page` and renders the 404. Query strings ARE stripped by the matcher, so `?focus=` works in both browser and tests. Also, wouter patches history, so clearing a param via `replaceState` re-triggers `useSearch` — latch the arrival value in a ref before clearing, and preserve unrelated params (e.g. `?account=`) when deleting `focus`.

**How to apply:** any new "redirect and point at a section" feature — redirect with `?focus=<id>`, consume it once on mount via a ref latch, strip only that param.
