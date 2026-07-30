import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    // Supabase cold-starts and DB round-trips can take 30–90 s in the
    // validation environment. Set generous global defaults so individual
    // tests don't need to replicate the timeout on every hook/assertion.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
