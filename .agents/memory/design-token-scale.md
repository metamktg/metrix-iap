---
name: Design token scale (metrix-iap)
description: Formal type scale, semantic surface/border/text/status tokens, and batch-replace pattern for metrix-iap.
---

# Design Token Scale — metrix-iap

## Type scale utilities (index.css @layer utilities)
- `.text-label` → 10px (0.625rem), matches TYPE.label in typography.ts
- `.text-caption` → 11px (0.6875rem), matches TYPE.caption
- `.text-body` → 12px (0.75rem), matches TYPE.body (same size as text-xs)
- `.text-title` → 13px (0.8125rem), matches TYPE.title
- `.text-display` → 21px (1.3125rem), page headings

**Why:** All arbitrary `text-[Npx]` classes in the 10/11/12/13/16/21px range were batch-replaced via sed to these named utilities. 8px and 9px are intentionally left as arbitrary (micro badge sizes outside the formal scale).

**How to apply:** Any new metric/card/label text must use one of these classes instead of `text-[Npx]`. Add new sizes to index.css `@layer utilities` first.

## Semantic surface/border/text tokens (:root + .dark)
- `--surface` / `--surface-raised` / `--surface-overlay` — card/panel/modal backgrounds
- `--border-subtle` / `--border-default` — dividers vs interactive borders
- `--text-primary` / `--text-secondary` / `--text-muted` — text hierarchy
- `--status-success` / `--status-warning` / `--status-danger` / `--status-info` — status palette
- All wired to `@theme inline` as `--color-surface-*` etc.

## Muted-foreground contrast
- `--muted-foreground: 216 28% 78%` (was `216 22% 74%`) — lifted to ensure ≥ 3:1 on bg-main.

## Elevation scale
- `.elevation-flat`, `.elevation-raised`, `.elevation-floating` utilities defined.
