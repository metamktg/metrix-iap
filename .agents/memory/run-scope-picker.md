---
name: Run scoping & account identity
description: Product rules for showing the active ad account and scoping pages by analysis run in Metrix IAP.
---
Rule: never render the ad-account name/platform in page headers or banners — the sidebar account switcher is the single place account identity appears. The old ScopeBanner and ModuleHeader account chip were deliberately removed.
Rule: run scoping on stage pages (Analysis Overview, IAP Library, MST Concept Map/Crossmap, Strategy Overview) uses the compact RunScopePicker header popover (RunSelector.tsx), default "All time", max 3 selected runs (RUN_SCOPE_MAX); a 4th pick shows the cap note. Emptying the selection falls back to All time.
**Why:** account banners duplicated the sidebar on every page; the old always-open RunSelector checklist ate vertical space and had no cap. The full RunSelector remains only inside LoopCommandChain's strategy-generation panel.
**How to apply:** new stage pages needing run scoping should mount RunScopePicker in ModuleHeader's `right` slot and filter via useCellRunScope / manual_analysis_run_id (null/legacy rows always pass). Don't reintroduce account text or standing run checklists.
