---
name: Metrix IAP visual revert decision
description: The post-redesign UI was deliberately reverted to the production visual identity; do not reintroduce the combined-analysis redesign.
---

The July 2026 frontend redesign (new typography scale, contrast lifts, AnalysisCombinedView replacing AnalysisOverview, and helper components like CrossMapMatrix/SortableTable/MetricTileCarousel) was reverted at the user's explicit request — they found it cluttered and distressing and want the app to stay familiar to current users.

**Why:** User directive: preserve the production visual identity; integrate new data into the existing layout instead of dense combined views; avoid data overload.

**How to apply:** Do not resurrect the deleted redesign components or the `text-label-*` typography utilities. New analysis features should slot into the existing per-module views (AnalysisOverview, PlacementsView, etc.) with production-era styling. The one kept feature from the redesign is the compact SharePieChart spend-share donut in PlacementsView.
