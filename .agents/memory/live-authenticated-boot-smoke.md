---
name: Live authenticated boot smoke
description: Constraints for proving the Metrix authenticated browser boot against the managed live API
---

The live authenticated boot probe must use a real session cookie from the API login, let the browser make the real seed request through the managed router, and keep route-fetch diagnostics free of request headers. The seed is large enough that a cold assembly can exceed ordinary browser request defaults and may finish after a client abort, warming the server cache for the next run.

**Why:** A deterministic fixture proves the client contract but cannot catch cookie forwarding, auth middleware, router proxying, or Supabase assembly. Playwright timeout errors can include the full cookie header, and the production seed can take minutes on a cold cache.

**How to apply:** Gate the live probe on an available managed router, pass an explicit long timeout to both fetch and `route.fetch`, capture only bounded response bodies, and use generic route-fetch failure messages. Create only a disposable user row with no account grants and delete it independently on every cleanup path.