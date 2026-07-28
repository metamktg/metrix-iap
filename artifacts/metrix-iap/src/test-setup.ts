// Vitest environment shims (jsdom lacks some browser APIs the app uses).

// recharts' ResponsiveContainer observes its parent element via
// ResizeObserver, which jsdom does not implement. A no-op stub lets chart
// wrappers mount; sizing behavior itself is not under test in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
