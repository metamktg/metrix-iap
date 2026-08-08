// Regression tests for MetrixBootLoader callout rotation and reduced-motion freeze.
// Verifies:
//   - initial ARIA attributes (role=status, aria-busy, aria-label)
//   - first callout is shown on render
//   - callout text advances after the rotation interval elapses (fake timers)
//   - prefers-reduced-motion: reduce freezes the callout on the first line
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { MetrixBootLoader } from "@/components/brand/MetrixBootLoader";

// Mirror the constants from the component so the test is tied to real values.
// If the component's constants change, the tests will surface it.
const FIRST_CALLOUT = "the concept code carries the creative identity.";
const SECOND_CALLOUT = "andromeda rewards diversity, punishes repetition.";
const READ_MS = 3800;
const FADE_MS = 380;

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

describe("MetrixBootLoader — ARIA attributes", () => {
  afterEach(cleanup);

  it("renders a role=status element with aria-busy=true and the loading label", () => {
    render(<MetrixBootLoader />);
    const loader = screen.getByRole("status");
    expect(loader.getAttribute("aria-busy")).toBe("true");
    expect(loader.getAttribute("aria-label")).toBe("Loading Metrix data");
  });
});

describe("MetrixBootLoader — callout rotation (normal motion)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("shows the first callout on initial render", () => {
    render(<MetrixBootLoader />);
    expect(screen.getByText(FIRST_CALLOUT)).toBeTruthy();
  });

  it("advances to the second callout after the rotation interval elapses", () => {
    render(<MetrixBootLoader />);

    // The interval fires after READ_MS + FADE_MS ms; then the swap setTimeout
    // fires after a further FADE_MS ms — advance past both.
    act(() => {
      vi.advanceTimersByTime(READ_MS + FADE_MS + FADE_MS);
    });

    expect(screen.getByText(SECOND_CALLOUT)).toBeTruthy();
    // First callout should no longer be present in the DOM
    expect(screen.queryByText(FIRST_CALLOUT)).toBeNull();
  });
});

describe("MetrixBootLoader — callout rotation (reduced motion)", () => {
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

  it("shows the first callout on initial render even with reduced motion", () => {
    render(<MetrixBootLoader />);
    expect(screen.getByText(FIRST_CALLOUT)).toBeTruthy();
  });

  it("does NOT advance the callout when prefers-reduced-motion: reduce is active", () => {
    render(<MetrixBootLoader />);

    // Advance well past multiple rotation intervals — text must stay frozen
    act(() => {
      vi.advanceTimersByTime((READ_MS + FADE_MS) * 3);
    });

    expect(screen.getByText(FIRST_CALLOUT)).toBeTruthy();
    expect(screen.queryByText(SECOND_CALLOUT)).toBeNull();
  });
});
