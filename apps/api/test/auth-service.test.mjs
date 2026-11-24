import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../dist/auth/auth.service.js";
import { createLegacyScryptHashForTest } from "./legacy-password-helper.mjs";
import { hashRefreshToken } from "../dist/auth/token.js";

process.env.ACCESS_TOKEN_SECRET =
  "test-access-token-secret-should-be-at-least-32-bytes-long";
process.env.REFRESH_TOKEN_PEPPER =
  "test-refresh-token-pepper-should-be-different-and-at-least-32-bytes";

const account = {
  id: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  authVersion: 4,
  status: "ACTIVE",
  passwordHash: null,
  person: {
    givenName: "Amina",
    familyName: "Example",
    displayName: "Amina Example",
  },
};

test("successful legacy login upgrades the password hash to Argon2id", async () => {
  const legacyHash = await createLegacyScryptHashForTest("legacy account password");
  const accountRecord = { ...account, passwordHash: legacyHash };
  const updates = [];
  const created = [];
  const client = {
    loginIdentifier: {
      findUnique: async () => ({ verifiedAt: new Date(), account: accountRecord }),
    },
    userAccount: {
      updateMany: async (input) => { updates.push(input); return { count: 1 }; },
      update: async (input) => input,
    },
    refreshToken: {
      create: async (input) => { created.push(input); return input; },
    },
    auditEvent: { create: async (input) => input },
    $transaction: async (operations) => Promise.all(operations),
  };

  const service = new AuthService({ client });
  const result = await service.login(" AMINA@EXAMPLE.ORG ", "legacy account password");

  assert.equal(result.user.accountId, account.id);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.passwordHash, legacyHash);
  assert.match(updates[0].data.passwordHash, /^\$argon2id\$/);
  assert.equal(created.length, 1);
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.ok(result.csrfToken);
});

test("refresh-token replay revokes the whole token family and bumps auth version", async () => {
  const revoked = [];
  const accountUpdates = [];
  const audits = [];
  const current = {
    id: "33333333-3333-4333-8333-333333333333",
    familyId: "44444444-4444-4444-8444-444444444444",
    accountId: account.id,
    revokedAt: new Date(),
    account,
  };
  const client = {
    refreshToken: {
      findUnique: async () => current,
      updateMany: async (input) => { revoked.push(input); return { count: 1 }; },
    },
    userAccount: {
      update: async (input) => { accountUpdates.push(input); return input; },
    },
    auditEvent: {
      create: async (input) => { audits.push(input); return input; },
    },
    $transaction: async (operations) => Promise.all(operations),
  };

  const service = new AuthService({ client });
  await assert.rejects(
    service.refresh("replayed-refresh-token"),
    (error) => error.status === 401 && /reuse detected/.test(error.message),
  );

  assert.equal(revoked[0].where.familyId, current.familyId);
  assert.equal(revoked[0].where.revokedAt, null);
  assert.deepEqual(accountUpdates[0].data.authVersion, { increment: 1 });
  assert.equal(audits[0].data.action, "AUTH_REFRESH_REPLAY_DETECTED");
  assert.equal(audits[0].data.decision, "DENY");
});

test("refresh rotates a one-time token and persists only its keyed hash", async () => {
  const now = new Date();
  const current = {
    id: "55555555-5555-4555-8555-555555555555",
    familyId: "66666666-6666-4666-8666-666666666666",
    accountId: account.id,
    revokedAt: null,
    expiresAt: new Date(now.getTime() + 60_000),
    account,
  };
  let consumed;
  let replacement;
  const tx = {
    refreshToken: {
      updateMany: async (input) => { consumed = input; return { count: 1 }; },
      create: async (input) => { replacement = input; return input; },
    },
  };
  const client = {
    refreshToken: { findUnique: async () => current },
    $transaction: async (callback) => callback(tx),
  };

  const service = new AuthService({ client });
  const result = await service.refresh("current-refresh-token");

  assert.equal(consumed.where.id, current.id);
  assert.equal(consumed.where.revokedAt, null);
  assert.equal(replacement.data.familyId, current.familyId);
  assert.equal(replacement.data.accountId, account.id);
  assert.equal(replacement.data.tokenHash, hashRefreshToken(result.refreshToken));
  assert.notEqual(replacement.data.tokenHash, result.refreshToken);
  assert.ok(result.accessToken);
  assert.ok(result.csrfToken);
});


test("logout revokes only the current refresh-token family", async () => {
  const revoked = [];
  const audits = [];
  const current = {
    accountId: account.id,
    familyId: "77777777-7777-4777-8777-777777777777",
  };
  const client = {
    refreshToken: {
      findUnique: async () => current,
      updateMany: async (input) => { revoked.push(input); return { count: 1 }; },
    },
    auditEvent: { create: async (input) => { audits.push(input); return input; } },
    $transaction: async (operations) => Promise.all(operations),
  };

  await new AuthService({ client }).logout(account.id, "current-device-token");
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0].where.familyId, current.familyId);
  assert.equal(revoked[0].where.accountId, account.id);
  assert.equal(audits[0].data.action, "AUTH_LOGOUT");
});

test("logout-all revokes every refresh token and invalidates access tokens", async () => {
  const revoked = [];
  const accountUpdates = [];
  const audits = [];
  const client = {
    refreshToken: { updateMany: async (input) => { revoked.push(input); return { count: 2 }; } },
    userAccount: { update: async (input) => { accountUpdates.push(input); return input; } },
    auditEvent: { create: async (input) => { audits.push(input); return input; } },
    $transaction: async (operations) => Promise.all(operations),
  };

  await new AuthService({ client }).logoutAll(account.id);
  assert.equal(revoked[0].where.accountId, account.id);
  assert.deepEqual(accountUpdates[0].data.authVersion, { increment: 1 });
  assert.equal(audits[0].data.action, "AUTH_LOGOUT_ALL");
});
