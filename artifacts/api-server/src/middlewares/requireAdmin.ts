import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    req.log.warn("Admin endpoint requested but ADMIN_API_KEY is not configured; rejecting");
    res.status(401).json({ message: "Admin access is not configured on this server." });
    return;
  }

  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!token || !safeCompare(token, adminKey)) {
    res.status(401).json({ message: "Admin authorization required." });
    return;
  }

  next();
}
