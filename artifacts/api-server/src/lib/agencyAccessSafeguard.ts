// ─── Agency admin access safeguard ─────────────────────────────────────
// Members are scoped to only the ad accounts explicitly listed in
// user_ad_accounts (admins bypass this and see everything). Nothing in the
// provisioning/approval code path ever set role to "admin" — every new user
// (including the agency's own login) defaulted to "member" with zero
// grants, so shipping per-user account scoping silently collapsed the
// agency's own view to empty. This module is the durable fix: it runs at
// startup and on every approval, promoting designated agency accounts to
// admin and failing loudly (never silently) if the data is left in a state
// that would strand every user without visibility.
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { db, usersTable, userAdAccountsTable } from "@workspace/db";
import type { Logger } from "pino";

// The agency's own login(s) must always have full ad-account visibility —
// they are not clients and should never be scoped by user_ad_accounts
// grants. Comma-separated override lets ops add accounts without a deploy.
const DEFAULT_AGENCY_ADMIN_EMAILS = ["meta@metamktgagency.com"];

export function getAgencyAdminEmails(): string[] {
  const raw = process.env["AGENCY_ADMIN_EMAILS"];
  const fromEnv = raw
    ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  return [...new Set([...DEFAULT_AGENCY_ADMIN_EMAILS, ...fromEnv])];
}

export function isAgencyAdminEmail(email: string): boolean {
  return getAgencyAdminEmails().includes(email.trim().toLowerCase());
}

/**
 * Idempotent reconciliation, safe to run on every boot and after every
 * approval:
 *  1. Promotes any designated agency email that exists as a non-admin to
 *     admin (never demotes — this is a floor, not a cap, on access).
 *  2. Fails loudly (logs error, does not throw — a logging bug must never
 *     crash the server) if zero admins exist at all, or if non-admin
 *     members exist with zero rows in user_ad_accounts, since both states
 *     mean at least one real user is looking at an empty app.
 */
export async function reconcileAgencyAdminAccess(log: Logger): Promise<void> {
  const agencyEmails = getAgencyAdminEmails();

  const promoted: string[] = [];
  for (const email of agencyEmails) {
    const [user] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (user && user.role !== "admin") {
      await db
        .update(usersTable)
        .set({ role: "admin" })
        .where(eq(usersTable.id, user.id));
      promoted.push(email);
    }
  }
  if (promoted.length > 0) {
    log.warn(
      { emails: promoted },
      "Agency access safeguard: promoted designated agency account(s) to admin (were left as scoped 'member')",
    );
  }

  const [adminRow] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));
  const adminCount = adminRow?.total ?? 0;
  if (Number(adminCount) === 0) {
    log.error(
      "Agency access safeguard: zero admin users exist — every account is scoped by user_ad_accounts grants and nobody has full visibility. This must be fixed manually.",
    );
  }

  const [memberRow] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(and(ne(usersTable.role, "admin"), isNull(usersTable.disabledAt)));
  const memberCount = memberRow?.total ?? 0;
  if (Number(memberCount) > 0) {
    const [grantRow] = await db.select({ total: count() }).from(userAdAccountsTable);
    const grantCount = grantRow?.total ?? 0;
    if (Number(grantCount) === 0) {
      log.error(
        { memberCount: Number(memberCount) },
        "Agency access safeguard: non-admin members exist but user_ad_accounts has zero grants — every member's ad-account list will render empty. Grant access or promote to admin.",
      );
    }
  }
}
