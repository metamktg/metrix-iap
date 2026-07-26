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
