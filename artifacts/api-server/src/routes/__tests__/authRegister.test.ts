// ─── POST /metrix/auth/register — in-process route tests ───────────────────
// Boots the real Express app against the dev DB and exercises the register
// endpoint: happy path, duplicate-email 409, and short-password 400.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../app";
import { SESSION_COOKIE } from "../../lib/sessions";

const REGISTER_URL_PATH = "/api/metrix/auth/register";

let baseUrl: string;
let close: () => Promise<void>;

// Emails created during this run — cleaned up in afterAll.
const createdEmails: string[] = [];

function registerUrl(): string {
  return `${baseUrl}${REGISTER_URL_PATH}`;
}

function uniqueEmail(label: string): string {
  const email = `auth-register-test-${label}-${Date.now()}@example.test`;
  createdEmails.push(email);
  return email;
}

async function register(body: Record<string, unknown>) {
  return fetch(registerUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
  // Remove every user + session created during this test run.
  for (const email of createdEmails) {
    const [row] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (row) {
      await db
        .delete(userSessionsTable)
        .where(eq(userSessionsTable.userId, row.id));
      await db.delete(usersTable).where(eq(usersTable.id, row.id));
    }
  }
  if (typeof close === "function") await close();
  await pool.end();
});

describe("POST /metrix/auth/register", () => {
  it("400s when the password is shorter than 8 characters", async () => {
    const res = await register({
      email: uniqueEmail("short-pw"),
      password: "abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBeTruthy();
  });

  it("400s when the email is missing", async () => {
    const res = await register({ password: "validpassword1" });
    expect(res.status).toBe(400);
  });

  it("400s when the email is not a valid email address", async () => {
    const res = await register({ email: "not-an-email", password: "validpassword1" });
    expect(res.status).toBe(400);
  });

  it("creates a new user and returns a session cookie on valid registration", async () => {
    const email = uniqueEmail("happy");
    const res = await register({ email, password: "securepass1" });

    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      user: { email: string; role: string; must_change_password: boolean };
    };
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe("member");
    expect(body.user.must_change_password).toBe(false);

    // The response must have set a session cookie.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(SESSION_COOKIE);

    // The user must actually exist in the DB.
    const [dbRow] = await db
      .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    expect(dbRow).toBeTruthy();
    expect(dbRow.role).toBe("member");
  });

  it("409s when the same email is registered a second time", async () => {
    const email = uniqueEmail("duplicate");
    // First registration — must succeed.
    const first = await register({ email, password: "securepass1" });
    expect(first.status).toBe(200);

    // Second registration with the same email — must conflict.
    const second = await register({ email, password: "differentpass2" });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { message: string };
    expect(body.message).toMatch(/already exists/i);
  });

  it("the session cookie from a valid registration authenticates GET /metrix/auth/me", async () => {
    const email = uniqueEmail("session-check");
    const regRes = await register({ email, password: "securepass1" });
    expect(regRes.status).toBe(200);

    const setCookie = regRes.headers.get("set-cookie") ?? "";
    // Extract just the cookie value portion (before any ;).
    const cookieHeader = setCookie.split(",").find((c) => c.includes(SESSION_COOKIE)) ?? "";
    const cookieKV = cookieHeader.trim().split(";")[0]; // e.g. "metrix_session=xxx"

    const meRes = await fetch(`${baseUrl}/api/metrix/auth/me`, {
      headers: { Cookie: cookieKV },
    });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { email: string } };
    expect(meBody.user.email).toBe(email);
  });
});
