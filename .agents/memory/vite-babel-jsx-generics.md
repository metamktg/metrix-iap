---
name: Vite Babel rejects JSX explicit generics
description: React+Vite artifacts fail to parse <Component<T>> even though tsc accepts it
---

# Vite Babel parser rejects JSX explicit generic type arguments

Writing a generic React component call with explicit type args in JSX — `<ModuleTabs<Tab> ... />` — type-checks fine under `tsc` but throws a **build-time** `Unexpected token` parse error from `@vitejs/plugin-react` (Babel). `tsc --noEmit` will NOT catch this; it only surfaces at dev-server/screenshot time.

**Why:** Babel's JSX parser does not support the `<Comp<T>>` syntax that TypeScript's own parser does. Two different parsers, two different grammars.

**How to apply:** When a generic component's prop inference fails (e.g. `onChange={setState}` where the dispatch type won't unify), do NOT reach for `<Comp<T>>`. Instead widen the call-site state so inference resolves on its own — e.g. `useState<string>(...)` instead of `useState<SomeUnion>(...)` — and drop the explicit JSX generic. The generic function *declaration* (`function Comp<T extends string>(...)`) is fine; only the JSX *call* with explicit args breaks.
