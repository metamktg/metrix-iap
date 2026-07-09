import type { Request, Response, NextFunction } from "express";
import { hasAdminSession, safeCompare } from "../lib/adminPanelSession";

// Admin endpoints accept either:
//  - a Bearer ADMIN_API_KEY (script / Settings-panel access), or
//  - a valid admin-panel session cookie (set by POST /metrix/admin/session
//    after entering the ADMIN_PANEL_PASSWORD on the /admin page).
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (hasAdminSession(req)) {
    next();
    return;
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey) {
    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (token && safeCompare(token, adminKey)) {
      next();
      return;
    }
  } else {
    req.log.warn("Admin endpoint requested but ADMIN_API_KEY is not configured");
  }

  res.status(401).json({ message: "Admin authorization required." });
}
