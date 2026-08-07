---
name: Collapsible section headers & chip tooltips (metrix-iap)
description: A11y/e2e rules for collapsible card headers and hover-tooltip chips
---

**Rule 1:** Never put `role="button"` on a wide clickable header div (e.g. SectionCard's collapsible header). Its accessible name becomes the whole title text and collides with Playwright `getByRole('button', { name: ... })` selectors for real buttons on the page (strict-mode violations across many e2e specs). Instead: keep the header a plain clickable div and put the toggle semantics on a small dedicated chevron `<button aria-label="Collapse/Expand section" aria-expanded>`.

**Rule 2:** When replacing native `title` attrs with Radix Tooltips on non-interactive chips, the hidden metadata (raw code, family, rationale) becomes hover-only — `aria-label` on a generic span is NOT a reliable fix (span stays keyboard-unreachable and label exposure varies by AT). Prefer an always-available `sr-only` span with the hidden text inside the chip; keep the tooltip as supplemental visual UI. Also wrap each chip in its own `TooltipProvider`; isolated test renders don't have the app-level provider and crash with "Tooltip must be used within TooltipProvider".

**How to apply:** any new collapsible/disclosable surface or chip-with-tooltip in metrix-iap.
