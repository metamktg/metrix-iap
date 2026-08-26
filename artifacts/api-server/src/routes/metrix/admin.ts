// ─── /metrix admin routes ───────────────────────────────────────────
// Split out of routes/metrix.ts (E5) — a pure move. Routes appear here in
// their ORIGINAL registration order, and index.ts mounts the routers in
// the original order too, so Express matching is unchanged.

import { Router, type IRouter } from "express";
import {
  GetMetrixSeedResponse,
  AdminLoginBody,
  AdminLoginResponse,
  GetAdminSessionResponse,
  AdminLogoutResponse,
  GetAdminEmailStatusResponse,
  ListAdminUsersResponse,
  AdminResendTempPasswordResponse,
  AdminSendPasswordResetResponse,
  AdminRevokeUserResponse,
  AdminRestoreUserResponse,
} from "@workspace/api-zod";
import { db, usersTable, userAdAccountsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireAuth } from "../../middlewares/requireAuth";
import { hashPassword, generateTempPassword } from "../../lib/passwords";
import { isAgencyAdminEmail } from "../../lib/agencyAccessSafeguard";
import { sendApprovalEmail } from "../../lib/approvalEmail";
import { sendPasswordResetEmail } from "../../lib/passwordResetEmail";
import { getEmailConfig } from "../../lib/email";
import { createPasswordResetToken, deletePasswordResetTokensForUser } from "../../lib/passwordResets";
import { destroyAllSessions } from "../../lib/sessions";
import { getMetrixSeedFromSupabase, composeSeedForUser } from "../../lib/metrixSeedAssembly";
import { getAppBaseUrl } from "../../lib/appUrl";
import { createAdminToken, hasAdminSession, setAdminCookie, clearAdminCookie, safeCompare } from "../../lib/adminPanelSession";
import rateLimit from "express-rate-limit";
import { provisionApprovedUser } from "./shared";
const adminLoginRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    req.log?.warn({ ip: req.ip }, "admin login rate limit exceeded");
    res.status(429).json({ message: "Too many attempts. Please try again shortly." });
  },
});
function adminUserStatus(user: {
  disabledAt: Date | null;
  lastLoginAt: Date | null;
}): "active" | "invited" | "disabled" {
  if (user.disabledAt) return "disabled";
  return user.lastLoginAt ? "active" : "invited";
}
async function findAdminUser(userIdRaw: string) {
  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId) || userId < 1) return null;
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      disabledAt: usersTable.disabledAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user ?? null;
}
// Reusable grant-fetch helper for admin routes (no workspace scope needed)
export async function grantsForAdmin(userId: number): Promise<string[]> {
  const rows = await db
    .select({ adAccountId: userAdAccountsTable.adAccountId })
    .from(userAdAccountsTable)
    .where(eq(userAdAccountsTable.userId, userId));
  return rows.map((r) => r.adAccountId);
}


const router: IRouter = Router();


router.post("/metrix/admin/session", adminLoginRateLimit, (req, res) => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ message: "Incorrect admin password." });
    return;
  }

  const configured = process.env.ADMIN_PANEL_PASSWORD;
  if (!configured) {
    // Fail closed: nobody can log in until the secret is set.
    req.log.warn("Admin login attempted but ADMIN_PANEL_PASSWORD is not configured");
    res.status(401).json({ message: "Admin access is not configured on this server." });
    return;
  }

  if (!safeCompare(parsed.data.password, configured)) {
    req.log.warn({ ip: req.ip }, "Admin login failed: wrong password");
    res.status(401).json({ message: "Incorrect admin password." });
    return;
  }

  setAdminCookie(req, res, createAdminToken());
  res.json(AdminLoginResponse.parse({ authenticated: true }));
});


router.get("/metrix/admin/session", (req, res) => {
  res.json(GetAdminSessionResponse.parse({ authenticated: hasAdminSession(req) }));
});


router.delete("/metrix/admin/session", (req, res) => {
  clearAdminCookie(req, res);
  res.json(AdminLogoutResponse.parse({ authenticated: false }));
});


// ─── Admin user management ─────────────────────────────────────────────

router.get("/metrix/admin/email-status", requireAdmin, (req, res) => {
  const { mode, from } = getEmailConfig();
  const environment = process.env["NODE_ENV"] === "production" ? "production" : "development";
  res.json(GetAdminEmailStatusResponse.parse({ mode, from, environment }));
});


router.get("/metrix/admin/users", requireAdmin, async (req, res) => {
  const [rows, allGrants] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        role: usersTable.role,
        mustChangePassword: usersTable.mustChangePassword,
        createdAt: usersTable.createdAt,
        lastLoginAt: usersTable.lastLoginAt,
        disabledAt: usersTable.disabledAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt)),
    db
      .select({
        userId: userAdAccountsTable.userId,
        adAccountId: userAdAccountsTable.adAccountId,
      })
      .from(userAdAccountsTable),
  ]);

  const grantsMap = new Map<number, string[]>();
  for (const g of allGrants) {
    if (!grantsMap.has(g.userId)) grantsMap.set(g.userId, []);
    grantsMap.get(g.userId)!.push(g.adAccountId);
  }

  res.json(
    ListAdminUsersResponse.parse({
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        display_name: u.displayName ?? null,
        status: adminUserStatus(u),
        role: u.role,
        must_change_password: u.mustChangePassword,
        created_at: u.createdAt.toISOString(),
        last_login_at: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        disabled_at: u.disabledAt ? u.disabledAt.toISOString() : null,
        ad_account_ids: grantsMap.get(u.id) ?? [],
      })),
      total: rows.length,
    }),
  );
});


