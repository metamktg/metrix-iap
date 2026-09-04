// Regression tests for MetrixBootLoader callout rotation and reduced-motion freeze.
// The callout order is shuffled per mount, so tests assert membership in the
// CALLOUTS list and change-over-time rather than a fixed sequence.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import {
  MetrixBootLoader,
  CALLOUTS,
} from "@/components/brand/MetrixBootLoader";

// Mirror the timing constants from the component so the test is tied to real
// values. If the component's constants change, the tests will surface it.
const READ_MS = 3800;
const FADE_MS = 420;

/** Returns the currently rendered callout text. */
function getCalloutText(container: HTMLElement): string {
  const el = container.querySelector(".mx-boot-callout");
  return el?.textContent ?? "";
}

/** Snapshot the current matchMedia so tests can restore it after overriding. */
function makeMatchMediaStub(reducedMotion: boolean) {
  return (query: string): MediaQueryList => ({
    matches:
      reducedMotion && query === "(prefers-reduced-motion: reduce)"
        ? true
        : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

describe("MetrixBootLoader · ARIA attributes", () => {
  afterEach(cleanup);

  it("renders a role=status element with aria-busy=true and the loading label", () => {
    render(<MetrixBootLoader />);
    const loader = screen.getByRole("status");
    expect(loader.getAttribute("aria-busy")).toBe("true");
    expect(loader.getAttribute("aria-label")).toBe("Loading Metrix data");
  });
});

describe("MetrixBootLoader · progress bar", () => {
  afterEach(cleanup);

  it("mounts the .mx-boot-fill progress bar element inside the loader", () => {
    const { container } = render(<MetrixBootLoader />);
    const fill = container.querySelector(".mx-boot-fill");
    expect(fill).not.toBeNull();
  });
});

describe("MetrixBootLoader · callout rotation (normal motion)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("shows one of the known callouts on initial render", () => {
    const { container } = render(<MetrixBootLoader />);
    expect(CALLOUTS).toContain(getCalloutText(container));
  });

  it("advances to a different known callout after the rotation interval elapses", () => {
    const { container } = render(<MetrixBootLoader />);
    const first = getCalloutText(container);

    // The interval fires after READ_MS + FADE_MS ms; then the swap setTimeout
    // fires after a further FADE_MS ms — advance past both.
    act(() => {
      vi.advanceTimersByTime(READ_MS + FADE_MS + FADE_MS);
    });

    const second = getCalloutText(container);
    expect(CALLOUTS).toContain(second);
    expect(second).not.toBe(first);
  });

  it("shows every callout exactly once before any repeats (shuffled full cycle)", () => {
    const { container } = render(<MetrixBootLoader />);
    const seen: string[] = [getCalloutText(container)];

    for (let i = 1; i < CALLOUTS.length; i++) {
      act(() => {
        vi.advanceTimersByTime(READ_MS + FADE_MS + FADE_MS);
      });
      seen.push(getCalloutText(container));
    }

    // All distinct, and together they cover the full callout list.
    expect(new Set(seen).size).toBe(CALLOUTS.length);
    expect([...seen].sort()).toEqual([...CALLOUTS].sort());
  });
});

describe("MetrixBootLoader · callout rotation (reduced motion)", () => {
  // Capture the original matchMedia stub set up by test-setup.ts so we can
  // restore it after each test in this group.
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    // Override to report prefers-reduced-motion: reduce
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: makeMatchMediaStub(true),
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("shows a known callout on initial render even with reduced motion", () => {
    const { container } = render(<MetrixBootLoader />);
    expect(CALLOUTS).toContain(getCalloutText(container));
  });

  it("does NOT advance the callout when prefers-reduced-motion: reduce is active", () => {
    const { container } = render(<MetrixBootLoader />);
    const first = getCalloutText(container);

    // Advance well past multiple rotation intervals — text must stay frozen
    act(() => {
      vi.advanceTimersByTime((READ_MS + FADE_MS) * 3);
    });

    expect(getCalloutText(container)).toBe(first);
  });
});
