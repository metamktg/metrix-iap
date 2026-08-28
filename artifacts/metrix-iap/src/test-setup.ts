// ─── jsdom polyfills ──────────────────────────────────────────────────────
//
// jsdom omits several browser APIs that UI component libraries depend on.
// Stubbing them here (loaded via vitest.config.ts `setupFiles`) keeps all
// chart-bearing and layout-aware views renderable in tests.
//
// Recharts rules:
//   ResponsiveContainer calls ResizeObserver to track container size.
//   Without it, any page that mounts a chart throws:
//     ReferenceError: ResizeObserver is not defined
//   Stubbing it with no-ops lets charts mount; tests assert labels/rows, not
//   chart pixel dimensions.
//
//   ResponsiveContainer also reads window.matchMedia for media queries.
//   jsdom has no matchMedia implementation; a minimal stub prevents the
//     TypeError: window.matchMedia is not a function
//   that would otherwise surface on chart-bearing views.
//
// Embla carousel rules:
//   useEmblaCarousel calls IntersectionObserver during mount to track which
//   slides are in view. jsdom has no IntersectionObserver implementation;
//   a no-op stub keeps any page that mounts a Carousel renderable in tests.

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// ─── Unmount between tests ────────────────────────────────────────────────
//
// @testing-library/react auto-registers `cleanup` in an afterEach — but ONLY
// when vitest runs with `globals: true`, because that is how it finds the
// hook. This config does not set globals, so the auto-registration never
// happened and NOTHING unmounted between test cases.
//
// The consequence is not a leak, it is unsound assertions. Every render in a
// file stacked into the same document, so:
//
//   · getByText could match a PREVIOUS test's output and pass for the wrong
//     reason.
//   · getAllBy* counted every render in the file. A four-row list asserted
//     at length 4 returned 22.
//   · queryBy*(...) === null — the way absence is asserted — could fail on
//     something an earlier case rendered, or pass only because of the order
//     the cases happen to run in.
//
// Found by writing a test that asserted a count and got the sum of every
// render before it. It had been true for the whole suite; the existing tests
// mostly assert presence with getBy*, which is the one shape that usually
// survives a dirty DOM, so nothing had failed loudly enough to notice.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
