// ─── Deep-dive stack state ────────────────────────────────────────────
// Holds the module stack behind the right slide-over deep-dive panel
// (Nocturne "Metrix v1" design handoff): push to drill deeper, pop to go
// back, jumpTo for breadcrumb navigation, close to dismiss the panel.
//
// Pure client state over already-loaded seed data — pushing a module
// never triggers a fetch. The default (provider-less) context is a
// visible no-op with enabled: false so components can hide their
// deep-dive affordances instead of crashing in tests or isolated mounts.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DeepDiveModule } from "@/lib/data/deepDive";

interface DeepDiveCtx {
  /** False outside a provider — consumers hide their drill affordances. */
  enabled: boolean;
  /** Bottom → top; the last entry is the visible module. */
  stack: DeepDiveModule[];
  push: (m: DeepDiveModule) => void;
  /** Go back one module; closes the panel when only one remains. */
  pop: () => void;
  /** Breadcrumb jump: truncate the stack so `index` is the top module. */
  jumpTo: (index: number) => void;
  close: () => void;
}

const noop = () => {};

const DeepDiveContext = createContext<DeepDiveCtx>({
  enabled: false,
  stack: [],
  push: noop,
  pop: noop,
  jumpTo: noop,
  close: noop,
});

export function DeepDiveProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<DeepDiveModule[]>([]);

  const push = useCallback((m: DeepDiveModule) => {
    setStack((s) => {
      // Re-pushing the module already on top is a no-op (double-click guard).
      if (s.length > 0 && s[s.length - 1].id === m.id) return s;
      return [...s, m];
    });
  }, []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const jumpTo = useCallback((index: number) => setStack((s) => s.slice(0, index + 1)), []);
  const close = useCallback(() => setStack([]), []);

  const value = useMemo(
    () => ({ enabled: true, stack, push, pop, jumpTo, close }),
    [stack, push, pop, jumpTo, close],
  );
  return <DeepDiveContext.Provider value={value}>{children}</DeepDiveContext.Provider>;
}

export function useDeepDive() {
  return useContext(DeepDiveContext);
}
