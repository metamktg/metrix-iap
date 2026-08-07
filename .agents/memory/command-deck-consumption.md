---
name: Command Deck consumption in Metrix IAP
description: How the IAP consumes the design system and the pitfalls (always-dark, token tests, app-specific tokens)
---

- Metrix IAP imports `@workspace/command-deck/styles.css` as its only theme; shadcn tokens (`--background`, `--primary`, `--ring`, …) come from the package. The app is **always dark**: `class="dark"` is set on `<html>` in index.html — the package `:root` is light.
- App-specific tokens stay local in the IAP's index.css: `--mx-*`, `--surface-*`, `--text-*`, `--status-*`, `--metrix-*`, void-navy/gradients, shell geometry, shadows, and the slim `@theme inline` block mapping them to utilities. They are not superseded by the package.
- WCAG a11y tests that parse token values from CSS must use `loadEffectiveThemeCss()` (wcag-contrast-helpers), which prepends the package's `.dark` block to the app stylesheet so first-match extraction sees the effective dark values.
- **Why:** tokens no longer live in the app stylesheet; reading only the app CSS throws "CSS variable not found".
- **How to apply:** any new test or check that extracts `--primary`/`--ring`/etc. from CSS should go through that helper, not read `src/index.css` alone.
- Package-provided ui components, `cn`, `use-toast`, `use-mobile` are imported from `@workspace/command-deck/...`; only app-specific ui files (DataSourceBadge, InfoDrawer, LoopStatusStrip) remain in `src/components/ui/`.
