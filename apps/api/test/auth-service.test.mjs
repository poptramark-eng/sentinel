import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../dist/auth/auth.service.js";
import { createLegacyScryptHashForTest } from "./legacy-password-helper.mjs";
import { hashEmailVerificationToken, hashPasswordResetToken, hashRefreshToken } from "../dist/auth/token.js";

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


test("registration creates a pending account without assigning a school role", async () => {
  const created = { person: null, account: null, identifier: null, verification: null, email: null };
  const tx = {
    loginIdentifier: {
      findUnique: async () => null,
      create: async ({ data }) => { created.identifier = data; return { id: "88888888-8888-4888-8888-888888888888" }; },
    },
    person: {
      create: async ({ data }) => { created.person = data; return { id: "99999999-9999-4999-8999-999999999999", givenName: data.givenName }; },
    },
    userAccount: {
      create: async ({ data }) => { created.account = data; return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }; },
    },
    emailVerificationToken: {
      create: async ({ data }) => { created.verification = data; return data; },
    },
    auditEvent: { create: async ({ data }) => data },
  };
  const client = { $transaction: async (callback) => callback(tx) };
  const emailService = {
    sendVerificationEmail: async (email, givenName, token) => {
      created.email = { email, givenName, token };
      return { previewUrl: `http://localhost:3000/verify-email?token=${token}` };
    },
  };
  const service = new AuthService({ client }, emailService);
  const result = await service.register({
    givenName: " Amina ",
    familyName: " Example ",
    email: " AMINA@EXAMPLE.ORG ",
    password: "a-strong-test-password",
  });

  assert.equal(created.person.givenName, "Amina");
  assert.equal(created.person.familyName, "Example");
  assert.equal(created.account.status, "PENDING_VERIFICATION");
  assert.equal(created.identifier.normalizedValue, "amina@example.org");
  assert.equal(created.identifier.type, "EMAIL");
  assert.equal(created.verification.tokenHash, hashEmailVerificationToken(created.email.token));
  assert.equal(created.email.email, "amina@example.org");
  assert.equal(result.status, "VERIFICATION_REQUIRED");
  assert.ok(result.verificationPreviewUrl);
});

test("email delivery failure does not reveal registration eligibility", async () => {
  const created = [];
  const tx = {
    loginIdentifier: {
      findUnique: async () => null,
      create: async () => ({ id: "88888888-8888-4888-8888-888888888888" }),
    },
    person: {
      create: async ({ data }) => ({ id: "99999999-9999-4999-8999-999999999999", givenName: data.givenName }),
    },
    userAccount: {
      create: async ({ data }) => { created.push(data); return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }; },
    },
    emailVerificationToken: { create: async () => ({}) },
    auditEvent: { create: async () => ({}) },
  };
  const service = new AuthService(
    { client: { $transaction: async (callback) => callback(tx) } },
    { sendVerificationEmail: async () => { throw new Error("provider unavailable"); } },
  );

  const result = await service.register({
    givenName: "Amina",
    familyName: "Example",
    email: "new@example.org",
    password: "a-strong-test-password",
  });

  assert.equal(created[0].status, "PENDING_VERIFICATION");
  assert.deepEqual(result, {
    status: "VERIFICATION_REQUIRED",
    message: "If this email address can be registered, a verification link will be sent.",
  });
});

test("duplicate registration does not reveal an existing account or send another email", async () => {
  let sent = false;
  const client = {
    $transaction: async (callback) => callback({
      loginIdentifier: { findUnique: async () => ({ id: "existing-identifier" }) },
    }),
  };
  const emailService = { sendVerificationEmail: async () => { sent = true; return {}; } };
  const result = await new AuthService({ client }, emailService).register({
    givenName: "Amina",
    familyName: "Example",
    email: "existing@example.org",
    password: "a-strong-test-password",
  });
  assert.equal(result.status, "VERIFICATION_REQUIRED");
  assert.equal(sent, false);
});

test("email verification consumes the token and activates the pending account", async () => {
  const rawToken = "a".repeat(43);
  const updates = [];
  const audits = [];
  const record = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    accountId: account.id,
    loginIdentifierId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    account: { ...account, status: "PENDING_VERIFICATION" },
    loginIdentifier: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", type: "EMAIL", verifiedAt: null },
  };
  const tx = {
    emailVerificationToken: { updateMany: async (input) => { updates.push(input); return { count: 1 }; } },
    loginIdentifier: { updateMany: async (input) => { updates.push(input); return { count: 1 }; } },
    userAccount: { updateMany: async (input) => { updates.push(input); return { count: 1 }; } },
    auditEvent: { create: async (input) => { audits.push(input); return input; } },
  };
  const client = {
    emailVerificationToken: { findUnique: async () => record },
    $transaction: async (callback) => callback(tx),
  };

  const result = await new AuthService({ client }, {}).verifyEmail(rawToken);
  assert.deepEqual(result, { status: "EMAIL_VERIFIED" });
  assert.equal(updates.length, 3);
  assert.equal(updates[0].where.id, record.id);
  assert.equal(updates[2].where.status, "PENDING_VERIFICATION");
  assert.equal(audits[0].data.action, "AUTH_EMAIL_VERIFIED");
});