router.post(
  "/metrix/admin/users/:userId/resend-temp-password",
  requireAdmin,
  async (req, res) => {
    const user = await findAdminUser(String(req.params.userId));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    if (user.disabledAt) {
      res.status(409).json({
        message: "This account is disabled. Restore access before sending new credentials.",
      });
      return;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(usersTable.id, user.id));
    // Old credentials are dead; open sessions and outstanding reset links
    // go with them.
    await destroyAllSessions(user.id);
    await deletePasswordResetTokensForUser(user.id);

    const emailResult = await sendApprovalEmail(
      user.email,
      tempPassword,
      getAppBaseUrl(),
      req.log,
    );
    const sent = emailResult.status === "sent";
    res.json(
      AdminResendTempPasswordResponse.parse({
        status: "resent",
        email: user.email,
        email_sent: sent,
        ...(sent
          ? {}
          : { temp_password: tempPassword, email_error: emailResult.reason }),
      }),
    );
  },
);


router.post(
  "/metrix/admin/users/:userId/send-password-reset",
  requireAdmin,
  async (req, res) => {
    const user = await findAdminUser(String(req.params.userId));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    if (user.disabledAt) {
      res.status(409).json({
        message: "This account is disabled. Restore access before sending a reset link.",
      });
      return;
    }

    const { token } = await createPasswordResetToken(user.id);
    const resetUrl = `${getAppBaseUrl()}reset-password?token=${token}`;
    const emailResult = await sendPasswordResetEmail(
      user.email,
      resetUrl,
      getAppBaseUrl(),
      req.log,
    );
    const sent = emailResult.status === "sent";
    res.json(
      AdminSendPasswordResetResponse.parse({
        status: "reset_link_created",
        email: user.email,
        email_sent: sent,
        ...(sent
          ? {}
          : { reset_url: resetUrl, email_error: emailResult.reason }),
      }),
    );
  },
);


router.post(
  "/metrix/admin/users/:userId/revoke",
  requireAdmin,
  async (req, res) => {
    const user = await findAdminUser(String(req.params.userId));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    if (!user.disabledAt) {
      await db
        .update(usersTable)
        .set({ disabledAt: new Date() })
        .where(eq(usersTable.id, user.id));
    }
    // Always destroy sessions and outstanding reset links, even if already
    // disabled — a pre-revoke reset link must not survive a later restore.
    await destroyAllSessions(user.id);
    await deletePasswordResetTokensForUser(user.id);
    req.log.info({ email: user.email }, "admin revoked user access");

    res.json(
      AdminRevokeUserResponse.parse({ status: "revoked", email: user.email }),
    );
  },
);


router.post(
  "/metrix/admin/users/:userId/restore",
  requireAdmin,
  async (req, res) => {
    const user = await findAdminUser(String(req.params.userId));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    await db
      .update(usersTable)
      .set({ disabledAt: null })
      .where(eq(usersTable.id, user.id));
    req.log.info({ email: user.email }, "admin restored user access");

    res.json(
      AdminRestoreUserResponse.parse({ status: "restored", email: user.email }),
    );
  },
);


// ─── Admin: list all known ad accounts (for grant picker) ─────────────

router.get("/metrix/admin/ad-accounts", requireAdmin, async (req, res) => {
  let bundle: { ad_accounts?: Array<{ id: string; name?: string | null }> };
  try {
    bundle = (await getMetrixSeedFromSupabase()) as {
      ad_accounts?: Array<{ id: string; name?: string | null }>;
    };
  } catch (err) {
    req.log.error({ err }, "Failed to load Metrix seed for admin ad-accounts list");
    res.status(503).json({ message: "Metrix data layer is unavailable." });
    return;
  }
  const ad_accounts = (bundle.ad_accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name ?? null,
  }));
  res.json({ ad_accounts });
});


// ─── Admin: create user directly (no waitlist entry required) ──────────

