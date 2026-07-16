---
name: Concept chip rendering & interactivity
description: Why concept chips may not render in Signal/Alerts/Briefs views, and the non-button chip pattern
---

# Concept chip rendering & interactivity

- `ConceptChip` renders as `<span role="button" tabIndex=0>` (NOT `<button>`) because cards in SignalView/AlertsView/BriefBuilderView/HypothesisQueueView are real `<button>` elements that embed `TokenizedConceptText`. Keep it a span — reverting to `<button>` reintroduces invalid nested-button HTML.
  **Why:** buttons nested in buttons are invalid HTML; browsers/screen readers mis-handle click and focus. Fixed July 2026 with click stopPropagation + Enter/Space keyDown on the span. Regression test: `src/components/concept/__tests__/ConceptChip.test.tsx`.
- Chips only render for codes present in the seed's global `concept_registry`. As of July 2026 the registry contains only column codes (C1–C7) and LD-CN-* concepts, while card text uses full cell codes (C2B, C4E…) — so tokenized views show plain text, zero interactive chips, for every account. Don't assume chips are visible when e2e-testing those views; StrategyMapView's direct `<ConceptChip>` usage is also gated on `registry[code]`.
  **How to apply:** to verify chip behavior live, first check `document.querySelectorAll('[aria-label^="Concept "]')` > 0; if 0, it's the registry gap, not a rendering bug.
