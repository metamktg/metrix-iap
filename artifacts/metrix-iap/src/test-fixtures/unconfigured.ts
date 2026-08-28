// Synthesize an UNCONFIGURED account from the live fixture.
//
// WHY THIS EXISTS
// The account-state tests used to point at "skov_pet" because, at the time,
// that account happened to be unconfigured in the demo database. Then the
// fixture was refreshed from the live server and every account in it came
// back configured — and twenty-five tests failed at once, none of them
// because the behaviour they guard broke. They were asserting a DATABASE
// STATE ("skov_pet has no data") instead of a BEHAVIOUR ("an account with
// no data shows the setup state, never another account's numbers").
//
// The fixture is supposed to be refreshable — check:seed-fixture-drift
// exists to force refreshes — so no test may ever again depend on which
// accounts happen to be configured on the demo server that day. This helper
// takes the real seed and strips ONE account down to the canonical
// unconfigured shape the server itself produces for a just-created account
// (see buildAccountObject in metrixSeedAssembly.ts: honest pending shape,
// no iap, no ads, mst not_available).
//
// Everything else in the seed stays real, which is the point: the test
// renders real neighbouring accounts around the synthetic empty one, so
// "never leaks another account's data" is tested against actual data.

import type { MetrixSeed } from "@/lib/data/seedTypes";

export const UNCONFIGURED_ID = "__test_unconfigured__";

/**
 * Returns a copy of the seed in which one account (by default a synthetic
 * one appended to the roster) is unconfigured. Pass an existing account id
 * to strip that account instead — its name is kept so name-based
 * assertions still read naturally.
 */
export function withUnconfiguredAccount(
  seed: MetrixSeed,
  id: string = UNCONFIGURED_ID,
): MetrixSeed {
  const accounts = (seed.ad_accounts ?? []).map((a) => ({ ...a }));
  const existing = accounts.findIndex((a) => a.id === id);

  const shell = {
    id,
    name: existing >= 0 ? accounts[existing]!.name : "Test Unconfigured",
    status: "unconfigured",
    platform: "Meta Ads",
    objectives: [],
    overview_state: {
      title: "Analysis not run yet",
      description:
        "This ad account was created for manual report uploads. Upload exported Meta reports; performance and strategy data appears after the first analysis run processes them.",
      primary_action: "Upload Reports",
      secondary_action: "Connect Meta",
    },
    iap: null,
    mst: { status: "not_available" },
    ads: [],
    creative_deconstructions: [],
  } as unknown as MetrixSeed["ad_accounts"][number];

  if (existing >= 0) accounts[existing] = shell;
  else accounts.push(shell);

  return { ...seed, ad_accounts: accounts };
}
