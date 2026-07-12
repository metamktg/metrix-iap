import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userAdAccountsTable, userSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../app";

// Guards GET /metrix/admin/users against regressions in the batch-grant join
// that populates ad_account_ids in the response.
//
// Strategy: use POST /metrix/admin/users (already tested separately) to create
// isolated test users, then assert the GET response reflects their grants
// accurately. All created rows are torn down in afterAll.
//
// Uses ADMIN_API_KEY Bearer auth — same pattern as adminUserCreation.test.ts.

const TEST_ADMIN_KEY = `test-admin-key-users-list-${Date.now()}`;

let baseUrl: string;
let close: () => Promise<void>;

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${TEST_ADMIN_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function usersUrl(): string {
  return `${baseUrl}/api/metrix/admin/users`;
}

const createdUserIds: number[] = [];

async function createUser(email: string, role: string, adAccountIds: string[]): Promise<number> {
  const res = await fetch(usersUrl(), {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, role, ad_account_ids: adAccountIds }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create user ${email}: ${res.status} ${await res.text()}`);
  }
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!row) throw new Error(`User ${email} not found after creation`);
  createdUserIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  process.env["ADMIN_API_KEY"] = TEST_ADMIN_KEY;

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      close = () => new Promise<void>((res) => server.close(() => res()));
      resolve();
    });
  });
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await db.delete(userAdAccountsTable).where(eq(userAdAccountsTable.userId, userId));
    await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  }
  await close();
  await pool.end();
});

describe("GET /metrix/admin/users", () => {
  it("401s when no admin authorization is provided", async () => {
    const res = await fetch(usersUrl());
    expect(res.status).toBe(401);
  });

  it("returns expected shape with users array and total", async () => {
    const res = await fetch(usersUrl(), { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[]; total: number };
    expect(Array.isArray(body.users)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.total).toBe(body.users.length);
  });

  it("ad_account_ids is empty for a user created with no grants", async () => {
    const email = `list-no-grants-${Date.now()}@example.test`;
    const userId = await createUser(email, "analyst", []);

    const res = await fetch(usersUrl(), { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: Array<{
        id: number;
        email: string;
        role: string;
        ad_account_ids: string[];
      }>;
    };

    const entry = body.users.find((u) => u.id === userId);
    expect(entry).toBeDefined();
    expect(entry!.ad_account_ids).toEqual([]);
  });

  it("ad_account_ids is populated for a user created with grants", async () => {
    const email = `list-with-grants-${Date.now()}@example.test`;
    const grantedIds = [`test-list-acct-a-${Date.now()}`, `test-list-acct-b-${Date.now()}`];
    const userId = await createUser(email, "analyst", grantedIds);

    const res = await fetch(usersUrl(), { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: Array<{
        id: number;
        email: string;
        role: string;
        ad_account_ids: string[];
      }>;
    };

    const entry = body.users.find((u) => u.id === userId);
    expect(entry).toBeDefined();
    expect(entry!.ad_account_ids).toHaveLength(grantedIds.length);
    expect(entry!.ad_account_ids).toEqual(expect.arrayContaining(grantedIds));
  });

  it("reflects added grants when grants are inserted directly after user creation", async () => {
    // Create a user with no grants initially
    const email = `list-grant-added-${Date.now()}@example.test`;
    const userId = await createUser(email, "analyst", []);

    // Verify no grants before
    const before = await fetch(usersUrl(), { headers: adminHeaders() });
    const beforeBody = (await before.json()) as {
      users: Array<{ id: number; ad_account_ids: string[] }>;
    };
    const beforeEntry = beforeBody.users.find((u) => u.id === userId);
    expect(beforeEntry!.ad_account_ids).toEqual([]);

    // Add a grant directly via DB (simulates an external grant change)
    const newAccountId = `test-list-added-${Date.now()}`;
    await db.insert(userAdAccountsTable).values({ userId, adAccountId: newAccountId });

    // Fetch again — grant should now appear
    const after = await fetch(usersUrl(), { headers: adminHeaders() });
    expect(after.status).toBe(200);
    const afterBody = (await after.json()) as {
      users: Array<{ id: number; ad_account_ids: string[] }>;
    };
    const afterEntry = afterBody.users.find((u) => u.id === userId);
    expect(afterEntry).toBeDefined();
    expect(afterEntry!.ad_account_ids).toContain(newAccountId);
  });

  it("reflects removed grants after a grant is deleted", async () => {
    const email = `list-grant-removed-${Date.now()}@example.test`;
    const accountId = `test-list-removed-${Date.now()}`;
    const userId = await createUser(email, "analyst", [accountId]);

    // Confirm grant present initially
    const before = await fetch(usersUrl(), { headers: adminHeaders() });
    const beforeBody = (await before.json()) as {
      users: Array<{ id: number; ad_account_ids: string[] }>;
    };
    const beforeEntry = beforeBody.users.find((u) => u.id === userId);
    expect(beforeEntry!.ad_account_ids).toContain(accountId);

    // Remove the grant
    await db
      .delete(userAdAccountsTable)
      .where(eq(userAdAccountsTable.userId, userId));

    // Fetch again — grant should be gone
    const after = await fetch(usersUrl(), { headers: adminHeaders() });
    const afterBody = (await after.json()) as {
      users: Array<{ id: number; ad_account_ids: string[] }>;
    };
    const afterEntry = afterBody.users.find((u) => u.id === userId);
    expect(afterEntry).toBeDefined();
    expect(afterEntry!.ad_account_ids).toEqual([]);
  });

  it("admin-role users appear with role: admin in the response", async () => {
    const email = `list-admin-role-${Date.now()}@example.test`;
    const userId = await createUser(email, "admin", []);

    const res = await fetch(usersUrl(), { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: Array<{ id: number; role: string; ad_account_ids: string[] }>;
    };

    const entry = body.users.find((u) => u.id === userId);
    expect(entry).toBeDefined();
    expect(entry!.role).toBe("admin");
    expect(entry!.ad_account_ids).toEqual([]);
  });

  it("two users with different grant sets each show only their own accounts", async () => {
    const ts = Date.now();
    const emailA = `list-isolation-a-${ts}@example.test`;
    const emailB = `list-isolation-b-${ts}@example.test`;
    const accountsA = [`test-iso-a1-${ts}`, `test-iso-a2-${ts}`];
    const accountsB = [`test-iso-b1-${ts}`];

    const userIdA = await createUser(emailA, "analyst", accountsA);
    const userIdB = await createUser(emailB, "analyst", accountsB);

    const res = await fetch(usersUrl(), { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: Array<{ id: number; ad_account_ids: string[] }>;
    };

    const entryA = body.users.find((u) => u.id === userIdA);
    const entryB = body.users.find((u) => u.id === userIdB);

    expect(entryA).toBeDefined();
    expect(entryA!.ad_account_ids).toHaveLength(accountsA.length);
    expect(entryA!.ad_account_ids).toEqual(expect.arrayContaining(accountsA));
    // User A must not see user B's accounts
    for (const id of accountsB) {
      expect(entryA!.ad_account_ids).not.toContain(id);
    }

    expect(entryB).toBeDefined();
    expect(entryB!.ad_account_ids).toHaveLength(accountsB.length);
    expect(entryB!.ad_account_ids).toEqual(expect.arrayContaining(accountsB));
    // User B must not see user A's accounts
    for (const id of accountsA) {
      expect(entryB!.ad_account_ids).not.toContain(id);
    }
  });
});