router.post("/metrix/admin/users", requireAdmin, async (req, res) => {
  const { z } = await import("zod/v4");
  const Body = z.object({
    email: z.string().email(),
    display_name: z.string().optional(),
    role: z.enum(["admin", "member"]).optional(),
    ad_account_ids: z.array(z.string()).optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input. An email is required." });
    return;
  }

  const { email, display_name, role, ad_account_ids } = parsed.data;
  const result = await provisionApprovedUser(email.toLowerCase(), req.log, {});

  // Store display name if provided
  if (display_name?.trim()) {
    await db
      .update(usersTable)
      .set({ displayName: display_name.trim() })
      .where(eq(usersTable.email, email.toLowerCase()));
  }

  // Apply requested role if given and not forced by agency safeguard
  if (role && !isAgencyAdminEmail(email)) {
    await db
      .update(usersTable)
      .set({ role })
      .where(eq(usersTable.email, email.toLowerCase()));
  }

  // Grant ad accounts (member-only; admins see everything by role)
  const effectiveRole = isAgencyAdminEmail(email) ? "admin" : (role ?? "member");
  if (effectiveRole === "member" && ad_account_ids && ad_account_ids.length > 0) {
    // Load known accounts to filter unknown ids
    let knownIds: Set<string> = new Set();
    try {
      const bundle = (await getMetrixSeedFromSupabase()) as {
        ad_accounts?: Array<{ id: string }>;
      };
      knownIds = new Set((bundle.ad_accounts ?? []).map((a) => a.id));
    } catch {
      // Non-fatal: grant what we can
    }
    const validIds = ad_account_ids.filter((id) => knownIds.size === 0 || knownIds.has(id));
    if (validIds.length > 0) {
      await db
        .insert(userAdAccountsTable)
        .values(validIds.map((adAccountId) => ({ userId: result.userId, adAccountId })))
        .onConflictDoNothing({
          target: [userAdAccountsTable.userId, userAdAccountsTable.adAccountId],
        });
    }
  }

  res.json({
    status: "created",
    email: email.toLowerCase(),
    user_id: result.userId,
    email_sent: result.email_sent,
    ...(result.temp_password ? { temp_password: result.temp_password } : {}),
    ...(result.email_error ? { email_error: result.email_error } : {}),
  });
});


// ─── Admin: hard-delete a user account ────────────────────────────────

router.delete("/metrix/admin/users/:userId", requireAdmin, async (req, res) => {
  if (req.query["confirm"] !== "true") {
    res.status(400).json({ message: "Pass confirm=true to confirm this irreversible action." });
    return;
  }
  const user = await findAdminUser(String(req.params.userId));
  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  // Sessions and grants cascade-delete via FK, but be explicit for reset tokens
  await deletePasswordResetTokensForUser(user.id);
  // Cascade on user_sessions and user_ad_accounts handles those rows,
  // but only if the DB schema uses ON DELETE CASCADE — destroy sessions
  // explicitly to be safe.
  await destroyAllSessions(user.id);
  await db.delete(usersTable).where(eq(usersTable.id, user.id));
  req.log.info({ email: user.email }, "admin hard-deleted user account");

  res.json({ status: "deleted", email: user.email });
});


// ─── Admin: get / replace a user's ad account grants ──────────────────

router.get("/metrix/admin/users/:userId/ad-accounts", requireAdmin, async (req, res) => {
  const user = await findAdminUser(String(req.params.userId));
  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }
  const ad_account_ids = await grantsForAdmin(user.id);
  res.json({ ad_account_ids });
});


router.put("/metrix/admin/users/:userId/ad-accounts", requireAdmin, async (req, res) => {
  const { z } = await import("zod/v4");
  const Body = z.object({ ad_account_ids: z.array(z.string()) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "ad_account_ids array is required." });
    return;
  }

  const user = await findAdminUser(String(req.params.userId));
  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  const { ad_account_ids } = parsed.data;

  // Replace the full grant list atomically
  await db.delete(userAdAccountsTable).where(eq(userAdAccountsTable.userId, user.id));
  if (ad_account_ids.length > 0) {
    await db
      .insert(userAdAccountsTable)
      .values(ad_account_ids.map((adAccountId) => ({ userId: user.id, adAccountId })))
      .onConflictDoNothing({
        target: [userAdAccountsTable.userId, userAdAccountsTable.adAccountId],
      });
  }

  const updated = await grantsForAdmin(user.id);
  res.json({ ad_account_ids: updated });
});


router.get("/metrix/seed", requireAuth, async (req, res) => {
  try {
    const user = req.authUser!;
    let bundle = await getMetrixSeedFromSupabase();
    if (user.role !== "admin") {
      // Members see only accounts they have been granted. The per-user view
      // is derived fresh on every request (never cached) so a new grant is
      // visible immediately. An empty grant set is valid: ad_accounts []
      // renders the onboarding path client-side.
      const grants = await db
        .select({ adAccountId: userAdAccountsTable.adAccountId })
        .from(userAdAccountsTable)
        .where(eq(userAdAccountsTable.userId, user.id));
      bundle = composeSeedForUser(bundle, new Set(grants.map((g) => g.adAccountId)), {
        viewAgencyRollups: user.canViewAgencyRollups,
      });
    }
    const data = GetMetrixSeedResponse.parse(bundle);
    res.json(data);
  } catch (err) {
    // No static fallback by design: the app must not silently render stale
    // bundled data when the Supabase-backed data layer is unavailable.
    req.log.error({ err }, "Failed to assemble Metrix seed from Supabase");
    res.status(503).json({
      message:
        err instanceof Error ? err.message : "Metrix data layer is unavailable.",
    });
  }
});

export default router;