test("resending verification invalidates older tokens before issuing a new one", async () => {
  const operations = [];
  const identifier = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    accountId: account.id,
    normalizedValue: "amina@example.org",
    type: "EMAIL",
    verifiedAt: null,
    account: { ...account, status: "PENDING_VERIFICATION", person: { givenName: "Amina" } },
  };
  const tx = {
    loginIdentifier: { findUnique: async () => identifier },
    emailVerificationToken: {
      updateMany: async (input) => { operations.push(input); return { count: 1 }; },
      create: async (input) => { operations.push(input); return input; },
    },
    auditEvent: { create: async (input) => { operations.push(input); return input; } },
  };
  const client = {
    loginIdentifier: { findUnique: async () => identifier },
    $transaction: async (callback) => callback(tx),
  };
  const sent = [];
  const emailService = { sendVerificationEmail: async (...args) => { sent.push(args); return {}; } };
  const result = await new AuthService({ client }, emailService).resendVerification("AMINA@EXAMPLE.ORG");

  assert.equal(result.status, "VERIFICATION_REQUIRED");
  assert.equal(operations[0].where.loginIdentifierId, identifier.id);
  assert.equal(operations[0].data.consumedAt instanceof Date, true);
  assert.equal(sent[0][0], "amina@example.org");
  assert.equal(operations[1].data.tokenHash, hashEmailVerificationToken(sent[0][2]));
});


test("password reset requests use generic responses and persist only a keyed one-time token", async () => {
  const identifier = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    accountId: account.id,
    type: "EMAIL",
    verifiedAt: new Date(),
    account: { ...account, status: "ACTIVE", person: { givenName: "Amina" } },
  };
  const operations = [];
  const tx = {
    loginIdentifier: { findUnique: async () => identifier },
    passwordResetToken: {
      updateMany: async (input) => { operations.push({ update: input }); return { count: 1 }; },
      create: async (input) => { operations.push({ create: input }); return input; },
    },
    auditEvent: { create: async (input) => { operations.push({ audit: input }); return input; } },
  };
  const client = {
    loginIdentifier: { findUnique: async () => identifier },
    $transaction: async (callback) => callback(tx),
  };
  const sent = [];
  const emailService = {
    sendPasswordResetEmail: async (...args) => { sent.push(args); return {}; },
  };
  const result = await new AuthService({ client }, emailService).requestPasswordReset(" AMINA@EXAMPLE.ORG ");

  assert.equal(result.status, "RESET_REQUESTED");
  assert.equal(result.passwordResetPreviewUrl, undefined);
  assert.equal(sent[0][0], "amina@example.org");
  assert.equal(operations[0].update.where.loginIdentifierId, identifier.id);
  assert.equal(operations[1].create.data.tokenHash, hashPasswordResetToken(sent[0][2]));
  assert.equal(operations[1].create.data.expiresAt.getTime() - Date.now() <= 30 * 60 * 1000, true);
  assert.equal(operations[2].audit.data.action, "AUTH_PASSWORD_RESET_REQUESTED");
});

test("password reset request does not disclose unknown or unverified accounts", async () => {
  let sent = false;
  const client = {
    loginIdentifier: { findUnique: async () => null },
  };
  const result = await new AuthService(
    { client },
    { sendPasswordResetEmail: async () => { sent = true; return {}; } },
  ).requestPasswordReset("unknown@example.org");
  assert.deepEqual(result, {
    status: "RESET_REQUESTED",
    message: "If an active verified account exists for this email address, a password reset link will be sent.",
  });
  assert.equal(sent, false);
});

test("password reset consumes the token, changes the password and revokes every session", async () => {
  const rawToken = "r".repeat(43);
  const record = {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    accountId: account.id,
    loginIdentifierId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    account: { ...account, status: "ACTIVE", authVersion: 4 },
    loginIdentifier: { type: "EMAIL", verifiedAt: new Date() },
  };
  const calls = [];
  const tx = {
    passwordResetToken: {
      updateMany: async (input) => { calls.push({ resetToken: input }); return { count: 1 }; },
    },
    userAccount: {
      updateMany: async (input) => { calls.push({ account: input }); return { count: 1 }; },
    },
    refreshToken: {
      updateMany: async (input) => { calls.push({ refresh: input }); return { count: 2 }; },
    },
    auditEvent: {
      create: async (input) => { calls.push({ audit: input }); return input; },
    },
  };
  const client = {
    passwordResetToken: { findUnique: async ({ where }) => {
      assert.equal(where.tokenHash, hashPasswordResetToken(rawToken));
      return record;
    } },
    $transaction: async (callback) => callback(tx),
  };

  const result = await new AuthService({ client }, {}).resetPassword(rawToken, "new-strong-password-2026");
  assert.deepEqual(result, { status: "PASSWORD_RESET" });
  assert.equal(calls[0].resetToken.where.id, record.id);
  assert.equal(calls[1].account.where.authVersion, 4);
  assert.equal(calls[1].account.data.authVersion.increment, 1);
  assert.match(calls[1].account.data.passwordHash, /^\\$argon2id\\$/);
  assert.equal(calls[2].refresh.where.accountId, account.id);
  assert.equal(calls[3].audit.data.action, "AUTH_PASSWORD_RESET_COMPLETED");
});

test("expired, consumed and replayed password reset tokens are rejected", async () => {
  const rawToken = "x".repeat(43);
  const base = {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    accountId: account.id,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    account: { ...account, status: "ACTIVE" },
    loginIdentifier: { type: "EMAIL", verifiedAt: new Date() },
  };
  for (const token of [
    { ...base, consumedAt: new Date() },
    { ...base, expiresAt: new Date(Date.now() - 1) },
    { ...base, account: { ...account, status: "INACTIVE" } },
    { ...base, loginIdentifier: { type: "EMAIL", verifiedAt: null } },
  ]) {
    const client = { passwordResetToken: { findUnique: async () => token } };
    await assert.rejects(
      new AuthService({ client }, {}).resetPassword(rawToken, "new-strong-password-2026"),
      (error) => error.getStatus() === 400,
    );
  }
});
