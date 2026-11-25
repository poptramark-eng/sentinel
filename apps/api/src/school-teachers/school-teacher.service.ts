import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EmailService } from "../auth/email.service";
import { PrismaService } from "../database/prisma.service";
import { createTeacherInvitationToken, hashTeacherInvitationToken } from "../auth/token";

interface SchoolActor {
  accountId: string;
  personId: string;
}

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function displayName(person: { displayName: string | null; givenName: string; familyName: string }) {
  return person.displayName?.trim() || `${person.givenName} ${person.familyName}`.trim();
}

function maskEmail(email: string | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return null;
  return `${local.slice(0, 1)}***@${domain}`;
}

@Injectable()
export class SchoolTeacherService {
  private readonly logger = new Logger(SchoolTeacherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private async resolveAdminScope(
    client: Pick<PrismaService["client"], "schoolMembership">,
    actor: SchoolActor,
    registrationId: string,
  ) {
    const membership = await client.schoolMembership.findFirst({
      where: {
        registrationId,
        personId: actor.personId,
        role: "SCHOOL_ADMINISTRATOR",
        status: "ACTIVE",
        endsAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        registration: {
          is: {
            status: "APPROVED",
            school: { is: { status: "ACTIVE" } },
            council: { is: { status: "ACTIVE" } },
          },
        },
      },
      select: {
        id: true,
        registrationId: true,
        councilId: true,
        registration: {
          select: {
            school: { select: { id: true, name: true } },
            council: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException("An active School Administrator membership for an approved school is required.");
    }
    return membership;
  }

  async list(actor: SchoolActor, registrationId: string) {
    const scope = await this.resolveAdminScope(this.prisma.client, actor, registrationId);
    const memberships = await this.prisma.client.schoolMembership.findMany({
      where: {
        registrationId: scope.registrationId,
        councilId: scope.councilId,
        role: "TEACHER",
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        person: {
          select: {
            id: true,
            givenName: true,
            familyName: true,
            displayName: true,
            account: {
              select: {
                status: true,
                loginIdentifiers: {
                  where: { type: "EMAIL" },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: { normalizedValue: true },
                },
              },
            },
          },
        },
      },
    });

    return {
      school: scope.registration.school,
      council: scope.registration.council,
      teachers: memberships.map((membership) => {
        const email = membership.person.account?.loginIdentifiers[0]?.normalizedValue;
        return {
          id: membership.id,
          personId: membership.person.id,
          name: displayName(membership.person),
          email: maskEmail(email),
          accountStatus: membership.person.account?.status ?? "NO_ACCOUNT",
          status: membership.status,
          startsAt: membership.startsAt,
          endsAt: membership.endsAt,
          addedAt: membership.createdAt,
        };
      }),
    };
  }

  async link(actor: SchoolActor, registrationId: string, rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    let linked: {
      membershipId: string;
      personId: string;
      teacherName: string;
      teacherEmail: string;
      schoolName: string;
      councilName: string;
      action: "SCHOOL_TEACHER_LINKED" | "SCHOOL_TEACHER_REACTIVATED";
    };

    try {
      linked = await this.prisma.client.$transaction(async (tx) => {
        const scope = await this.resolveAdminScope(tx, actor, registrationId);
        const identifier = await tx.loginIdentifier.findFirst({
          where: {
            type: "EMAIL",
            normalizedValue: email,
            verifiedAt: { not: null },
            account: {
              is: {
                status: "ACTIVE",
                platformOperator: { is: null },
              },
            },
          },
          select: {
            normalizedValue: true,
            account: {
              select: {
                id: true,
                person: {
                  select: { id: true, givenName: true, familyName: true, displayName: true },
                },
              },
            },
          },
        });

        if (!identifier) {
          throw new NotFoundException("No active account with this verified email was found. New teacher invitation/provisioning is not available in this release; do not create a duplicate identity or use an unverified email.");
        }
        const person = identifier.account.person;
        if (person.id === actor.personId) {
          throw new ConflictException("You already administer this school; a separate teacher membership cannot be added for the same person.");
        }

        const otherActiveMembership = await tx.schoolMembership.findFirst({
          where: {
            registrationId: scope.registrationId,
            personId: person.id,
            status: "ACTIVE",
            endsAt: null,
            role: "SCHOOL_ADMINISTRATOR",
          },
          select: { id: true },
        });
        if (otherActiveMembership) {
          throw new ConflictException("This person already holds the School Administrator membership for this school.");
        }

        const existing = await tx.schoolMembership.findUnique({
          where: {
            registrationId_personId_role: {
              registrationId: scope.registrationId,
              personId: person.id,
              role: "TEACHER",
            },
          },
          select: { id: true, status: true, endsAt: true },
        });

        if (existing && existing.status !== "REVOKED") {
          throw new ConflictException(
            existing.status === "ACTIVE"
              ? "This teacher is already linked to the school."
              : "This teacher has a non-revoked membership state that requires a separate governance action.",
          );
        }

        const now = new Date();
        const membership = existing
          ? await tx.schoolMembership.update({
              where: { id: existing.id },
              data: { status: "ACTIVE", startsAt: now, endsAt: null },
              select: { id: true },
            })
          : await tx.schoolMembership.create({
              data: {
                registrationId: scope.registrationId,
                councilId: scope.councilId,
                personId: person.id,
                role: "TEACHER",
                status: "ACTIVE",
                startsAt: now,
              },
              select: { id: true },
            });

        const action = existing ? "SCHOOL_TEACHER_REACTIVATED" : "SCHOOL_TEACHER_LINKED";
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId: scope.councilId,
            action,
            resourceType: "SchoolMembership",
            resourceId: membership.id,
            decision: "ALLOW",
            reason: existing ? "Reactivated by School Administrator after verified email match." : null,
            metadata: { registrationId: scope.registrationId, role: "TEACHER" },
          },
        });

        return {
          membershipId: membership.id,
          personId: person.id,
          teacherName: displayName(person),
          teacherEmail: identifier.normalizedValue,
          schoolName: scope.registration.school.name,
          councilName: scope.registration.council.name,
          action,
        };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = prismaCode(error);
      if (code === "P2002" || code === "P2034") {
        throw new ConflictException("The school membership changed while linking this teacher. Refresh the list and try again.");
      }
      throw error;
    }

    try {
      await this.email.sendSchoolMembershipAddedEmail({
        to: linked.teacherEmail,
        teacherName: linked.teacherName,
        schoolName: linked.schoolName,
        councilName: linked.councilName,
        action: linked.action === "SCHOOL_TEACHER_REACTIVATED" ? "REACTIVATED" : "LINKED",
      });
    } catch {
      this.logger.warn("Teacher membership notification delivery failed; the membership remains active.");
    }

    return {
      id: linked.membershipId,
      personId: linked.personId,
      name: linked.teacherName,
      email: maskEmail(linked.teacherEmail),
      status: "ACTIVE",
      action: linked.action,
    };
  }
  async invite(
    actor: SchoolActor,
    registrationId: string,
    input: { email: string; givenName?: string; familyName?: string },
  ) {
    const email = input.email.trim().toLowerCase();
    const existingIdentifier = await this.prisma.client.loginIdentifier.findUnique({
      where: { type_normalizedValue: { type: "EMAIL", normalizedValue: email } },
      include: {
        account: {
          include: {
            person: true,
            platformOperator: true,
          },
        },
      },
    });

    if (
      existingIdentifier?.verifiedAt &&
      existingIdentifier.account.status === "ACTIVE" &&
      !existingIdentifier.account.platformOperator
    ) {
      return this.link(actor, registrationId, email);
    }
    if (
      existingIdentifier &&
      (existingIdentifier.account.status !== "PENDING_VERIFICATION" ||
        existingIdentifier.verifiedAt ||
        existingIdentifier.account.platformOperator)
    ) {
      throw new ConflictException("This email is already associated with an account that cannot accept a new teacher invitation.");
    }
    if (!existingIdentifier && (!input.givenName?.trim() || !input.familyName?.trim())) {
      throw new BadRequestException("Given name and family name are required when inviting a new teacher.");
    }

    const rawToken = createTeacherInvitationToken();
    const tokenHash = hashTeacherInvitationToken(rawToken);
    const now = new Date();
    let invitation: {
      membershipId: string;
      personId: string;
      teacherName: string;
      schoolName: string;
      councilName: string;
    };
    try {
      invitation = await this.prisma.client.$transaction(async (tx) => {
        const scope = await this.resolveAdminScope(tx, actor, registrationId);
        const identifier = await tx.loginIdentifier.findUnique({
          where: { type_normalizedValue: { type: "EMAIL", normalizedValue: email } },
          include: {
            account: {
              include: { person: true, platformOperator: true },
            },
          },
        });

        let person: { id: string; givenName: string; familyName: string; displayName: string | null };
        let accountId: string;
        let loginIdentifierId: string;
        if (identifier) {
          if (
            identifier.account.status !== "PENDING_VERIFICATION" ||
            identifier.verifiedAt ||
            identifier.account.platformOperator
          ) {
            throw new ConflictException("This email is already associated with an account that cannot accept a new teacher invitation.");
          }
          person = identifier.account.person;
          accountId = identifier.account.id;
          loginIdentifierId = identifier.id;
        } else {
          if (!input.givenName?.trim() || !input.familyName?.trim()) {
            throw new BadRequestException("Given name and family name are required when inviting a new teacher.");
          }
          person = await tx.person.create({
            data: {
              givenName: input.givenName.trim().replace(/\\s+/g, " "),
              familyName: input.familyName.trim().replace(/\\s+/g, " "),
            },
            select: { id: true, givenName: true, familyName: true, displayName: true },
          });
          const account = await tx.userAccount.create({
            data: { personId: person.id, status: "PENDING_VERIFICATION" },
            select: { id: true },
          });
          accountId = account.id;
          const createdIdentifier = await tx.loginIdentifier.create({
            data: { accountId, type: "EMAIL", normalizedValue: email },
            select: { id: true },
          });
          loginIdentifierId = createdIdentifier.id;
        }

        const existingSchoolAdministrator = await tx.schoolMembership.findFirst({
          where: {
            registrationId: scope.registrationId,
            personId: person.id,
            role: "SCHOOL_ADMINISTRATOR",
            status: "ACTIVE",
            endsAt: null,
          },
          select: { id: true },
        });
        if (existingSchoolAdministrator) {
          throw new ConflictException("This person already holds the School Administrator membership for this school.");
        }

        const existingMembership = await tx.schoolMembership.findUnique({
          where: {
            registrationId_personId_role: {
              registrationId: scope.registrationId,
              personId: person.id,
              role: "TEACHER",
            },
          },
          select: { id: true, status: true },
        });
        let membership: { id: string };
        if (existingMembership?.status === "ACTIVE") {
          throw new ConflictException("This teacher is already linked to the school.");
        }
        if (existingMembership && existingMembership.status !== "REVOKED" && existingMembership.status !== "PENDING") {
          throw new ConflictException("This teacher membership requires a separate governance action.");
        }
        if (existingMembership) {
          membership = await tx.schoolMembership.update({
            where: { id: existingMembership.id },
            data: { status: "PENDING", startsAt: null, endsAt: null },
            select: { id: true },
          });
        } else {
          membership = await tx.schoolMembership.create({
            data: {
              registrationId: scope.registrationId,
              councilId: scope.councilId,
              personId: person.id,
              role: "TEACHER",
              status: "PENDING",
            },
            select: { id: true },
          });
        }

        const activeInvitation = await tx.teacherInvitationToken.findFirst({
          where: { accountId, consumedAt: null },
          select: { id: true, membershipId: true },
        });
        if (activeInvitation && activeInvitation.membershipId !== membership.id) {
          throw new ConflictException("This account already has a pending teacher invitation. Complete that invitation before issuing another.");
        }
        if (activeInvitation) {
          await tx.teacherInvitationToken.updateMany({
            where: { id: activeInvitation.id, consumedAt: null },
            data: { consumedAt: now },
          });
        }

        await tx.teacherInvitationToken.create({
          data: {
            accountId,
            loginIdentifierId,
            membershipId: membership.id,
            registrationId: scope.registrationId,
            councilId: scope.councilId,
            invitedByAccountId: actor.accountId,
            tokenHash,
            expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId: scope.councilId,
            action: "SCHOOL_TEACHER_INVITED",
            resourceType: "SchoolMembership",
            resourceId: membership.id,
            decision: "ALLOW",
            metadata: { registrationId: scope.registrationId, role: "TEACHER" },
          },
        });
        return {
          membershipId: membership.id,
          personId: person.id,
          teacherName: displayName(person),
          schoolName: scope.registration.school.name,
          councilName: scope.registration.council.name,
        };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = prismaCode(error);
      if (code === "P2002" || code === "P2034") {
        throw new ConflictException("The teacher invitation changed while being created. Refresh the roster and try again.");
      }
      throw error;
    }

    let previewUrl: string | undefined;
    let deliveryStatus: "SENT" | "FAILED" = "SENT";
    try {
      const delivery = await this.email.sendTeacherInvitationEmail({
        to: email,
        teacherName: invitation.teacherName,
        schoolName: invitation.schoolName,
        councilName: invitation.councilName,
        token: rawToken,
      });
      previewUrl = delivery.previewUrl;
    } catch {
      deliveryStatus = "FAILED";
      this.logger.warn("Teacher invitation email delivery failed; the pending invitation can be retried by the School Administrator.");
    }

    return {
      id: invitation.membershipId,
      personId: invitation.personId,
      name: invitation.teacherName,
      email: maskEmail(email),
      status: "PENDING",
      action: "SCHOOL_TEACHER_INVITED",
      deliveryStatus,
      ...(previewUrl ? { invitationPreviewUrl: previewUrl } : {}),
    };
  }

}
