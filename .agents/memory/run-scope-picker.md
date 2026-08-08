---
name: Run scoping & account identity
description: Product rules for showing the active ad account and scoping pages by analysis run in Metrix IAP.
---
Rule: never render the ad-account name/platform in page headers or banners — the sidebar account switcher is the single place account identity appears. The old ScopeBanner and ModuleHeader account chip were deliberately removed.
Rule: run scoping on stage pages (Analysis Overview, IAP Library, MST Concept Map/Crossmap, Strategy Overview) uses the compact RunScopePicker header popover (RunSelector.tsx), default "All time", max 3 selected runs (RUN_SCOPE_MAX); a 4th pick shows the cap note. Emptying the selection falls back to All time.
**Why:** account banners duplicated the sidebar on every page; the old always-open RunSelector checklist ate vertical space and had no cap. The full RunSelector remains only inside LoopCommandChain's strategy-generation panel.
**How to apply:** new stage pages needing run scoping should mount RunScopePicker in ModuleHeader's `right` slot and filter via useCellRunScope / manual_analysis_run_id (null/legacy rows always pass). Don't reintroduce account text or standing run checklists.

## Persistence (usePersistedRunScope)
Selections persist in sessionStorage per page + ad account with a stale-run fallback to All time.
**Why:** two review-caught pitfalls: (1) on account switch, a leftover selection from the prior account can be validated against the new account's run list and clobber its stored value — state must be keyed to page+account and reset synchronously during render; (2) controlled children (e.g. MST tabs whose parent owns the picker) must mount the hook inert (`enabled=false`) or their unused local state can write All time into the parent's shared storage key after a runs refetch.
**How to apply:** any new page adopting RunScopePicker should use usePersistedRunScope (src/lib/run-scope.ts) with a unique pageKey; controlled components pass `!controlled` as `enabled`.
