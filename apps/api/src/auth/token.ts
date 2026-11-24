import {
  createHmac,
  randomUUID,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export interface AccessClaims {
  sub: string;
  personId: string;
  av: number;
  iss: string;
  aud: string;
  jti: string;
  iat: number;
  exp: number;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function secretValue(): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("ACCESS_TOKEN_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

function signature(input: string): Buffer {
  return createHmac("sha256", secretValue()).update(input).digest();
}

export function signAccessToken(
  accountId: string,
  personId: string,
  authVersion: number,
  now = Math.floor(Date.now() / 1000),
): string {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(
    JSON.stringify({
      sub: accountId,
      personId,
      av: authVersion,
      iss: "sentinel-api",
      aud: "sentinel-web",
      jti: randomUUID(),
      iat: now,
      exp: now + 10 * 60,
    } satisfies AccessClaims),
  );
  const input = `${header}.${payload}`;
  return `${input}.${signature(input).toString("base64url")}`;
}

export function verifyAccessToken(
  token: string,
  now = Math.floor(Date.now() / 1000),
): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return null;

  try {
    const header = JSON.parse(
      Buffer.from(headerPart, "base64url").toString("utf8"),
    ) as { alg?: string; typ?: string };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const input = `${headerPart}.${payloadPart}`;
    const expected = signature(input);
    const actual = Buffer.from(signaturePart, "base64url");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return null;
    }

    const claims = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as AccessClaims;

    if (
      typeof claims.sub !== "string" ||
      typeof claims.personId !== "string" ||
      !Number.isInteger(claims.av) ||
      claims.iss !== "sentinel-api" ||
      claims.aud !== "sentinel-web" ||
      typeof claims.jti !== "string" ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= now ||
      claims.iat > now + 60
    ) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

export function createEmailVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEmailVerificationToken(token: string): string {
  const pepper = process.env.REFRESH_TOKEN_PEPPER;
  if (!pepper || Buffer.byteLength(pepper) < 32) {
    throw new Error("REFRESH_TOKEN_PEPPER must contain at least 32 bytes.");
  }
  return createHmac("sha256", pepper)
    .update(`email-verification:${token}`)
    .digest("hex");
}

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  const pepper = process.env.REFRESH_TOKEN_PEPPER;
  if (!pepper || Buffer.byteLength(pepper) < 32) {
    throw new Error("REFRESH_TOKEN_PEPPER must contain at least 32 bytes.");
  }
  return createHmac("sha256", pepper)
    .update(`refresh:${token}`)
    .digest("hex");
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}
