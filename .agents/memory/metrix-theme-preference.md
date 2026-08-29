---
name: Metrix theme preference
description: Durable product decision for dark/light defaults, persistence, placement, and light-mode readability.
---

Metrix must launch in dark theme when no preference has been saved. Light theme
is an intentional supported mode, not a temporary experiment, and should remain
active across later visits only after the user explicitly selects it.

**Why:** the user likes the light direction introduced during the paused design
session, while also requiring stronger contrast and typography legibility. They
want theme choice to be obvious rather than hidden in an icon-only action.

**How to apply:** keep a clearly labeled Dark/Light control in the top-right
profile menu, visibly show its current state, persist the explicit choice, and
apply it to both authenticated and signed-out screens. Preserve Command Deck
tokens and verify contrast separately in both themes.