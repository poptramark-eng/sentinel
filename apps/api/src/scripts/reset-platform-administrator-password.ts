import { createPrismaClient } from "@cbe/database";
import { hashPassword } from "../auth/password";

/**
 * One-time recovery for an existing, active Platform Administrator.
 *
 * Required environment:
 *   DATABASE_URL
 *   RESET_ADMIN_EMAIL
 *   RESET_ADMIN_PASSWORD
 *
 * This script never creates an account or changes a login identifier.
 */
async function resetPlatformAdministratorPassword(): Promise<void> {
  const email = process.env.RESET_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.RESET_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set RESET_ADMIN_EMAIL and RESET_ADMIN_PASSWORD in the process environment.",
    );
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error("Password must be between 12 and 128 characters.");
  }
  if (/\s/.test(password)) {
    throw new Error("Password must not contain whitespace.");
  }

  const database = createPrismaClient();

  try {
    // Hash before opening the transaction; never log or persist the plaintext.
    const passwordHash = await hashPassword(password);

    const result = await database.client.$transaction(async (tx) => {
      const identifiers = await tx.loginIdentifier.findMany({
        where: {
          type: "EMAIL",
          normalizedValue: email,
          verifiedAt: { not: null },
        },
        include: {
          account: {
            include: { platformOperator: true },
          },
        },
      });

      const identifier = identifiers[0];
      if (identifiers.length !== 1 || !identifier) {
        throw new Error(
          "Expected exactly one account with this verified email. No changes made.",
        );
      }

      const account = identifier.account;
      const operator = account.platformOperator;

      if (
        account.status !== "ACTIVE" ||
        !operator ||
        operator.status !== "ACTIVE" ||
        operator.role !== "PLATFORM_ADMINISTRATOR"
      ) {
        throw new Error(
          "The matching account is not an active Platform Administrator. No changes made.",
        );
      }

      const updated = await tx.userAccount.updateMany({
        where: {
          id: account.id,
          status: "ACTIVE",
        },
        data: {
          passwordHash,
          authVersion: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new Error("Account changed during recovery. No changes made.");
      }

      const revoked = await tx.refreshToken.updateMany({
        where: {
          accountId: account.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await tx.auditEvent.create({
        data: {
          actorAccountId: account.id,
          action: "AUTH_PASSWORD_RESET",
          resourceType: "UserAccount",
          resourceId: account.id,
          decision: "ALLOW",
          reason: "Owner-requested recovery of existing Platform Administrator credentials",
          metadata: {
            method: "one_time_recovery_script",
            refreshTokensRevoked: revoked.count,
          },
        },
      });

      return { refreshTokensRevoked: revoked.count };
    });

    process.stdout.write(
      `Password reset completed for ${email}. ${result.refreshTokensRevoked} active refresh token(s) revoked.\n`,
    );
  } finally {
    await database.disconnect();
  }
}

void resetPlatformAdministratorPassword().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown password recovery error.";
  process.stderr.write(`Platform Administrator password reset failed: ${message}\n`);
  process.exitCode = 1;
});
