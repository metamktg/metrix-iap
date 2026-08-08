---
name: Recharts scatter tests in jsdom
description: How to render and assert recharts scatter bubbles in Vitest/jsdom without false matches or typecheck breakage
---

- **Rule:** In jsdom, mock recharts' `ResponsiveContainer` to clone its child with fixed `width`/`height` — otherwise it measures 0×0 and renders no shapes. Type the child as `ReactElement<{ width?: number; height?: number }>` before `cloneElement`, or `tsc` fails TS2769 (props infer as unknown) even though Vitest passes.
- **Rule:** Recharts wraps each custom scatter shape in its own `g.recharts-scatter-symbol` with `role="img"` and no label. Query `g[role="img"][aria-label]` for the shape you rendered, or every bubble matches twice (once with a null label).
- **Why:** Both bit during the Audience Intelligence Map winner-highlight regression test — the suite passed while the workspace typecheck failed, and the highlight selector returned duplicate/empty labels.
- **How to apply:** Any Vitest test asserting on recharts chart internals (bubbles, bars, custom shapes) in metrix-iap or similar artifacts.
