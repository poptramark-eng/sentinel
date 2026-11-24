import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import {
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

// OWASP's minimum recommended Argon2id profile: 19 MiB, t=2, p=1.
// Re-benchmark on production hardware before raising this cost.
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

interface LegacyScryptOptions {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

const LEGACY_SCRYPT = {
  N: 32_768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} satisfies LegacyScryptOptions;

function deriveLegacyKey(
  password: string,
  salt: Buffer,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, LEGACY_SCRYPT, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

async function verifyLegacyScrypt(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] =
    encoded.split("$");

  if (
    algorithm !== "scrypt" ||
    cost !== String(LEGACY_SCRYPT.N) ||
    blockSize !== String(LEGACY_SCRYPT.r) ||
    parallelization !== String(LEGACY_SCRYPT.p) ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await deriveLegacyKey(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (encoded.startsWith("$argon2id$")) {
    try {
      return await argon2Verify(encoded, password);
    } catch {
      return false;
    }
  }

  // One-time compatibility path for hashes created by the initial Sentinel
  // prototype. Successful logins are upgraded to Argon2id by AuthService.
  return verifyLegacyScrypt(password, encoded);
}

export function needsPasswordRehash(encoded: string): boolean {
  return !encoded.startsWith("$argon2id$");
}
