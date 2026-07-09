import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM encryption for Meta user access tokens at rest.
 * Key material comes from TOKEN_ENCRYPTION_KEY (any sufficiently long random
 * string; hashed to a 32-byte key). Ciphertext format: iv.tag.data (base64url).
 * Tokens are never stored or logged in plaintext.
 */

function getKey(): Buffer {
  const secret = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!secret || secret.length < 16) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured (need a random string, 16+ chars).");
  }
  return createHash("sha256").update(secret).digest();
}

export function isTokenEncryptionConfigured(): boolean {
  const secret = process.env["TOKEN_ENCRYPTION_KEY"];
  return typeof secret === "string" && secret.length >= 16;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptToken(ciphertext: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted token.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Signed OAuth state parameter: binds the OAuth round-trip to the logged-in
 * Metrix user and expires after 15 minutes. Format: payloadB64.sigB64 where
 * payload = JSON {u: userId, n: nonce, t: issuedAtMs}.
 */

function getStateSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return secret;
}

export function createOauthState(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, n: randomBytes(8).toString("hex"), t: Date.now() }),
  ).toString("base64url");
  const sig = createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

const STATE_MAX_AGE_MS = 15 * 60 * 1000;

export function verifyOauthState(state: string, expectedUserId: number): boolean {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", getStateSecret()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: unknown;
      t?: unknown;
    };
    if (parsed.u !== expectedUserId) return false;
    if (typeof parsed.t !== "number" || Date.now() - parsed.t > STATE_MAX_AGE_MS) return false;
    return true;
  } catch {
    return false;
  }
}
