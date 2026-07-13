// ─── Concept Registry Context ─────────────────────────────────────────
// Holds the global concept_registry map from the seed bundle and exposes:
//  - useConceptDescriptor(code)  — look up a descriptor entry
//  - useConceptRegistry()        — access full registry + highlightConcept
//  - useConceptHighlight(fn)     — subscribe to hover highlight signals
//  - emitHighlightConcept(code)  — fire a highlight signal (from ConceptChip)

import React, {
  createContext, useContext, useEffect, useRef, useCallback,
} from "react";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";

export interface ConceptDescriptorEntry {
  code: string;
  descriptor: string;
  book: string | null;
  what: string | null;
  why: string | null;
  source_cells: string[];
}

interface ConceptRegistryContextValue {
  registry: Record<string, ConceptDescriptorEntry>;
  getDescriptor: (code: string) => ConceptDescriptorEntry | undefined;
  highlightConcept: (code: string) => void;
}

const ConceptRegistryContext = createContext<ConceptRegistryContextValue>({
  registry: {},
  getDescriptor: () => undefined,
  highlightConcept: () => {},
});

// ── Module-level event bus (avoids threading listeners through context) ──
type HighlightListener = (code: string) => void;
const highlightListeners = new Set<HighlightListener>();

function emitHighlight(code: string) {
  highlightListeners.forEach((fn) => fn(code));
}

/** Subscribe to concept highlight events (from ConceptChip hover). */
export function useConceptHighlight(listener: HighlightListener) {
  const stableListener = useRef(listener);
  stableListener.current = listener;
  useEffect(() => {
    const wrapped: HighlightListener = (code) => stableListener.current(code);
    highlightListeners.add(wrapped);
    return () => { highlightListeners.delete(wrapped); };
  }, []);
}

// ── Provider ──────────────────────────────────────────────────────────

export function ConceptRegistryProvider({ children }: { children: React.ReactNode }) {
  const seed = useMetrixSeed();

  const registry = (seed as any)["concept_registry"] as
    Record<string, ConceptDescriptorEntry> | undefined ?? {};

  const getDescriptor = useCallback(
    (code: string) => registry[code],
    [registry],
  );

  const highlightConcept = useCallback((code: string) => {
    emitHighlight(code);
  }, []);

  const value: ConceptRegistryContextValue = {
    registry,
    getDescriptor,
    highlightConcept,
  };

  return (
    <ConceptRegistryContext.Provider value={value}>
      {children}
    </ConceptRegistryContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────

export function useConceptRegistry() {
  return useContext(ConceptRegistryContext);
}

export function useConceptDescriptor(code: string): ConceptDescriptorEntry | undefined {
  const { getDescriptor } = useConceptRegistry();
  return getDescriptor(code);
}
