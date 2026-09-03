// Regression tests for the nested-button fix: ConceptChip must render as a
// non-button interactive span so cards (real <button> elements) can embed
// tokenized concept text without producing invalid <button><button> HTML.
// Verifies click/keyboard isolation: chip activation navigates to the
// Library and never triggers the surrounding card's click handler.
// Also covers case-insensitive tokenization: lowercase codes like c2b / c4A
// from Meta ad exports must resolve to the same registry chip as C2B / C4A.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { tokenizeConceptCodes } from "@/lib/tokenizeConceptCodes";
import type { ConceptDescriptorEntry } from "@/lib/concept-registry-context";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => ({
    concept_registry: {
      C2B: {
        code: "C2B",
        descriptor: "Social Proof",
        book: null,
        what: "Testimonial-led concept",
        why: null,
        source_cells: ["C2B"],
      },
    },
  }),
  useMetrixIsRefetching: () => false,
}));

import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { ConceptRegistryProvider } from "@/lib/concept-registry-context";
import { ConceptChip, TokenizedConceptText } from "@/components/concept/ConceptChip";

function renderCardWithChip(onCardClick: () => void) {
  const location = memoryLocation({ path: "/app/listen/signal", record: true });
  const utils = render(
    <WouterRouter hook={location.hook}>
      <ConceptRegistryProvider>
        <TooltipProvider>
          <button type="button" onClick={onCardClick} data-testid="card">
            <TokenizedConceptText text="Winning angle C2B outperforms baseline" />
          </button>
        </TooltipProvider>
      </ConceptRegistryProvider>
    </WouterRouter>
  );
  return { ...utils, location };
}

describe("ConceptChip inside a clickable card", () => {
  beforeEach(() => cleanup());

  it("renders as a non-button element. No nested buttons in the DOM", () => {
    const { container, getByLabelText } = renderCardWithChip(() => {});
    expect(container.querySelectorAll("button button").length).toBe(0);
    const chip = getByLabelText(/^Concept C2B/);
    expect(chip.tagName).toBe("SPAN");
    expect(chip.getAttribute("role")).toBe("button");
    expect(chip.getAttribute("tabindex")).toBe("0");
  });

  it("chip click navigates to the Library and does NOT trigger the card", () => {
    const onCardClick = vi.fn();
    const { getByLabelText, location } = renderCardWithChip(onCardClick);
    fireEvent.click(getByLabelText(/^Concept C2B/));
    expect(onCardClick).not.toHaveBeenCalled();
    expect(location.history.at(-1)).toContain("/app/analysis/library?focus=C2B");
  });

  it("card click still fires when clicking outside the chip", () => {
    const onCardClick = vi.fn();
    const { getByTestId, location } = renderCardWithChip(onCardClick);
    fireEvent.click(getByTestId("card"));
    expect(onCardClick).toHaveBeenCalledTimes(1);
    expect(location.history.at(-1)).toBe("/app/listen/signal");
  });

  it("Enter and Space on a focused chip activate it without hitting the card", () => {
    for (const key of ["Enter", " "]) {
      cleanup();
      const onCardClick = vi.fn();
      const { getByLabelText, location } = renderCardWithChip(onCardClick);
      fireEvent.keyDown(getByLabelText(/^Concept C2B/), { key });
      expect(onCardClick).not.toHaveBeenCalled();
      expect(location.history.at(-1)).toContain("/app/analysis/library?focus=C2B");
    }
  });

  it("standalone ConceptChip (direct usage) is also a span role=button", () => {
    const location = memoryLocation({ path: "/", record: true });
    const { getByLabelText } = render(
      <WouterRouter hook={location.hook}>
        <ConceptRegistryProvider>
          <TooltipProvider>
            <ConceptChip code="C2B" />
          </TooltipProvider>
        </ConceptRegistryProvider>
      </WouterRouter>
    );
    const chip = getByLabelText(/^Concept C2B/);
    expect(chip.tagName).toBe("SPAN");
  });
});

describe("tokenizeConceptCodes · case-insensitive cell code matching", () => {
  const registry: Record<string, ConceptDescriptorEntry> = {
    C2B: { code: "C2B", descriptor: "Social Proof", book: null, what: "Testimonial", why: null, source_cells: ["C2B"] },
    C4A: { code: "C4A", descriptor: "Demo", book: null, what: "Product demo", why: null, source_cells: ["C4A"] },
  };

  it("lowercase c2b tokenizes to the same chip as C2B", () => {
    const lower = tokenizeConceptCodes("angle c2b wins", registry);
    const upper = tokenizeConceptCodes("angle C2B wins", registry);
    expect(lower).toEqual(upper);
    expect(lower.find((t) => t.type === "chip")).toMatchObject({ type: "chip", code: "C2B" });
  });

  it("mixed-case c4A tokenizes to the same chip as C4A", () => {
    const mixed = tokenizeConceptCodes("c4A outperforms", registry);
    const upper = tokenizeConceptCodes("C4A outperforms", registry);
    expect(mixed).toEqual(upper);
    expect(mixed.find((t) => t.type === "chip")).toMatchObject({ type: "chip", code: "C4A" });
  });

  it("unknown codes (even lowercased) remain as plain text", () => {
    const tokens = tokenizeConceptCodes("c9z unknown", registry);
    expect(tokens.every((t) => t.type === "text")).toBe(true);
  });
});
