import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userAdAccountsTable, userSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../app";

// Guards POST /metrix/admin/users and GET /metrix/admin/ad-accounts against
// regressions in route wiring, grant atomicity, and response shape.
//
// Uses ADMIN_API_KEY Bearer auth (the simplest requireAdmin path — no admin
// panel session cookie needed) so these tests don't depend on SESSION_SECRET
// or cookie infrastructure beyond what the existing test suite already needs.
//
// Boots the real app in-process against the live dev DB/Supabase following
// the same pattern as reportDeletion.test.ts and reportsListCreate.test.ts.

const TEST_ADMIN_KEY = `test-admin-key-user-creation-${Date.now()}`;

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

function adAccountsUrl(): string {
  return `${baseUrl}/api/metrix/admin/ad-accounts`;
}

const createdUserIds: number[] = [];

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

describe("POST /metrix/admin/users", () => {
  it("401s when no admin authorization is provided", async () => {
    const res = await fetch(usersUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "no-auth@example.test" }),
    });
    expect(res.status).toBe(401);
  });

  it("400s when body fails schema validation", async () => {
    const res = await fetch(usersUrl(), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a user with role and permissions and no grants when ad_account_ids is empty", async () => {
    const email = `admin-create-no-grants-${Date.now()}@example.test`;
    const res = await fetch(usersUrl(), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        email,
        role: "analyst",
        can_manage_team: false,
        can_view_rollups: true,
        ad_account_ids: [],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      email: string;
      temp_password: string;
      granted_ad_account_ids: string[];
    };
    expect(body.status).toBe("created");
    expect(body.email).toBe(email);
    expect(typeof body.temp_password).toBe("string");
    expect(body.temp_password.length).toBeGreaterThan(0);
    expect(body.granted_ad_account_ids).toEqual([]);

    const [row] = await db
      .select({
        id: usersTable.id,
        role: usersTable.role,
        mustChangePassword: usersTable.mustChangePassword,
        canManageTeam: usersTable.canManageTeam,
        canViewAgencyRollups: usersTable.canViewAgencyRollups,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.role).toBe("member");
    expect(row!.mustChangePassword).toBe(true);
    expect(row!.canManageTeam).toBe(false);
    expect(row!.canViewAgencyRollups).toBe(true);
    createdUserIds.push(row!.id);

    const grants = await db
      .select()
      .from(userAdAccountsTable)
      .where(eq(userAdAccountsTable.userId, row!.id));
    expect(grants).toHaveLength(0);
  });

  it("persists can_manage_team=true and can_view_rollups=false correctly (contrasting case)", async () => {
    const email = `admin-create-perms-contrast-${Date.now()}@example.test`;
    const res = await fetch(usersUrl(), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        email,
        role: "analyst",
        can_manage_team: true,
        can_view_rollups: false,
        ad_account_ids: [],
      }),
    });
    expect(res.status).toBe(200);

    const [row] = await db
      .select({
        id: usersTable.id,
        canManageTeam: usersTable.canManageTeam,
        canViewAgencyRollups: usersTable.canViewAgencyRollups,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.canManageTeam).toBe(true);
    expect(row!.canViewAgencyRollups).toBe(false);
    createdUserIds.push(row!.id);
  });

  it("creates a user with ad_account_ids and inserts the grants atomically", async () => {
    const email = `admin-create-with-grants-${Date.now()}@example.test`;
    const fakeAccountIds = ["test-account-alpha", "test-account-beta"];
    const res = await fetch(usersUrl(), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        email,
        role: "analyst",
        can_manage_team: true,
        can_view_rollups: true,
        ad_account_ids: fakeAccountIds,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      email: string;
      granted_ad_account_ids: string[];
    };
    expect(body.status).toBe("created");
    expect(body.granted_ad_account_ids).toEqual(expect.arrayContaining(fakeAccountIds));
    expect(body.granted_ad_account_ids).toHaveLength(fakeAccountIds.length);

    const [row] = await db
      .select({
        id: usersTable.id,
        canManageTeam: usersTable.canManageTeam,
        canViewAgencyRollups: usersTable.canViewAgencyRollups,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.canManageTeam).toBe(true);
    expect(row!.canViewAgencyRollups).toBe(true);
    createdUserIds.push(row!.id);

    const grants = await db
      .select({ adAccountId: userAdAccountsTable.adAccountId })
      .from(userAdAccountsTable)
      .where(eq(userAdAccountsTable.userId, row!.id));
    const grantedIds = grants.map((g) => g.adAccountId).sort();
    expect(grantedIds).toEqual([...fakeAccountIds].sort());
  });

  it("creates an admin user and stores the admin role in the DB", async () => {
    const email = `admin-create-admin-role-${Date.now()}@example.test`;
    const res = await fetch(usersUrl(), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        email,
        role: "admin",
        ad_account_ids: [],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; email: string };
    expect(body.status).toBe("created");

    const [row] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.role).toBe("admin");
    createdUserIds.push(row!.id);
  });

  it("409s when the email is already taken", async () => {
    const email = `admin-create-duplicate-${Date.now()}@example.test`;

    const first = await fetch(usersUrl(), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ email, role: "analyst", ad_account_ids: [] }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { status: string };
    expect(firstBody.status).toBe("created");

    const [row] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (row) createdUserIds.push(row.id);

    const second = await fetch(usersUrl(), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ email, role: "analyst", ad_account_ids: [] }),
    });
    expect(second.status).toBe(409);
  });
});

describe("GET /metrix/admin/ad-accounts", () => {
  it("401s when no admin authorization is provided", async () => {
    const res = await fetch(adAccountsUrl());
    expect(res.status).toBe(401);
  });

  it("returns a list with the expected shape", async () => {
    const res = await fetch(adAccountsUrl(), {
      headers: { Authorization: `Bearer ${TEST_ADMIN_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ad_accounts: unknown[] };
    expect(Array.isArray(body.ad_accounts)).toBe(true);
    for (const account of body.ad_accounts) {
      const a = account as { id: unknown; name: unknown };
      expect(typeof a.id).toBe("string");
      expect(typeof a.name).toBe("string");
    }
  });
});
