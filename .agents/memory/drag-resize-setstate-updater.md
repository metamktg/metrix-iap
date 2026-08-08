---
name: Drag-resize onDragEnd must not call other components' setState from inside a functional updater
description: useDragResize's onDragEnd callback (sidebar/tray pattern) must read the final drag value from a ref, not from a setState functional updater, when it needs to call a side effect like a parent/context close()
---

When implementing drag-to-resize with the shared `useDragResize` hook (`src/hooks/useDragResize.ts`), the `onDragEnd(wasDragged)` callback often needs the last live-drag value to decide whether to commit a resize or snap-close the panel (which calls a *different* component's setState, e.g. a context's `close()`).

**Problem:** reading that final value via `setDragWidth((finalWidth) => { ...call close()/other setState...; return null; })` triggers React's "Cannot update a component while rendering a different component" warning, because functional state updaters must stay pure — side effects (closing a sibling context, writing localStorage) don't belong inside them.

**Fix:** keep a plain ref (`dragWidthRef`) updated alongside the `dragWidth` state during `onDrag`. In `onDragEnd`, read the final value from the ref (not from a setState updater), perform side effects directly in the event-handler body, then reset state with a plain `setDragWidth(null)`.

**Why:** confirmed via a live testing subagent run — the warning appeared with the updater-based approach and disappeared once side effects moved out of the updater and into the handler body reading a ref.

**How to apply:** any new resizable panel (sidebar-style or tray-style) that needs to snap-close or persist width on drag release should follow this ref-based pattern, not the setState-updater pattern.
