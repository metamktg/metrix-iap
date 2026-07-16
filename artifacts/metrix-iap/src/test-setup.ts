// Shared vitest setup for the jsdom environment.
//
// jsdom does not implement ResizeObserver, which recharts'
// ResponsiveContainer requires at mount time. Stub it with a no-op so
// chart-bearing views can render in tests (charts simply stay at their
// initial size — tests assert on labels/rows, not chart pixels).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
