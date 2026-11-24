import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { hashPassword, verifyPassword } from "./password";
import {
  createCsrfToken,
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "./token";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword("sentinel-dummy-password-not-a-user");

  constructor(private readonly prisma: PrismaService) {}

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
    const now = new Date();
    const token = rawToken
      ? await this.prisma.client.refreshToken.findUnique({
          where: { tokenHash: hashRefreshToken(rawToken) },
        })
      : null;

    await this.prisma.client.$transaction([
      ...(token
        ? [
            this.prisma.client.refreshToken.updateMany({
              where: { familyId: token.familyId, revokedAt: null },
              data: { revokedAt: now },
            }),
          ]
        : []),
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
          action: "AUTH_LOGOUT",
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
