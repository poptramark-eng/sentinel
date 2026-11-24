import { randomBytes, scrypt as scryptCallback } from "node:crypto";

export async function createLegacyScryptHashForTest(password) {
  const salt = randomBytes(16);
  const derived = await new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      64,
      { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key),
    );
  });
  return ["scrypt", 32_768, 8, 1, salt.toString("base64url"), derived.toString("base64url")].join("$");
}
