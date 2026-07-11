// ─── Vitest setup file ────────────────────────────────────────────────────────
// Polyfills for browser APIs that are not available in jsdom/Vitest.

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as Record<string, unknown>).ResizeObserver = MockResizeObserver;
