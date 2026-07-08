import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const BCRYPT_ROUNDS = 12;

// A hash of a random unguessable value, used to equalize timing when the
// email is unknown (bcrypt.compare always runs against something).
const DUMMY_HASH = bcrypt.hashSync("metrix-dummy-password-never-matches", BCRYPT_ROUNDS);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  const result = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && result;
}

// Unambiguous alphabet: no 0/O, 1/l/I, etc.
const TEMP_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ2345679";

export function generateTempPassword(length = 14): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}
