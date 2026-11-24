import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
} from "../dist/auth/password.js";
import {
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../dist/auth/token.js";
import { hasValidCsrf } from "../dist/auth/cookie.js";

process.env.ACCESS_TOKEN_SECRET =
  "test-access-token-secret-should-be-at-least-32-bytes-long";
process.env.REFRESH_TOKEN_PEPPER =
  "test-refresh-token-pepper-should-be-different-and-at-least-32-bytes";
process.env.WEB_ORIGIN = "http://localhost:3000";

test("password hashes verify only the original password", async () => {
  const encoded = await hashPassword("correct horse battery staple");
  assert.match(encoded, /^scrypt\$32768\$8\$1\$/);
  assert.equal(
    await verifyPassword("correct horse battery staple", encoded),
    true,
  );
  assert.equal(await verifyPassword("incorrect password", encoded), false);
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

  const tampered = token.replace("sentinel-web", "other-audience");
  assert.equal(verifyAccessToken(tampered, 1_800_000_100), null);
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
