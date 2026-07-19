// Seed-fixture drift check.
//
// Compares the structural shape of the checked-in test fixture
// (artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json) against
// the live response from GET /api/metrix/seed. Fails loudly if the key
// structure at any nesting level has drifted so structural tests cannot
// silently pass against a stale snapshot.
//
// Modes:
//   pnpm --filter @workspace/scripts run check:seed-fixture-drift
//     → fetches live seed, compares shape, exits 1 if drift found
//   pnpm --filter @workspace/scripts run refresh:seed-fixture
//     → fetches live seed, overwrites the fixture file, exits 0
//
// Requirements:
//   - API server running and reachable at API_BASE_URL (default: http://localhost:80/api)
//   - DEMO_ACCOUNT_EMAIL and DEMO_ACCOUNT_PASSWORD set (used to authenticate)
//     These match the demo safeguard in demoAccountSafeguard.ts; both are
//     required — the script exits 0 (SKIP) with instructions if either
//     precondition is not met, so the validation step does not fail for
//     environment reasons unrelated to actual fixture drift.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REFRESH_MODE = process.argv.includes("--refresh");
const BASE =
  (process.env["API_BASE_URL"] ?? "http://localhost:80/api").replace(/\/$/, "");

const DEMO_EMAIL = process.env["DEMO_ACCOUNT_EMAIL"] ?? "demo@metrix.app";
const DEMO_PASSWORD = process.env["DEMO_ACCOUNT_PASSWORD"];

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FIXTURE_PATH = path.join(
  repoRoot,
  "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json",
);

