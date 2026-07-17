import { Router, type IRouter } from "express";
import {
  AuthLoginBody,
  AuthLoginResponse,
  AuthMeResponse,
  AuthLogoutResponse,
  AuthChangePasswordBody,
  AuthChangePasswordResponse,
  AuthRequestPasswordResetBody,
  AuthRequestPasswordResetResponse,
  AuthResetPasswordBody,
  AuthResetPasswordResponse,
} from "@workspace/api-zod";
import { db, usersTable, userSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/passwords";
import {
  createSession,
  destroySession,
  destroyOtherSessions,
  readSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from "../lib/sessions";
import {
  createPasswordResetToken,
  consumePasswordResetToken,
} from "../lib/passwordResets";
import { sendPasswordResetEmail } from "../lib/passwordResetEmail";
import { getAppBaseUrl } from "../lib/appUrl";
import { requireAuth } from "../middlewares/requireAuth";
import { loginRateLimit } from "../middlewares/loginRateLimit";

const router: IRouter = Router();

router.post("/metrix/auth/login", loginRateLimit, async (req, res) => {
  const parsed = AuthLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
    if (!user || !ok || user.disabledAt) {
      // Disabled accounts get the same generic message — an explicit
      // "access revoked" reply would enable account enumeration.
      if (user?.disabledAt) {
        req.log.warn({ email }, "login attempt on disabled account");
      } else {
        req.log.warn({ email }, "failed login attempt");
      }
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const { token, expiresAt } = await createSession(user.id);
    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));
    setSessionCookie(req, res, token, expiresAt, parsed.data.rememberMe ?? false);

    const data = AuthLoginResponse.parse({
      user: {
        email: user.email,
        must_change_password: user.mustChangePassword,
        role: user.role,
        manage_team: user.role === "admin" || user.canManageTeam,
        view_agency_rollups: user.role === "admin" || user.canViewAgencyRollups,
      },
    });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Login failed");
    res.status(503).json({ message: "Authentication service unavailable." });
  }
});

router.post("/metrix/auth/logout", async (req, res) => {
  const token = readSessionToken(req);
  if (token) {
    try {
      await destroySession(token);
    } catch (err) {
      req.log.error({ err }, "Failed to destroy session on logout");
    }
  }
  clearSessionCookie(req, res);
  res.json(AuthLogoutResponse.parse({ status: "logged_out" }));
});

router.get("/metrix/auth/me", requireAuth, (req, res) => {
  const user = req.authUser!;
  const data = AuthMeResponse.parse({
    user: {
      email: user.email,
      must_change_password: user.mustChangePassword,
      role: user.role,
      manage_team: user.role === "admin" || user.canManageTeam,
      view_agency_rollups: user.role === "admin" || user.canViewAgencyRollups,
    },
  });
  res.json(data);
});

router.post("/metrix/auth/change-password", requireAuth, async (req, res) => {
  const parsed = AuthChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "New password must be at least 8 characters long.",
    });
    return;
  }
  const user = req.authUser!;

  try {
    const ok = await verifyPassword(parsed.data.current_password, user.passwordHash);
    if (!ok) {
      res.status(400).json({ message: "Current password is incorrect." });
      return;
    }
    if (parsed.data.new_password === parsed.data.current_password) {
      res.status(400).json({
        message: "New password must be different from the current password.",
      });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.new_password);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(usersTable.id, user.id));

    // Revoke every other session (e.g. anyone else holding the temp password).
    await destroyOtherSessions(user.id, req.sessionToken!);

    const data = AuthChangePasswordResponse.parse({
      user: {
        email: user.email,
        must_change_password: false,
        role: user.role,
        manage_team: user.role === "admin" || user.canManageTeam,
        view_agency_rollups: user.role === "admin" || user.canViewAgencyRollups,
      },
    });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Password change failed");
    res.status(503).json({ message: "Authentication service unavailable." });
  }
});

router.post(
  "/metrix/auth/request-password-reset",
  loginRateLimit,
  async (req, res) => {
    const parsed = AuthRequestPasswordResetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "A valid email address is required." });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const neutral = AuthRequestPasswordResetResponse.parse({ status: "ok" });

    try {
      const [user] = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          disabledAt: usersTable.disabledAt,
        })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      if (!user || user.disabledAt) {
        // Neutral response: never reveal whether an account exists (or that
        // it has been disabled).
        req.log.info(
          { email, disabled: Boolean(user?.disabledAt) },
          "password reset requested for unknown or disabled account",
        );
        res.json(neutral);
        return;
      }

      const { token } = await createPasswordResetToken(user.id);
      const appBaseUrl = getAppBaseUrl();
      const resetUrl = `${appBaseUrl}reset-password?token=${token}`;
      // Fire-and-forget: delivery outcome must not change the response.
      void sendPasswordResetEmail(user.email, resetUrl, appBaseUrl, req.log);

      res.json(neutral);
    } catch (err) {
      req.log.error({ err }, "Password reset request failed");
      res.status(503).json({ message: "Authentication service unavailable." });
    }
  },
);

router.post("/metrix/auth/reset-password", loginRateLimit, async (req, res) => {
  const parsed = AuthResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "A reset token and a new password of at least 8 characters are required.",
    });
    return;
  }

  try {
    const resetToken = await consumePasswordResetToken(parsed.data.token);
    if (!resetToken) {
      res.status(400).json({
        message:
          "This reset link is invalid, expired, or has already been used. Request a new one from the login page.",
      });
      return;
    }

    // A revoked user holding an unexpired token must not be able to reset.
    const [tokenUser] = await db
      .select({ disabledAt: usersTable.disabledAt })
      .from(usersTable)
      .where(eq(usersTable.id, resetToken.userId))
      .limit(1);
    if (!tokenUser || tokenUser.disabledAt) {
      req.log.warn(
        { userId: resetToken.userId },
        "password reset blocked for disabled account",
      );
      res.status(400).json({
        message:
          "This reset link is invalid, expired, or has already been used. Request a new one from the login page.",
      });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.new_password);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(usersTable.id, resetToken.userId));

    // Revoke every existing session — the user logs in fresh with the new
    // password (mirrors change-password session revocation).
    await db
      .delete(userSessionsTable)
      .where(eq(userSessionsTable.userId, resetToken.userId));

    req.log.info({ userId: resetToken.userId }, "password reset completed");
    res.json(AuthResetPasswordResponse.parse({ status: "reset" }));
  } catch (err) {
    req.log.error({ err }, "Password reset failed");
    res.status(503).json({ message: "Authentication service unavailable." });
  }
});

export default router;
