// Mirror provisioned Metrix users into Supabase Auth (auth.users).
//
// The live app's login stays fully custom (bcrypt + DB sessions in Replit
// Postgres). Supabase Auth rows exist ONLY so the official METRIX schema's
// reviewer/approver/editor foreign keys (auth.users(id)) can populate.
// Mirrored users get a random unusable password and a confirmed email —
// nobody logs in through Supabase Auth.

import { randomBytes } from "node:crypto";

export type MirrorResult = { supabaseUserId: string; created: boolean };

function supabaseBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!raw) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function adminHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function findAuthUserByEmail(
  base: string,
  headers: Record<string, string>,
  email: string,
): Promise<string | null> {
  // GoTrue admin list endpoint has no reliable email filter across versions;
  // paginate and match locally. Fine at agency scale.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `${base}/auth/v1/admin/users?page=${page}&per_page=1000`,
      { headers },
    );
    if (!res.ok) {
      throw new Error(
        `Supabase auth user lookup failed (${res.status}): ${await res.text()}`,
      );
    }
    const body = (await res.json()) as {
      users?: Array<{ id: string; email?: string }>;
    };
    const users = body.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) return match.id;
    if (users.length < 1000) return null;
  }
  return null;
}

/**
 * Ensure a Supabase auth.users row exists for this email; returns its uuid.
 * Idempotent: re-running for an existing email returns the existing id.
 */
export async function ensureSupabaseAuthUser(email: string): Promise<MirrorResult> {
  const base = supabaseBaseUrl();
  const headers = adminHeaders();
  const normalized = email.trim().toLowerCase();

  const create = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: normalized,
      email_confirm: true,
      // Random throwaway — Supabase Auth is never a login path here.
      password: randomBytes(24).toString("base64url"),
    }),
  });

  if (create.ok) {
    const body = (await create.json()) as { id?: string };
    if (!body.id) {
      throw new Error("Supabase auth user create returned no id");
    }
    return { supabaseUserId: body.id, created: true };
  }

  if (create.status === 422 || create.status === 409) {
    // Already registered — resolve to the existing row.
    const existing = await findAuthUserByEmail(base, headers, normalized);
    if (existing) return { supabaseUserId: existing, created: false };
    throw new Error(
      `Supabase auth reports ${normalized} already registered but the user was not found via admin list`,
    );
  }

  throw new Error(
    `Supabase auth user create failed (${create.status}): ${await create.text()}`,
  );
}
