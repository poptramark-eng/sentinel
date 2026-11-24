import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EmailService } from "../auth/email.service";
import { PrismaService } from "../database/prisma.service";

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
                  where: { type: "EMAIL", verifiedAt: { not: null } },
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
}
