// Scripted API check for Metrix settings persistence endpoints.
// Run with the API server up: pnpm --filter @workspace/scripts run check:metrix-settings-api
//
// Covers:
//   1. Create invite → status "created"
//   2. Duplicate invite → status "already_invited" (no second row)
//   3. Invalid role → 400
//   4. Notification pref upsert → second PUT overwrites the first (no duplicate rows)
//   5. Empty PUT body (no JSON) → 400; empty JSON object → 200 no-op

const BASE = process.env.API_BASE_URL ?? "http://localhost:80/api";
const WORKSPACE = "api-check-workspace";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  opts: { rawEmpty?: boolean } = {},
): Promise<{ status: number; json: any }> {
  const init: RequestInit = { method };
  if (!opts.rawEmpty && body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`Checking Metrix settings endpoints at ${BASE}\n`);

  // Ensure server is reachable first.
  const health = await request("GET", "/healthz");
  if (health.status !== 200) {
    console.error(`API server not reachable (GET /healthz → ${health.status}). Is the workflow running?`);
    process.exit(1);
  }

  // ── Invites ──────────────────────────────────────────────────────────
  console.log("Invites:");
  const email = `check-${Date.now()}@example.com`;

  const created = await request("POST", `/metrix/workspaces/${WORKSPACE}/invites`, {
    email,
    role: "analyst",
  });
  check(
    "create invite returns created",
    created.status === 200 && created.json?.status === "created" && created.json?.invite?.email === email,
    `status=${created.status} body=${JSON.stringify(created.json)}`,
  );

  const duplicate = await request("POST", `/metrix/workspaces/${WORKSPACE}/invites`, {
    email: email.toUpperCase(),
    role: "client_viewer",
  });
  check(
    "duplicate invite returns already_invited",
    duplicate.status === 200 && duplicate.json?.status === "already_invited" && duplicate.json?.invite?.role === "analyst",
    `status=${duplicate.status} body=${JSON.stringify(duplicate.json)}`,
  );

  const list = await request("GET", `/metrix/workspaces/${WORKSPACE}/invites`);
  const matching = (list.json?.invites ?? []).filter((i: any) => i.email === email);
  check(
    "duplicate invite did not create a second row",
    list.status === 200 && matching.length === 1,
    `rows=${matching.length}`,
  );

  const badRole = await request("POST", `/metrix/workspaces/${WORKSPACE}/invites`, {
    email: `other-${Date.now()}@example.com`,
    role: "owner",
  });
  check("invalid role rejected with 400", badRole.status === 400, `status=${badRole.status}`);

  const badEmail = await request("POST", `/metrix/workspaces/${WORKSPACE}/invites`, {
    email: "not-an-email",
    role: "analyst",
  });
  check("invalid email rejected with 400", badEmail.status === 400, `status=${badEmail.status}`);

  // ── Notification prefs ───────────────────────────────────────────────
  console.log("\nNotification prefs:");
  const prefsPath = `/metrix/workspaces/${WORKSPACE}/notification-prefs`;

  const first = await request("PUT", prefsPath, {
    channels: [{ id: "email", enabled: false }],
    events: [{ id: "creative_fatigue", email: true, in_app: false }],
  });
  const firstChannel = (first.json?.channels ?? []).find((c: any) => c.id === "email");
  check(
    "initial pref upsert persists",
    first.status === 200 && firstChannel?.enabled === false,
    `status=${first.status} body=${JSON.stringify(first.json)}`,
  );

  const second = await request("PUT", prefsPath, {
    channels: [{ id: "email", enabled: true }],
    events: [{ id: "creative_fatigue", email: false, in_app: true }],
  });
  const secondChannel = (second.json?.channels ?? []).find((c: any) => c.id === "email");
  const secondEvent = (second.json?.events ?? []).find((e: any) => e.id === "creative_fatigue");
  check(
    "second upsert overwrites channel value",
    second.status === 200 && secondChannel?.enabled === true,
    `body=${JSON.stringify(second.json)}`,
  );
  check(
    "second upsert overwrites event values",
    secondEvent?.email === false && secondEvent?.in_app === true,
    `event=${JSON.stringify(secondEvent)}`,
  );

  const after = await request("GET", prefsPath);
  const persistedChannels = (after.json?.channels ?? []).filter((c: any) => c.id === "email");
  check(
    "overwrite did not duplicate rows (GET reflects latest)",
    after.status === 200 && persistedChannels.length === 1 && persistedChannels[0]?.enabled === true,
    `channels=${JSON.stringify(after.json?.channels)}`,
  );

  const emptyBody = await request("PUT", prefsPath, undefined, { rawEmpty: true });
  check(
    "PUT with no body rejected with 400",
    emptyBody.status === 400,
    `status=${emptyBody.status} body=${JSON.stringify(emptyBody.json)}`,
  );

  const emptyObject = await request("PUT", prefsPath, {});
  const emptyObjChannel = (emptyObject.json?.channels ?? []).find((c: any) => c.id === "email");
  check(
    "PUT {} is a safe no-op returning persisted prefs",
    emptyObject.status === 200 && emptyObjChannel?.enabled === true,
    `status=${emptyObject.status} body=${JSON.stringify(emptyObject.json)}`,
  );

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Check script crashed:", err);
  process.exit(1);
});
