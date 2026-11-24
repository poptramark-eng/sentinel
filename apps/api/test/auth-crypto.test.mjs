import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  needsPasswordRehash,
  verifyPassword,
} from "../dist/auth/password.js";
import { createLegacyScryptHashForTest } from "./legacy-password-helper.mjs";
import {
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../dist/auth/token.js";
import {
  clearAuthCookies,
  hasValidCsrf,
  setAuthCookies,
} from "../dist/auth/cookie.js";

process.env.ACCESS_TOKEN_SECRET =
  "test-access-token-secret-should-be-at-least-32-bytes-long";
process.env.REFRESH_TOKEN_PEPPER =
  "test-refresh-token-pepper-should-be-different-and-at-least-32-bytes";
process.env.WEB_ORIGIN = "http://localhost:3000";

test("password hashes verify only the original password", async () => {
  const encoded = await hashPassword("correct horse battery staple");
  assert.match(encoded, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(
    await verifyPassword("correct horse battery staple", encoded),
    true,
  );
  assert.equal(await verifyPassword("incorrect password", encoded), false);
});


test("legacy scrypt hashes verify and are marked for Argon2id upgrade", async () => {
  const legacy = await createLegacyScryptHashForTest("legacy account password");
  assert.equal(await verifyPassword("legacy account password", legacy), true);
  assert.equal(await verifyPassword("wrong password", legacy), false);
  assert.equal(needsPasswordRehash(legacy), true);

  const current = await hashPassword("new account password");
  assert.equal(needsPasswordRehash(current), false);
});

test("access JWT validates signature, issuer, audience and expiry", () => {
  const token = signAccessToken(
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    3,
    1_800_000_000,
  );
  const claims = verifyAccessToken(token, 1_800_000_100);

  assert.ok(claims);
  assert.equal(claims.sub, "11111111-1111-4111-8111-111111111111");
  assert.equal(claims.iss, "sentinel-api");
  assert.equal(claims.aud, "sentinel-web");
  assert.equal(
    verifyAccessToken(token, 1_800_000_700),
    null,
  );

  const tokenParts = token.split(".");
  const signature = tokenParts[2] ?? "";
  tokenParts[2] = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
  assert.equal(verifyAccessToken(tokenParts.join("."), 1_800_000_100), null);
});

test("refresh tokens are high entropy and stored as keyed hashes", () => {
  const token = createRefreshToken();
  assert.ok(token.length >= 40);
  assert.equal(hashRefreshToken(token), hashRefreshToken(token));
  assert.notEqual(hashRefreshToken(token), hashRefreshToken(createRefreshToken()));
});

test("CSRF requires matching token and exact trusted origin", () => {
  const request = {
    headers: {
      cookie: "cbe_csrf=csrf-value",
      "x-csrf-token": "csrf-value",
      origin: "http://localhost:3000",
    },
  };
  assert.equal(hasValidCsrf(request), true);
  assert.equal(
    hasValidCsrf({
      headers: {
        ...request.headers,
        origin: "https://attacker.example",
      },
    }),
    false,
  );
  assert.equal(
    hasValidCsrf({
      headers: {
        ...request.headers,
        "x-csrf-token": "different",
      },
    }),
    false,
  );
});


test("production auth cookies use secure, scoped attributes", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const writes = [];
  const reply = { header: (name, value) => writes.push({ name, value }) };

  try {
    setAuthCookies(reply, "access", "refresh", "csrf");
    const cookies = writes[0].value;
    assert.equal(cookies.length, 3);
    assert.match(cookies[0], /^cbe_access=access;/);
    assert.match(cookies[0], /Path=\/api;/);
    assert.match(cookies[0], /HttpOnly/);
    assert.match(cookies[0], /Secure/);
    assert.match(cookies[0], /SameSite=Lax/);
    assert.match(cookies[1], /Path=\/api\/auth;/);
    assert.match(cookies[1], /Max-Age=2592000/);
    assert.match(cookies[1], /HttpOnly/);
    assert.doesNotMatch(cookies[2], /HttpOnly/);
    assert.match(cookies[2], /Secure/);

    clearAuthCookies(reply);
    const cleared = writes[1].value;
    assert.equal(cleared.length, 3);
    assert.ok(cleared.every((cookie) => /Max-Age=0/.test(cookie)));
    assert.match(cleared[1], /Path=\/api\/auth;/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
