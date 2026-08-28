// resultTerm derives each account's result noun from its own data —
// no hardcoded client terminology. Runs against the captured seed
// fixture so every imported account shape is covered.
import { describe, it, expect } from "vitest";
import { resultTerm } from "../shared";
import { seed } from "../../../navigation/__tests__/seed";
import type { AdAccount } from "@/lib/data/seedTypes";
import { withUnconfiguredAccount } from "@/test-fixtures/unconfigured";

const account = (id: string): AdAccount => {
  const acct = (seed.ad_accounts as AdAccount[]).find((a) => a.id === id);
  if (!acct) throw new Error(`fixture missing account ${id}`);
  return acct;
};

describe("resultTerm", () => {
  it("derives 'registration' for Bookster from its cell result types (not the install-heavy totals)", () => {
    expect(resultTerm(account("bookster"))).toEqual({
      singular: "registration",
      plural: "registrations",
      Singular: "Registration",
      Plural: "Registrations",
    });
  });

  it("derives 'purchase' for East Coast Art Studio (ecas)", () => {
    expect(resultTerm(account("ecas"))).toEqual({
      singular: "purchase",
      plural: "purchases",
      Singular: "Purchase",
      Plural: "Purchases",
    });
  });

  it("falls back to the neutral 'result' for accounts without analysis data", () => {
    // Synthesized: the fixture no longer guarantees any account lacks
    // analysis data, and this test is about the fallback, not skov_pet.
    const stripped = withUnconfiguredAccount(seed, "skov_pet");
    const a = stripped.ad_accounts.find((x) => x.id === "skov_pet") as AdAccount;
    expect(resultTerm(a).plural).toBe("results");
  });

  it("falls back to the neutral 'result' for null/unconfigured accounts", () => {
    expect(resultTerm(null).singular).toBe("result");
    expect(resultTerm(undefined).Plural).toBe("Results");
  });
});
