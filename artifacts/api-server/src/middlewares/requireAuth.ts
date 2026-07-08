import type { Request, Response, NextFunction } from "express";
import type { User } from "@workspace/db";
import { getUserForSessionToken, readSessionToken } from "../lib/sessions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: User;
      sessionToken?: string;
    }
  }
}

/**
 * Requires a valid session cookie. Attaches the user as req.authUser.
 * Fails closed with 401 when the cookie is missing, unknown, or expired.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readSessionToken(req);
  if (!token) {
    res.status(401).json({ message: "You must be logged in." });
    return;
  }

  try {
    const user = await getUserForSessionToken(token);
    if (!user) {
      res.status(401).json({ message: "Your session has expired. Please log in again." });
      return;
    }
    req.authUser = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    req.log.error({ err }, "Session lookup failed");
    res.status(503).json({ message: "Authentication service unavailable." });
  }
}
