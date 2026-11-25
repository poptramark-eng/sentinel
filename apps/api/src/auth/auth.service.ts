import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { hashPassword, needsPasswordRehash, verifyPassword } from "./password";
import { EmailService } from "./email.service";
import { RegisterDto } from "./auth.dto";
import {
  createCsrfToken,
  createEmailVerificationToken,
  createPasswordResetToken,
  createRefreshToken,
  hashEmailVerificationToken,
  hashPasswordResetToken,
  hashRefreshToken,
  hashTeacherInvitationToken,
  signAccessToken,
} from "./token";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const GENERIC_PASSWORD_RESET_RESPONSE = {
  status: "RESET_REQUESTED",
  message: "If an active verified account exists for this email address, a password reset link will be sent.",
} as const;
const GENERIC_VERIFICATION_RESPONSE = {
  status: "VERIFICATION_REQUIRED",
  message: "If this email address can be registered, a verification link will be sent.",
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly dummyHash = hashPassword("sentinel-dummy-password-not-a-user");

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async register(input: RegisterDto) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    const rawToken = createEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(rawToken);
    let created: { accountId: string; givenName: string } | null = null;

    try {
      created = await this.prisma.client.$transaction(
        async (tx) => {
          const existing = await tx.loginIdentifier.findUnique({
            where: {
              type_normalizedValue: {
                type: "EMAIL",
                normalizedValue: normalizedEmail,
              },
            },
            select: { id: true },
          });
          if (existing) return null;

          const person = await tx.person.create({
            data: {
              givenName: input.givenName.trim(),
              familyName: input.familyName.trim(),
            },
            select: { id: true, givenName: true },
          });
          const account = await tx.userAccount.create({
            data: {
              personId: person.id,
              status: "PENDING_VERIFICATION",
              passwordHash,
            },
            select: { id: true },
          });
          const identifier = await tx.loginIdentifier.create({
            data: {
              accountId: account.id,
              type: "EMAIL",
              normalizedValue: normalizedEmail,
            },
            select: { id: true },
          });
          await tx.emailVerificationToken.create({
            data: {
              accountId: account.id,
              loginIdentifierId: identifier.id,
              tokenHash,
              expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
            },
          });
          await tx.auditEvent.create({
            data: {
              actorAccountId: account.id,
              action: "AUTH_ACCOUNT_REGISTERED",
              resourceType: "UserAccount",
              resourceId: account.id,
              decision: "ALLOW",
            },
          });
          return { accountId: account.id, givenName: person.givenName };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : null;
      if (code === "P2002" || code === "P2034") {
        return GENERIC_VERIFICATION_RESPONSE;
      }
      throw error;
    }

    if (!created) return GENERIC_VERIFICATION_RESPONSE;

    const delivery = await this.trySendVerificationEmail(
      normalizedEmail,
      created.givenName,
      rawToken,
    );
    return {
      ...GENERIC_VERIFICATION_RESPONSE,
      ...(delivery.previewUrl
        ? { verificationPreviewUrl: delivery.previewUrl }
        : {}),
    };
  }

  async resendVerification(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const identifier = await this.prisma.client.loginIdentifier.findUnique({
      where: {
        type_normalizedValue: {
          type: "EMAIL",
          normalizedValue: normalizedEmail,
        },
      },
      include: { account: { include: { person: true } } },
    });

    if (
      !identifier ||
      identifier.verifiedAt ||
      identifier.account.status !== "PENDING_VERIFICATION"
    ) {
      return GENERIC_VERIFICATION_RESPONSE;
    }

    const rawToken = createEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(rawToken);
    const now = new Date();
    let renewed: { accountId: string; givenName: string } | null;
    try {
      renewed = await this.prisma.client.$transaction(async (tx) => {
      const current = await tx.loginIdentifier.findUnique({
        where: { id: identifier.id },
        include: { account: { include: { person: true } } },
      });
      if (
        !current ||
        current.verifiedAt ||
        current.account.status !== "PENDING_VERIFICATION"
      ) {
        return null;
      }

      await tx.emailVerificationToken.updateMany({
        where: { loginIdentifierId: current.id, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.emailVerificationToken.create({
        data: {
          accountId: current.accountId,
          loginIdentifierId: current.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: current.accountId,
          action: "AUTH_EMAIL_VERIFICATION_RESENT",
          resourceType: "UserAccount",
          resourceId: current.accountId,
          decision: "ALLOW",
        },
      });
      return {
        accountId: current.accountId,
        givenName: current.account.person.givenName,
      };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : null;
      if (code === "P2002" || code === "P2034") {
        return GENERIC_VERIFICATION_RESPONSE;
      }
      throw error;
    }

    if (!renewed) return GENERIC_VERIFICATION_RESPONSE;
    const delivery = await this.trySendVerificationEmail(
      normalizedEmail,
      renewed.givenName,
      rawToken,
    );
    return {
      ...GENERIC_VERIFICATION_RESPONSE,
      ...(delivery.previewUrl
        ? { verificationPreviewUrl: delivery.previewUrl }
        : {}),
    };
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const identifier = await this.prisma.client.loginIdentifier.findUnique({
      where: {
        type_normalizedValue: {
          type: "EMAIL",
          normalizedValue: normalizedEmail,
        },
      },
      include: { account: { include: { person: true } } },
    });

    if (
      !identifier ||
      !identifier.verifiedAt ||
      identifier.account.status !== "ACTIVE"
    ) {
      return GENERIC_PASSWORD_RESET_RESPONSE;
    }

    const rawToken = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(rawToken);
    const now = new Date();
    let requested: { accountId: string; givenName: string } | null;
    try {
      requested = await this.prisma.client.$transaction(async (tx) => {
        const current = await tx.loginIdentifier.findUnique({
          where: { id: identifier.id },
          include: { account: { include: { person: true } } },
        });
        if (
          !current ||
          !current.verifiedAt ||
          current.type !== "EMAIL" ||
          current.account.status !== "ACTIVE"
        ) {
          return null;
        }

        await tx.passwordResetToken.updateMany({
          where: { loginIdentifierId: current.id, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.passwordResetToken.create({
          data: {
            accountId: current.accountId,
            loginIdentifierId: current.id,
            tokenHash,
            expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: current.accountId,
            action: "AUTH_PASSWORD_RESET_REQUESTED",
            resourceType: "UserAccount",
            resourceId: current.accountId,
            decision: "ALLOW",
          },
        });
        return {
          accountId: current.accountId,
          givenName: current.account.person.givenName,
        };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : null;
      if (code === "P2002" || code === "P2034") {
        return GENERIC_PASSWORD_RESET_RESPONSE;
      }
      throw error;
    }

    if (!requested) return GENERIC_PASSWORD_RESET_RESPONSE;
    try {
      const delivery = await this.emailService.sendPasswordResetEmail(
        normalizedEmail,
        requested.givenName,
        rawToken,
      );
      return {
        ...GENERIC_PASSWORD_RESET_RESPONSE,
        ...(delivery.previewUrl ? { passwordResetPreviewUrl: delivery.previewUrl } : {}),
      };
    } catch {
      this.logger.warn("Password reset email delivery failed; the generic response is preserved.");
      return GENERIC_PASSWORD_RESET_RESPONSE;
    }
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = hashPasswordResetToken(rawToken);
    const token = await this.prisma.client.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { account: true, loginIdentifier: true },
    });
    const now = new Date();
    if (
      !token ||
      token.consumedAt ||
      token.expiresAt <= now ||
      token.loginIdentifier.type !== "EMAIL" ||
      !token.loginIdentifier.verifiedAt ||
      token.account.status !== "ACTIVE"
    ) {
      throw new BadRequestException("Password reset link is invalid or expired.");
    }

    const passwordHash = await hashPassword(newPassword);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const consumed = await tx.passwordResetToken.updateMany({
          where: { id: token.id, accountId: token.accountId, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) {
          throw new BadRequestException("Password reset link is invalid or expired.");
        }

        const updated = await tx.userAccount.updateMany({
          where: { id: token.accountId, status: "ACTIVE", authVersion: token.account.authVersion },
          data: { passwordHash, authVersion: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new BadRequestException("Password reset link is invalid or expired.");
        }

        await tx.passwordResetToken.updateMany({
          where: { accountId: token.accountId, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.refreshToken.updateMany({
          where: { accountId: token.accountId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: token.accountId,
            action: "AUTH_PASSWORD_RESET_COMPLETED",
            resourceType: "UserAccount",
            resourceId: token.accountId,
            decision: "ALLOW",
          },
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : null;
      if (code === "P2034" || code === "P2002") {
        throw new BadRequestException("Password reset link is invalid or expired.");
      }
      throw error;
    }

    return { status: "PASSWORD_RESET" };
  }

  async acceptTeacherInvitation(rawToken: string, newPassword: string) {
    const tokenHash = hashTeacherInvitationToken(rawToken);
    const invitation = await this.prisma.client.teacherInvitationToken.findUnique({
      where: { tokenHash },
      include: {
        account: true,
        loginIdentifier: true,
        membership: {
          include: {
            registration: {
              include: { school: true, council: true },
            },
          },
        },
      },
    });
    const now = new Date();
    if (
      !invitation ||
      invitation.consumedAt ||
      invitation.expiresAt <= now ||
      invitation.account.status !== "PENDING_VERIFICATION" ||
      invitation.account.passwordHash !== null ||
      invitation.loginIdentifier.type !== "EMAIL" ||
      invitation.loginIdentifier.verifiedAt ||
      invitation.membership.role !== "TEACHER" ||
      invitation.membership.status !== "PENDING" ||
      invitation.membership.endsAt ||
      invitation.membership.registration.status !== "APPROVED" ||
      invitation.membership.registration.school.status !== "ACTIVE" ||
      invitation.membership.registration.council.status !== "ACTIVE"
    ) {
      throw new BadRequestException("Teacher invitation is invalid or expired.");
    }

    const passwordHash = await hashPassword(newPassword);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const consumed = await tx.teacherInvitationToken.updateMany({
          where: { id: invitation.id, accountId: invitation.accountId, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) {
          throw new BadRequestException("Teacher invitation is invalid or expired.");
        }

        const verified = await tx.loginIdentifier.updateMany({
          where: { id: invitation.loginIdentifierId, accountId: invitation.accountId, type: "EMAIL", verifiedAt: null },
          data: { verifiedAt: now },
        });
        if (verified.count !== 1) {
          throw new BadRequestException("Teacher invitation is invalid or expired.");
        }

        const activated = await tx.userAccount.updateMany({
          where: { id: invitation.accountId, status: "PENDING_VERIFICATION", passwordHash: null },
          data: { status: "ACTIVE", passwordHash, authVersion: { increment: 1 } },
        });
        if (activated.count !== 1) {
          throw new BadRequestException("Teacher invitation is invalid or expired.");
        }

        const membership = await tx.schoolMembership.updateMany({
          where: {
            id: invitation.membershipId,
            registrationId: invitation.registrationId,
            councilId: invitation.councilId,
            role: "TEACHER",
            status: "PENDING",
            endsAt: null,
          },
          data: { status: "ACTIVE", startsAt: now },
        });
        if (membership.count !== 1) {
          throw new BadRequestException("Teacher invitation is invalid or expired.");
        }

        await tx.teacherInvitationToken.updateMany({
          where: { accountId: invitation.accountId, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: invitation.accountId,
            councilId: invitation.councilId,
            action: "SCHOOL_TEACHER_INVITATION_ACCEPTED",
            resourceType: "SchoolMembership",
            resourceId: invitation.membershipId,
            decision: "ALLOW",
            metadata: { registrationId: invitation.registrationId, role: "TEACHER" },
          },
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : null;
      if (code === "P2034" || code === "P2002") {
        throw new BadRequestException("Teacher invitation is invalid or expired.");
      }
      throw error;
    }

    return { status: "TEACHER_INVITATION_ACCEPTED" };
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = hashEmailVerificationToken(rawToken);
    const token = await this.prisma.client.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { account: true, loginIdentifier: true },
    });
    const now = new Date();

    if (
      !token ||
      token.consumedAt ||
      token.expiresAt <= now ||
      token.loginIdentifier.type !== "EMAIL" ||
      token.loginIdentifier.verifiedAt ||
      token.account.status !== "PENDING_VERIFICATION"
    ) {
      throw new BadRequestException("Verification link is invalid or expired.");
    }

    await this.prisma.client.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException("Verification link is invalid or expired.");
      }

      const verified = await tx.loginIdentifier.updateMany({
        where: {
          id: token.loginIdentifierId,
          accountId: token.accountId,
          verifiedAt: null,
        },
        data: { verifiedAt: now },
      });
      if (verified.count !== 1) {
        throw new BadRequestException("Verification link is invalid or expired.");
      }

      const activated = await tx.userAccount.updateMany({
        where: { id: token.accountId, status: "PENDING_VERIFICATION" },
        data: { status: "ACTIVE" },
      });
      if (activated.count !== 1) {
        throw new BadRequestException("Verification link is invalid or expired.");
      }

      await tx.auditEvent.create({
        data: {
          actorAccountId: token.accountId,
          action: "AUTH_EMAIL_VERIFIED",
          resourceType: "UserAccount",
          resourceId: token.accountId,
          decision: "ALLOW",
        },
      });
    });

    return { status: "EMAIL_VERIFIED" };
  }

  private async trySendVerificationEmail(
    email: string,
    givenName: string,
    rawToken: string,
  ): Promise<{ previewUrl?: string }> {
    try {
      return await this.emailService.sendVerificationEmail(
        email,
        givenName,
        rawToken,
      );
    } catch {
      // Keep registration and resend responses indistinguishable for existing and
      // unknown addresses. The account remains pending and can request a new link.
      this.logger.warn(
        "Verification email delivery failed; the account remains pending.",
      );
      return {};
    }
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const identifier = await this.prisma.client.loginIdentifier.findUnique({
      where: {
        type_normalizedValue: {
          type: "EMAIL",
          normalizedValue: normalizedEmail,
        },
      },
      include: {
        account: {
          include: { person: true },
        },
      },
    });

    if (!identifier || !identifier.verifiedAt) {
      await verifyPassword(password, await this.dummyHash);
      throw new UnauthorizedException("Invalid email or password.");
    }

    const account = identifier.account;
    const valid = account.passwordHash
      ? await verifyPassword(password, account.passwordHash)
      : await verifyPassword(password, await this.dummyHash);

    if (!valid || account.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (account.passwordHash && needsPasswordRehash(account.passwordHash)) {
      const upgradedHash = await hashPassword(password);
      await this.prisma.client.userAccount.updateMany({
        where: { id: account.id, passwordHash: account.passwordHash },
        data: { passwordHash: upgradedHash },
      });
    }

    const refreshToken = createRefreshToken();
    const familyId = randomUUID();
    await this.prisma.client.$transaction([
      this.prisma.client.refreshToken.create({
        data: {
          accountId: account.id,
          familyId,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      }),
      this.prisma.client.auditEvent.create({
        data: {
          actorAccountId: account.id,
          action: "AUTH_LOGIN",
          resourceType: "UserAccount",
          resourceId: account.id,
          decision: "ALLOW",
        },
      }),
      this.prisma.client.userAccount.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return {
      accessToken: signAccessToken(
        account.id,
        account.personId,
        account.authVersion,
      ),
      refreshToken,
      csrfToken: this.createCsrfToken(),
      user: {
        accountId: account.id,
        personId: account.personId,
        givenName: account.person.givenName,
        familyName: account.person.familyName,
        displayName: account.person.displayName,
      },
    };
  }

  async refresh(rawToken: string) {
    const tokenHash = hashRefreshToken(rawToken);
    const current = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
      include: { account: true },
    });

    if (!current) {
      throw new UnauthorizedException("Refresh token is invalid.");
    }

    if (current.revokedAt) {
      await this.revokeFamilyAfterReplay(current.familyId, current.accountId);
      throw new UnauthorizedException("Refresh token reuse detected.");
    }

    if (
      current.expiresAt <= new Date() ||
      current.account.status !== "ACTIVE"
    ) {
      await this.prisma.client.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token has expired.");
    }

    const nextToken = createRefreshToken();
    const nextId = randomUUID();
    const now = new Date();

    try {
      await this.prisma.client.$transaction(async (tx) => {
        const consumed = await tx.refreshToken.updateMany({
          where: {
            id: current.id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            revokedAt: now,
            replacedById: nextId,
          },
        });

        if (consumed.count !== 1) {
          throw new Error("REFRESH_ROTATION_RACE");
        }

        await tx.refreshToken.create({
          data: {
            id: nextId,
            accountId: current.accountId,
            familyId: current.familyId,
            tokenHash: hashRefreshToken(nextToken),
            expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
          },
        });
      });
    } catch (error) {
      const isRotationRace =
        error instanceof Error && error.message === "REFRESH_ROTATION_RACE";
      const isSerializationConflict =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034";

      if (!isRotationRace && !isSerializationConflict) throw error;

      await this.revokeFamilyAfterReplay(current.familyId, current.accountId);
      throw new UnauthorizedException("Refresh token could not be rotated.");
    }

    return {
      accessToken: signAccessToken(
        current.account.id,
        current.account.personId,
        current.account.authVersion,
      ),
      refreshToken: nextToken,
      csrfToken: this.createCsrfToken(),
    };
  }

  async logout(accountId: string, rawToken?: string | null): Promise<void> {
    const token = rawToken
      ? await this.prisma.client.refreshToken.findUnique({
          where: { tokenHash: hashRefreshToken(rawToken) },
          select: { accountId: true, familyId: true },
        })
      : null;

    const operations = [];
    if (token?.accountId === accountId) {
      operations.push(
        this.prisma.client.refreshToken.updateMany({
          where: { accountId, familyId: token.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      );
    }
    operations.push(
      this.prisma.client.auditEvent.create({
        data: {
          actorAccountId: accountId,
          action: "AUTH_LOGOUT",
          resourceType: "UserAccount",
          resourceId: accountId,
          decision: "ALLOW",
        },
      }),
    );

    await this.prisma.client.$transaction(operations);
  }

  async logoutAll(accountId: string): Promise<void> {
    const now = new Date();
    await this.prisma.client.$transaction([
      this.prisma.client.refreshToken.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.client.userAccount.update({
        where: { id: accountId },
        data: { authVersion: { increment: 1 } },
      }),
      this.prisma.client.auditEvent.create({
        data: {
          actorAccountId: accountId,
          action: "AUTH_LOGOUT_ALL",
          resourceType: "UserAccount",
          resourceId: accountId,
          decision: "ALLOW",
        },
      }),
    ]);
  }

  async getCurrentUser(accountId: string) {
    return this.prisma.client.userAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        status: true,
        person: {
          select: {
            id: true,
            givenName: true,
            familyName: true,
            displayName: true,
            councilMemberships: {
              where: { status: "ACTIVE" },
              select: {
                id: true,
                role: true,
                council: { select: { id: true, name: true, slug: true } },
              },
            },
            schoolMemberships: {
              where: { status: "ACTIVE" },
              select: {
                id: true,
                role: true,
                registration: {
                  select: {
                    id: true,
                    status: true,
                    school: { select: { id: true, name: true } },
                    council: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        platformOperator: {
          select: { role: true, status: true },
        },
      },
    });
  }

  private async revokeFamilyAfterReplay(
    familyId: string,
    accountId: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.client.$transaction([
      this.prisma.client.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.client.userAccount.update({
        where: { id: accountId },
        data: { authVersion: { increment: 1 } },
      }),
      this.prisma.client.auditEvent.create({
        data: {
          actorAccountId: accountId,
          action: "AUTH_REFRESH_REPLAY_DETECTED",
          resourceType: "UserAccount",
          resourceId: accountId,
          decision: "DENY",
        },
      }),
    ]);
  }

  private createCsrfToken(): string {
    return createCsrfToken();
  }
}
