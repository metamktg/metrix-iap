---
name: CreativeVisual loading state
description: Why CreativeVisual/ExpandVisual need a spinner overlay and brokenUrl reset, and where they live.
---

Both `CreativeVisual` (CreativeCard.tsx) and `ExpandVisual` (CreativeExpandDialog.tsx) have:
- `loadedUrl` state — set on `onLoad`; while `assetUrl` is set but `loadedUrl !== assetUrl`, a spinner overlay covers the hidden (`opacity-0`) image
- `useEffect([data.assetUrl])` that resets both `brokenUrl` and `loadedUrl` to null on URL change

**Why:** Supabase bytea fetches take 1–5 seconds cold (first hit); browser renders a blank `<img>` during this window that is visually indistinguishable from the "No asset" placeholder. Users reported creatives "not appearing" because they saw a blank card before the image arrived. Also, `brokenUrl` was sticky — a transient 401 (auth not yet established when Library first renders) permanently blocked the image for that component lifetime. URL-change reset clears both failure states so a seed refresh or new asset mapping always retries.

**How to apply:** Any new component that renders a `<img>` for a session-auth-gated URL should follow this same pattern.
