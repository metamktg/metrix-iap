// ─── The payload should announce its own growth ───────────────────────
//
// The seed is O(every account) on both sides: assembled for all of them on
// each cache miss, downloaded and parsed in full by every client. That is
// fine at 11 accounts and steadily less fine after. This platform has
// already hit the same ceiling once — BUG-25, where the seed dragged every
// creative file's bytes and production hung on the splash screen — and it
// was found by a user watching a spinner, because nothing watched the
// payload.

import { describe, it, expect, vi, beforeEach } from "vitest";

const warn = vi.fn();
const error = vi.fn();
vi.mock("../logger", () => ({ logger: { warn: (...a: unknown[]) => warn(...a), error: (...a: unknown[]) => error(...a) } }));

import { checkSeedBudget, SEED_WARN_BYTES, SEED_CRITICAL_BYTES } from "../seedBudget";

/** A seed of roughly `bytes` total, split across `accounts`. */
function makeSeed(bytes: number, accounts = 3): Record<string, unknown> {
  const per = Math.ceil(bytes / accounts);
  return {
    ad_accounts: Array.from({ length: accounts }, (_, i) => ({
      id: `acct_${i}`,
      // Later accounts are heavier, so "heaviest" ordering is checkable.
      iap: { blob: "x".repeat(per + i * 1000) },
    })),
  };
}

beforeEach(() => {
  warn.mockReset();
  error.mockReset();
});

describe("checkSeedBudget", () => {
  it("stays silent for an ordinary payload", () => {
    const bytes = checkSeedBudget(makeSeed(200_000));
    expect(bytes).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("warns once the payload passes its budget", () => {
    checkSeedBudget(makeSeed(SEED_WARN_BYTES + 500_000));
    expect(warn).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  });

  it("escalates when the payload is large enough to hurt first paint", () => {
    checkSeedBudget(makeSeed(SEED_CRITICAL_BYTES + 1_000_000));
    expect(error).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it("names the accounts driving the size, since 'the seed is big' is not actionable", () => {
    checkSeedBudget(makeSeed(SEED_WARN_BYTES + 500_000, 6));
    const [detail] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(detail["accountCount"]).toBe(6);
    const heaviest = detail["heaviest"] as Array<{ id: string; size: string }>;
    // Top five, heaviest first — the last account is the biggest here.
    expect(heaviest).toHaveLength(5);
    expect(heaviest[0]!.id).toBe("acct_5");
    expect(heaviest[0]!.size).toMatch(/MB$/);
  });

  it("never lets observability break the request it observes", () => {
    // A cyclic structure cannot be stringified; the check must swallow it
    // rather than failing the seed build it is only watching.
    const cyclic: Record<string, unknown> = { ad_accounts: [] };
    cyclic["self"] = cyclic;
    expect(() => checkSeedBudget(cyclic)).not.toThrow();
    expect(checkSeedBudget(cyclic)).toBe(0);
  });

  it("tolerates a seed with no accounts at all", () => {
    expect(() => checkSeedBudget({})).not.toThrow();
  });
});
