// ─── Password-reset flow — in-process route tests ───────────────────────────
// Registers a fresh user, exercises the full request-reset → consume-token →
// login-with-new-password flow, and covers the invalid/expired-token path.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable, passwordResetTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../app";
import { SESSION_COOKIE } from "../../lib/sessions";
import { createPasswordResetToken } from "../../lib/passwordResets";

const REGISTER_PATH = "/api/metrix/auth/register";
const REQUEST_RESET_PATH = "/api/metrix/auth/request-password-reset";
const RESET_PATH = "/api/metrix/auth/reset-password";
const LOGIN_PATH = "/api/metrix/auth/login";
const ME_PATH = "/api/metrix/auth/me";

let baseUrl: string;
let close: () => Promise<void>;

const createdEmails: string[] = [];

function url(path: string) {
  return `${baseUrl}${path}`;
}

function uniqueEmail(label: string): string {
  const email = `pw-reset-e2e-${label}-${Date.now()}@example.test`;
  createdEmails.push(email);
  return email;
}

async function post(path: string, body: Record<string, unknown>) {
  return fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Register a fresh user and return their DB id. */
async function registerUser(email: string, password: string): Promise<number> {
  const res = await post(REGISTER_PATH, { email, password });
  if (res.status !== 200) {
    throw new Error(`Registration failed: ${res.status} ${await res.text()}`);
  }
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  return row.id;
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      close = () => new Promise<void>((res) => server.close(() => res()));
      resolve();
    });
  });
}, 20_000);

afterAll(async () => {
  for (const email of createdEmails) {
    const [row] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (row) {
      await db
        .delete(passwordResetTokensTable)
        .where(eq(passwordResetTokensTable.userId, row.id));
      await db
        .delete(userSessionsTable)
        .where(eq(userSessionsTable.userId, row.id));
      await db.delete(usersTable).where(eq(usersTable.id, row.id));
    }
  }
  if (typeof close === "function") await close();
  await pool.end();
});

// ---------------------------------------------------------------------------

describe("POST /metrix/auth/request-password-reset", () => {
  it("returns 200 with neutral status for a registered user", async () => {
    const email = uniqueEmail("req-known");
    await registerUser(email, "initialPass1");

    const res = await post(REQUEST_RESET_PATH, { email });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("returns 200 with the same neutral status for an unknown email (no enumeration)", async () => {
    const res = await post(REQUEST_RESET_PATH, { email: "noone@example.test" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("400s when the email field is missing", async () => {
    const res = await post(REQUEST_RESET_PATH, {});
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe("POST /metrix/auth/reset-password", () => {
  it("400s when the token field is missing", async () => {
    const res = await post(RESET_PATH, { new_password: "newpassword1" });
    expect(res.status).toBe(400);
  });

  it("400s when the new_password is too short", async () => {
    const email = uniqueEmail("short-pw");
    const userId = await registerUser(email, "initialPass1");
    const { token } = await createPasswordResetToken(userId);

    const res = await post(RESET_PATH, { token, new_password: "short" });
    expect(res.status).toBe(400);
  });

  it("400s for an invalid / non-existent token", async () => {
    const res = await post(RESET_PATH, {
      token: "a".repeat(64),
      new_password: "validpassword1",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/invalid|expired|already been used/i);
  });

  it("400s when a valid token is consumed a second time (replay prevention)", async () => {
    const email = uniqueEmail("replay");
    const userId = await registerUser(email, "initialPass1");
    const { token } = await createPasswordResetToken(userId);

    // First consumption — must succeed.
    const first = await post(RESET_PATH, { token, new_password: "newPassword1" });
    expect(first.status).toBe(200);

    // Second consumption with the same token — must be rejected.
    const second = await post(RESET_PATH, { token, new_password: "anotherPass2" });
    expect(second.status).toBe(400);
    const body = (await second.json()) as { message: string };
    expect(body.message).toMatch(/invalid|expired|already been used/i);
  });
});

// ---------------------------------------------------------------------------

describe("full register → request-reset → consume-token → login flow", () => {
  it("lets a newly registered user reset their password and sign in with the new one", async () => {
    const email = uniqueEmail("full-flow");
    const initialPassword = "initialPass1";
    const newPassword = "newPassword99!";

    // 1. Register.
    const userId = await registerUser(email, initialPassword);

    // 2. Request a password reset (HTTP endpoint — neutral 200).
    const reqRes = await post(REQUEST_RESET_PATH, { email });
    expect(reqRes.status).toBe(200);

    // 3. Obtain a real token via the library (mirrors the token the email would
    //    carry; the send step is fire-and-forget and is irrelevant here).
    const { token } = await createPasswordResetToken(userId);

    // 4. Consume the token to set a new password.
    const resetRes = await post(RESET_PATH, { token, new_password: newPassword });
    expect(resetRes.status).toBe(200);
    const resetBody = (await resetRes.json()) as { status: string };
    expect(resetBody.status).toBe("reset");

    // 5. The old password must no longer work.
    const oldLoginRes = await post(LOGIN_PATH, {
      email,
      password: initialPassword,
    });
    expect(oldLoginRes.status).toBe(401);

    // 6. The new password must authenticate successfully.
    const newLoginRes = await post(LOGIN_PATH, {
      email,
      password: newPassword,
    });
    expect(newLoginRes.status).toBe(200);
    const loginBody = (await newLoginRes.json()) as {
      user: { email: string; must_change_password: boolean };
    };
    expect(loginBody.user.email).toBe(email);
    expect(loginBody.user.must_change_password).toBe(false);

    // 7. The session cookie from the new login must authenticate GET /me.
    const setCookie = newLoginRes.headers.get("set-cookie") ?? "";
    const cookieKV =
      (setCookie.split(",").find((c) => c.includes(SESSION_COOKIE)) ?? "")
        .trim()
        .split(";")[0];
    const meRes = await fetch(url(ME_PATH), {
      headers: { Cookie: cookieKV },
    });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { email: string } };
    expect(meBody.user.email).toBe(email);
  });

  it("revokes all pre-reset sessions so they can no longer authenticate", async () => {
    const email = uniqueEmail("session-revoke");
    const initialPassword = "initialPass1";
    const newPassword = "freshPassword2";

    // 1. Register — this creates a session.
    const regRes = await post(REGISTER_PATH, { email, password: initialPassword });
    expect(regRes.status).toBe(200);
    const regCookie = (regRes.headers.get("set-cookie") ?? "")
      .split(",")
      .find((c) => c.includes(SESSION_COOKIE))
      ?.trim()
      .split(";")[0] ?? "";

    // Confirm the registration session works.
    const meBefore = await fetch(url(ME_PATH), { headers: { Cookie: regCookie } });
    expect(meBefore.status).toBe(200);

    const [row] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    const userId = row.id;

    // 2. Consume a reset token (resets password and revokes all sessions).
    const { token } = await createPasswordResetToken(userId);
    const resetRes = await post(RESET_PATH, { token, new_password: newPassword });
    expect(resetRes.status).toBe(200);

    // 3. The old session must now be invalid.
    const meAfter = await fetch(url(ME_PATH), { headers: { Cookie: regCookie } });
    expect(meAfter.status).toBe(401);
  });
});
