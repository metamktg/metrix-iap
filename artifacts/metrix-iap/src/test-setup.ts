// Shared vitest setup (jsdom gaps).
//
// jsdom has no ResizeObserver, but recharts' ResponsiveContainer (used by
// analysis views) requires one at mount — without this stub any test that
// renders a chart-bearing view crashes before its assertions run. The stub
// never fires callbacks, so charts simply measure 0×0 in tests.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
