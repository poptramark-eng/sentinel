import { createPrismaClient } from "@cbe/database";
import { hashPassword } from "../auth/password";

async function bootstrapPlatformAdministrator(): Promise<void> {
  const givenName = process.env.BOOTSTRAP_ADMIN_GIVEN_NAME?.trim();
  const familyName = process.env.BOOTSTRAP_ADMIN_FAMILY_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!givenName || !familyName || !email || !password) {
    throw new Error(
      "Set BOOTSTRAP_ADMIN_GIVEN_NAME, BOOTSTRAP_ADMIN_FAMILY_NAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.",
    );
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error("Bootstrap password must be between 12 and 128 characters.");
  }

  const database = createPrismaClient();
  try {
    const existingOperator = await database.client.platformOperator.count({
      where: { status: "ACTIVE" },
    });
    if (existingOperator > 0) {
      throw new Error(
        "An active PlatformAdministrator already exists. Refusing bootstrap; use the controlled operator-provisioning procedure.",
      );
    }

    const existingIdentifier = await database.client.loginIdentifier.findUnique({
      where: {
        type_normalizedValue: {
          type: "EMAIL",
          normalizedValue: email,
        },
      },
    });
    if (existingIdentifier) {
      throw new Error("The bootstrap email is already assigned to an account.");
    }

    const passwordHash = await hashPassword(password);
    const account = await database.client.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: { givenName, familyName },
      });

      const userAccount = await tx.userAccount.create({
        data: {
          personId: person.id,
          status: "ACTIVE",
          passwordHash,
          loginIdentifiers: {
            create: {
              type: "EMAIL",
              normalizedValue: email,
              verifiedAt: new Date(),
            },
          },
        },
      });

      await tx.platformOperator.create({
        data: {
          accountId: userAccount.id,
          role: "PLATFORM_ADMINISTRATOR",
          status: "ACTIVE",
        },
      });

      await tx.auditEvent.create({
        data: {
          actorAccountId: userAccount.id,
          action: "PLATFORM_OPERATOR_BOOTSTRAPPED",
          resourceType: "PlatformOperator",
          resourceId: userAccount.id,
          decision: "ALLOW",
        },
      });

      return userAccount;
    });

    process.stdout.write(
      `PlatformAdministrator created. Account ID: ${account.id}; email: ${email}\n`,
    );
  } finally {
    await database.disconnect();
  }
}

void bootstrapPlatformAdministrator().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown bootstrap error.";
  process.stderr.write(`PlatformAdministrator bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
