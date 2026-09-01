// ─── Offline seed-fixture shape guard ─────────────────────────────────
//
// `check:seed-fixture-drift` compares the checked-in fixture against a LIVE
// seed, which needs a running API server and DEMO_ACCOUNT_PASSWORD. When
// either is missing it prints SKIP and exits 0 — so it reports green while
// checking nothing, and GitHub Actions excludes it outright. The fixture
// drifted for eleven days behind that green: `cardShape` grew eleven fields
// per signal card and the fixture carried none of them, while 50 test files
// went on building their world from it.
//
// This guard closes the same gap with no server and no secret, so it runs
// everywhere the api-server suite runs. It cannot check VALUES — only a live
// seed can — but it catches the failure that actually happened: the server
// emitting a key the fixture has never heard of.
//
// Ratcheting, like check:disclosure-rulebook. Keys already missing are
// recorded below with the reason, so this lands without breaking the build;
// any NEW missing key fails immediately. The list may only shrink — delete
// entries as `refresh:seed-fixture` fills them in.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { cardShape } from "../metrixSeedAssembly";

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../metrix-iap/src/test-fixtures/metrix_seed_bundle.json",
);

/**
 * Keys the server emits that the checked-in fixture does not yet carry.
 *
 * The ratchet: a file may only ever remove entries. A new server field can
 * land here to avoid breaking the build, but the second test below fails the
 * moment the fixture catches up, so a stale entry cannot sit unnoticed.
 */
const KNOWN_MISSING_CARD_KEYS: ReadonlySet<string> = new Set([
  // Empty, and it should stay that way. The E1/E3 keys that were listed here
  // were added to the pinned fixture by scripts/src/patch-seed-fixture-shape.ts,
  // which runs the real cardShape over the cards already in it — additive
  // only, no existing value touched. Add an entry here ONLY to land a
  // genuinely new server field without breaking the build, and remove it in
  // the same week.
]);

interface SeedBundle {
  ad_accounts?: Array<{
    id?: string;
    listen?: { signal_cards?: Array<Record<string, unknown>> };
  }>;
}

function readFixture(): SeedBundle {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as SeedBundle;
}

/** The first signal card the fixture carries, whichever account holds it. */
function firstFixtureCard(): Record<string, unknown> | null {
  for (const account of readFixture().ad_accounts ?? []) {
    const cards = account.listen?.signal_cards ?? [];
    if (cards.length > 0) return cards[0]!;
  }
  return null;
}

/** A synthetic DB row carrying every column cardShape reads. */
const SYNTHETIC_ROW = {
  card_id: "SC_TEST",
  account_id: "acct_test",
  scope: "account",
  title: "A title",
  rationale: "Some prose that stays prose.",
  impact: "high",
  confidence: "medium",
  source_path: "path/to/evidence",
  recommended_action: "Do the thing",
  headline: null,
  metric_value: null,
  metric_context: null,
  delta_pct: null,
  implication: null,
};

describe("seed fixture shape (offline guard)", () => {
  it("the fixture still contains signal cards to compare against", () => {
    expect(firstFixtureCard()).not.toBeNull();
  });

  it("emits no signal-card key the fixture lacks, beyond the recorded ones", () => {
    const card = firstFixtureCard();
    expect(card).not.toBeNull();

    const served = Object.keys(cardShape(SYNTHETIC_ROW));
    const fixtureKeys = new Set(Object.keys(card!));

    const missing = served.filter((k) => !fixtureKeys.has(k));
    const unexpected = missing.filter((k) => !KNOWN_MISSING_CARD_KEYS.has(k));

    expect(
      unexpected,
      `The server now emits signal-card key(s) the fixture has never seen: ` +
        `${unexpected.join(", ")}.\n` +
        `50 test files build their world from that fixture, so nothing client-side ` +
        `can exercise these fields until it is refreshed. With the API Server ` +
        `workflow running:\n` +
        `  pnpm --filter @workspace/scripts run refresh:seed-fixture\n` +
        `then delete the newly-filled keys from KNOWN_MISSING_CARD_KEYS.`,
    ).toEqual([]);
  });

  it("the recorded gap only shrinks — drop keys the fixture has caught up on", () => {
    const card = firstFixtureCard();
    expect(card).not.toBeNull();
    const fixtureKeys = new Set(Object.keys(card!));

    const staleEntries = [...KNOWN_MISSING_CARD_KEYS].filter((k) =>
      fixtureKeys.has(k),
    );

    expect(
      staleEntries,
      `The fixture now carries key(s) still listed as missing: ` +
        `${staleEntries.join(", ")}. Remove them from KNOWN_MISSING_CARD_KEYS ` +
        `so the guard keeps ratcheting down instead of drifting back up.`,
    ).toEqual([]);
  });

  it("records the full extent of the current gap, so it cannot be forgotten", () => {
    const card = firstFixtureCard();
    const served = Object.keys(cardShape(SYNTHETIC_ROW));
    const fixtureKeys = new Set(Object.keys(card!));
    const missing = served.filter((k) => !fixtureKeys.has(k));

    // Pinned deliberately: if this number moves, either the contract grew or
    // the fixture was refreshed, and both deserve a look at this file.
    expect(missing.length).toBe(KNOWN_MISSING_CARD_KEYS.size);
  });
});