function fail(message: string, extra?: string): never {
  console.error(`\nFAIL  ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

// ─── Structural shape comparison ─────────────────────────────────────────────
//
// We compare key sets at every level of nesting rather than full JSON equality
// so data changes (dates, ad spend values, etc.) never trigger false positives.
// Only schema-level changes — new keys, removed keys, renamed keys, or a value
// type changing from object/array to scalar — are flagged as drift.

type Shape = { [key: string]: Shape } | "scalar" | Shape[];

// JSON payloads are acyclic so there is no infinite-recursion risk; no depth
// cap is applied — every nesting level is compared so deep key changes are
// never silently missed.
function shapeOf(value: unknown): Shape {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    // Use the first element as a representative shape for arrays.
    return [shapeOf(value[0])];
  }
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: Shape } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shapeOf(v);
    }
    return out;
  }
  return "scalar";
}

type DriftPath = string;

function diffShapes(
  live: Shape,
  fixture: Shape,
  path: string,
  drifts: DriftPath[],
): void {
  const liveIsArr = Array.isArray(live);
  const fixIsArr = Array.isArray(fixture);
  const liveIsObj =
    !liveIsArr && typeof live === "object" && live !== null;
  const fixIsObj =
    !fixIsArr && typeof fixture === "object" && fixture !== null;

  // Type-category mismatch (object vs array vs scalar).
  if (liveIsArr !== fixIsArr || liveIsObj !== fixIsObj) {
    drifts.push(
      `${path}: type mismatch (live=${typeLabel(live)}, fixture=${typeLabel(fixture)})`,
    );
    return;
  }

  if (liveIsArr && fixIsArr) {
    const liveArr = live as Shape[];
    const fixArr = fixture as Shape[];
    if (liveArr.length > 0 && fixArr.length > 0) {
      diffShapes(liveArr[0]!, fixArr[0]!, `${path}[]`, drifts);
    }
    return;
  }

  if (liveIsObj && fixIsObj) {
    const liveObj = live as { [key: string]: Shape };
    const fixObj = fixture as { [key: string]: Shape };
    const liveKeys = new Set(Object.keys(liveObj));
    const fixKeys = new Set(Object.keys(fixObj));

    for (const k of liveKeys) {
      if (!fixKeys.has(k)) {
        drifts.push(`${path}.${k}: key present in live API but missing from fixture`);
      }
    }
    for (const k of fixKeys) {
      if (!liveKeys.has(k)) {
        drifts.push(`${path}.${k}: key present in fixture but missing from live API`);
      }
    }

    // Recurse into keys present in both.
    for (const k of liveKeys) {
      if (fixKeys.has(k)) {
        diffShapes(liveObj[k]!, fixObj[k]!, `${path}.${k}`, drifts);
      }
    }
    return;
  }
  // Both scalar — no drift to report.
}

function typeLabel(shape: Shape): string {
  if (Array.isArray(shape)) return "array";
  if (shape === "scalar") return "scalar";
  return "object";
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function post(
  urlPath: string,
  body: unknown,
  cookie?: string,
): Promise<{ status: number; body: unknown; setCookie?: string }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers["cookie"] = cookie;
  const res = await fetch(`${BASE}${urlPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie") ?? undefined;
  let resBody: unknown = null;
  try {
    resBody = await res.json();
  } catch {
    resBody = await res.text().catch(() => null);
  }
  return { status: res.status, body: resBody, setCookie };
}

async function get(
  urlPath: string,
  cookie: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${urlPath}`, {
    headers: { cookie },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, body };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function skip(message: string, hint?: string): never {
  console.log(`\nSKIP  ${message}`);
  if (hint) console.log(hint);
  process.exit(0);
}

async function main() {
  // Missing demo credentials: skip (not a code/drift problem).
  if (!DEMO_PASSWORD) {
    if (REFRESH_MODE) {
      // In refresh mode a missing password is a hard failure — the caller
      // explicitly asked us to write the file.
      fail(
        "DEMO_ACCOUNT_PASSWORD is not set.",
        "Set DEMO_ACCOUNT_PASSWORD (and optionally DEMO_ACCOUNT_EMAIL, default: demo@metrix.app)\n" +
          "then re-run:  pnpm --filter @workspace/scripts run refresh:seed-fixture",
      );
    }
    skip(
      "DEMO_ACCOUNT_PASSWORD is not set — skipping drift check.",
      "This check requires the demo account credentials to fetch the live seed.\n" +
        "Set DEMO_ACCOUNT_PASSWORD and ensure the API Server workflow is running, then re-run:\n" +
        "  pnpm --filter @workspace/scripts run check:seed-fixture-drift",
    );
  }

  console.log(
    `${REFRESH_MODE ? "Refreshing" : "Checking"} seed fixture against ${BASE}\n`,
  );

  // 1. Verify the API server is reachable.
  let health: unknown = null;
  try {
    health = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(5_000) })
      .then((r) => r.json())
      .catch(() => null);
  } catch {
    health = null;
  }
  const serverOk =
    health !== null &&
    typeof health === "object" &&
    (health as { status?: unknown }).status === "ok";

  if (!serverOk) {
    if (REFRESH_MODE) {
      fail(
        `API server not reachable at ${BASE}/healthz. Is the API Server workflow running?`,
      );
    }
    skip(
      `API server not reachable at ${BASE}/healthz — skipping drift check.`,
      "Start the API Server workflow, then re-run:\n" +
        "  pnpm --filter @workspace/scripts run check:seed-fixture-drift",
    );
  }

  // 2. Log in with the demo account to get a session cookie.
  console.log(`Authenticating as ${DEMO_EMAIL}...`);
  const login = await post("/metrix/auth/login", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (login.status !== 200) {
    fail(
      `Login failed (HTTP ${login.status}).`,
      `Check that DEMO_ACCOUNT_PASSWORD matches the running API server's demo account.\n` +
        `Response: ${JSON.stringify(login.body)}`,
    );
  }
  const rawCookie = login.setCookie;
  if (!rawCookie) {
    fail("Login returned 200 but no Set-Cookie header — cannot obtain session.");
  }
  // Extract just the cookie name=value pair (strip attributes like Path, HttpOnly …).
  const sessionCookie = rawCookie.split(";")[0]!;

  // 3. Fetch the live seed bundle.
  console.log("Fetching live seed bundle...");
  const seedRes = await get("/metrix/seed", sessionCookie);
  if (seedRes.status !== 200) {
    fail(
      `GET /metrix/seed returned HTTP ${seedRes.status}.`,
      `Response: ${JSON.stringify(seedRes.body)}`,
    );
  }
  const liveSeed = seedRes.body;

  // ── Refresh mode: overwrite the fixture and exit. ────────────────────────
  if (REFRESH_MODE) {
    const json = JSON.stringify(liveSeed, null, 2) + "\n";
    fs.writeFileSync(FIXTURE_PATH, json, "utf-8");
    console.log(
      `\nPASS  Fixture refreshed → ${path.relative(repoRoot, FIXTURE_PATH)}  (${Math.round(json.length / 1024)} KB)`,
    );
    process.exit(0);
  }

  // ── Drift-check mode: compare structural shapes. ─────────────────────────
  if (!fs.existsSync(FIXTURE_PATH)) {
    fail(
      `Fixture file not found: ${FIXTURE_PATH}`,
      "Run: pnpm --filter @workspace/scripts run refresh:seed-fixture",
    );
  }
  const fixtureRaw = fs.readFileSync(FIXTURE_PATH, "utf-8");
  let fixtureSeed: unknown;
  try {
    fixtureSeed = JSON.parse(fixtureRaw);
  } catch (err) {
    fail(`Could not parse fixture JSON: ${(err as Error).message}`);
  }

  console.log("Comparing structural shapes...");
  const liveShape = shapeOf(liveSeed);
  const fixtureShape = shapeOf(fixtureSeed);

  const drifts: string[] = [];
  diffShapes(liveShape, fixtureShape, "<root>", drifts);

  if (drifts.length === 0) {
    console.log(
      "\nPASS  Seed fixture shape matches the live API — no structural drift detected.",
    );
    process.exit(0);
  }

  console.error(`\nFAIL  Seed fixture has drifted from the live API (${drifts.length} difference${drifts.length === 1 ? "" : "s"}):`);
  for (const d of drifts) {
    console.error(`  • ${d}`);
  }
  console.error(
    "\nTo refresh the fixture from the live API, run:\n" +
      "  pnpm --filter @workspace/scripts run refresh:seed-fixture",
  );
  process.exit(1);
}

main().catch((err) => {
  fail("Seed-fixture drift check crashed", String((err as Error).stack ?? err));
});
