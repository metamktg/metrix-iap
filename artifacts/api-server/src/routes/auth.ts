import { Router, type IRouter } from "express";
import {
  AuthLoginBody,
  AuthLoginResponse,
  AuthMeResponse,
  AuthLogoutResponse,
  AuthChangePasswordBody,
  AuthChangePasswordResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
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
    if (!user || !ok) {
      req.log.warn({ email }, "failed login attempt");
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const { token, expiresAt } = await createSession(user.id);
    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));
    setSessionCookie(req, res, token, expiresAt);

    const data = AuthLoginResponse.parse({
      user: { email: user.email, must_change_password: user.mustChangePassword },
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
    user: { email: user.email, must_change_password: user.mustChangePassword },
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
      user: { email: user.email, must_change_password: false },
    });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Password change failed");
    res.status(503).json({ message: "Authentication service unavailable." });
  }
});

export default router;
