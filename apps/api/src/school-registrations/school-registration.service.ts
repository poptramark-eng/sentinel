import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
  SubmitSchoolRegistrationDto,
} from "./dto/submit-registration.dto";
import { RegistrationDecisionDto, WithdrawRegistrationDto } from "./dto/registration-decision.dto";
import { RegistrationQueryDto } from "./dto/registration-query.dto";

export interface RegistrationActor {
  accountId: string;
  personId: string;
}

const ACTIVE_REGISTRATION_STATES = [
  "PENDING_REVIEW",
  "APPROVED",
  "SUSPENDED",
] as const;

function errorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

@Injectable()
export class SchoolRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(
    actor: RegistrationActor,
    input: SubmitSchoolRegistrationDto,
  ) {
    try {
      return await this.prisma.client.$transaction(
        async (tx) => {
          const council = await tx.council.findFirst({
            where: { id: input.councilId, status: "ACTIVE" },
            select: { id: true },
          });
          const cluster = await tx.cluster.findFirst({
            where: {
              id: input.clusterId,
              councilId: input.councilId,
              status: "ACTIVE",
            },
            select: { id: true },
          });

          if (!council || !cluster) {
            throw new NotFoundException(
              "The selected Council or cluster is unavailable.",
            );
          }

          let school:
            | { id: string; name: string }
            | undefined;

          if (input.school.identifier) {
            const issuer = input.school.identifier.issuer
              .trim()
              .toLowerCase();
            const normalizedValue = normalizeIdentifier(
              input.school.identifier.value,
            );
            const identifier = await tx.schoolIdentifier.findUnique({
              where: {
                issuer_normalizedValue: { issuer, normalizedValue },
              },
              include: { school: { select: { id: true, name: true } } },
            });

            if (identifier && !identifier.verifiedAt) {
              throw new ConflictException({
                code: "IDENTIFIER_REVIEW_REQUIRED",
                message:
                  "This school identifier is already under review. The registration requires manual identity review.",
              });
            }

            if (identifier?.verifiedAt) {
              school = identifier.school;
            } else {
              school = await tx.school.create({
                data: { name: input.school.name.trim() },
                select: { id: true, name: true },
              });
              await tx.schoolIdentifier.create({
                data: {
                  schoolId: school.id,
                  type: input.school.identifier.type,
                  issuer,
                  normalizedValue,
                },
              });
            }
          } else {
            school = await tx.school.create({
              data: { name: input.school.name.trim() },
              select: { id: true, name: true },
            });
          }

          const activeRegistration =
            await tx.councilSchoolRegistration.findFirst({
              where: {
                councilId: input.councilId,
                schoolId: school.id,
                status: { in: [...ACTIVE_REGISTRATION_STATES] },
              },
              select: { id: true },
            });

          if (activeRegistration) {
            throw new ConflictException({
              code: "REGISTRATION_ALREADY_ACTIVE",
              message:
                "This school already has an active registration with this Council.",
            });
          }

          const registration = await tx.councilSchoolRegistration.create({
            data: {
              councilId: input.councilId,
              schoolId: school.id,
              clusterId: input.clusterId,
              registrationCode: input.registrationCode?.trim() || null,
              submittedSchoolName: input.school.name.trim(),
              initialRegistrantPersonId: actor.personId,
              status: "PENDING_REVIEW",
            },
            select: {
              id: true,
              status: true,
              submittedSchoolName: true,
              submittedAt: true,
              version: true,
              school: { select: { id: true, name: true } },
              council: { select: { id: true, name: true } },
            },
          });

          await tx.schoolMembership.create({
            data: {
              registrationId: registration.id,
              councilId: input.councilId,
              personId: actor.personId,
              role: "SCHOOL_ADMINISTRATOR",
              status: "PENDING",
            },
          });

          await tx.auditEvent.create({
            data: {
              actorAccountId: actor.accountId,
              councilId: input.councilId,
              action: "SCHOOL_REGISTRATION_SUBMITTED",
              resourceType: "CouncilSchoolRegistration",
              resourceId: registration.id,
              decision: "ALLOW",
              metadata: {
                submittedSchoolName: registration.submittedSchoolName,
                hasIdentifierClaim: Boolean(input.school.identifier),
              },
            },
          });

          return registration;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const code = errorCode(error);
      if (code === "P2002" || code === "P2034") {
        throw new ConflictException({
          code: "REGISTRATION_CONFLICT",
          message:
            "The registration conflicts with a concurrent or existing record. Refresh and review before retrying.",
        });
      }
      throw error;
    }
  }

  async listMine(actor: RegistrationActor, query: RegistrationQueryDto) {
    const where = {
      initialRegistrantPersonId: actor.personId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.councilSchoolRegistration.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          status: true,
          submittedSchoolName: true,
          submittedAt: true,
          reviewedAt: true,
          decisionReason: true,
          version: true,
          school: { select: { id: true, name: true } },
          council: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.councilSchoolRegistration.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getMine(actor: RegistrationActor, registrationId: string) {
    const registration =
      await this.prisma.client.councilSchoolRegistration.findFirst({
        where: {
          id: registrationId,
          initialRegistrantPersonId: actor.personId,
        },
        select: {
          id: true,
          status: true,
          submittedSchoolName: true,
          submittedAt: true,
          reviewedAt: true,
          decisionReason: true,
          version: true,
          school: { select: { id: true, name: true } },
          council: { select: { id: true, name: true } },
          cluster: { select: { id: true, name: true } },
        },
      });

    if (!registration) throw new NotFoundException();
    return registration;
  }

  async withdraw(
    actor: RegistrationActor,
    registrationId: string,
    input: WithdrawRegistrationDto,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const registration =
        await tx.councilSchoolRegistration.findFirst({
          where: {
            id: registrationId,
            initialRegistrantPersonId: actor.personId,
          },
          select: {
            id: true,
            councilId: true,
            status: true,
            version: true,
          },
        });

      if (!registration) throw new NotFoundException();
      if (
        registration.status !== "PENDING_REVIEW" ||
        registration.version !== input.expectedVersion
      ) {
        throw new ConflictException("Registration has changed or is no longer pending.");
      }

      const updated = await tx.councilSchoolRegistration.updateMany({
        where: {
          id: registration.id,
          status: "PENDING_REVIEW",
          version: input.expectedVersion,
        },
        data: {
          status: "WITHDRAWN",
          decisionReason: input.reason.trim(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Registration changed. Refresh and retry.");
      }

      await tx.schoolMembership.updateMany({
        where: {
          registrationId: registration.id,
          status: "PENDING",
        },
        data: { status: "REVOKED", endsAt: new Date() },
      });

      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId: registration.councilId,
          action: "SCHOOL_REGISTRATION_WITHDRAWN",
          resourceType: "CouncilSchoolRegistration",
          resourceId: registration.id,
          decision: "ALLOW",
          reason: input.reason.trim(),
        },
      });

      return { id: registration.id, status: "WITHDRAWN" as const };
    });
  }

  async listForReview(query: RegistrationQueryDto) {
    const where = {
      status: query.status ?? "PENDING_REVIEW" as const,
      ...(query.councilId ? { councilId: query.councilId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                submittedSchoolName: {
                  contains: query.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                registrationCode: {
                  contains: query.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                school: {
                  name: {
                    contains: query.search.trim(),
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.councilSchoolRegistration.findMany({
        where,
        orderBy: { submittedAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          councilId: true,
          status: true,
          submittedSchoolName: true,
          registrationCode: true,
          submittedAt: true,
          version: true,
          school: { select: { id: true, name: true, status: true } },
          council: { select: { id: true, name: true } },
          cluster: {
            select: {
              id: true,
              name: true,
              zone: {
                select: {
                  name: true,
                  subcounty: {
                    select: {
                      name: true,
                      county: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.client.councilSchoolRegistration.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getForReview(registrationId: string) {
    const registration =
      await this.prisma.client.councilSchoolRegistration.findUnique({
        where: { id: registrationId },
        include: {
          school: { include: { identifiers: true } },
          council: true,
          cluster: {
            include: {
              zone: {
                include: {
                  subcounty: {
                    include: { county: { include: { region: true } } },
                  },
                },
              },
            },
          },
          initialRegistrant: {
            select: {
              id: true,
              givenName: true,
              familyName: true,
              displayName: true,
            },
          },
          memberships: {
            select: { id: true, role: true, status: true, createdAt: true },
          },
        },
      });

    if (!registration) throw new NotFoundException();
    return registration;
  }

  async decide(
    actor: RegistrationActor,
    registrationId: string,
    decision: "APPROVED" | "REJECTED",
    input: RegistrationDecisionDto,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const reviewer = await tx.userAccount.findUnique({
        where: { id: actor.accountId },
        select: {
          id: true,
          personId: true,
          platformOperator: { select: { status: true, role: true } },
        },
      });
      if (
        !reviewer ||
        reviewer.personId !== actor.personId ||
        reviewer.platformOperator?.status !== "ACTIVE" ||
        reviewer.platformOperator.role !== "PLATFORM_ADMINISTRATOR"
      ) {
        throw new ForbiddenException("PlatformAdministrator access is required.");
      }

      const registration =
        await tx.councilSchoolRegistration.findUnique({
          where: { id: registrationId },
          select: {
            id: true,
            councilId: true,
            schoolId: true,
            initialRegistrantPersonId: true,
            status: true,
            version: true,
          },
        });

      if (!registration) throw new NotFoundException();
      if (registration.initialRegistrantPersonId === actor.personId) {
        throw new ForbiddenException("A registrant cannot review their own registration.");
      }
      if (
        registration.status !== "PENDING_REVIEW" ||
        registration.version !== input.expectedVersion
      ) {
        throw new UnprocessableEntityException(
          "Registration is no longer in the expected review state.",
        );
      }

      const updated = await tx.councilSchoolRegistration.updateMany({
        where: {
          id: registration.id,
          status: "PENDING_REVIEW",
          version: input.expectedVersion,
        },
        data: {
          status: decision,
          reviewedByAccountId: actor.accountId,
          reviewedAt: new Date(),
          decisionReason: input.reason.trim(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Registration changed during review.");
      }

      if (decision === "APPROVED") {
        await tx.school.update({
          where: { id: registration.schoolId },
          data: { status: "ACTIVE" },
        });
        const activated = await tx.schoolMembership.updateMany({
          where: {
            registrationId: registration.id,
            role: "SCHOOL_ADMINISTRATOR",
            status: "PENDING",
          },
          data: { status: "ACTIVE", startsAt: new Date() },
        });
        if (activated.count !== 1) {
          throw new ConflictException(
            "The initial SchoolAdministrator membership is missing or already processed.",
          );
        }
      } else {
        await tx.schoolMembership.updateMany({
          where: {
            registrationId: registration.id,
            status: "PENDING",
          },
          data: { status: "REVOKED", endsAt: new Date() },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId: registration.councilId,
          action:
            decision === "APPROVED"
              ? "SCHOOL_REGISTRATION_APPROVED"
              : "SCHOOL_REGISTRATION_REJECTED",
          resourceType: "CouncilSchoolRegistration",
          resourceId: registration.id,
          decision,
          reason: input.reason.trim(),
        },
      });

      return tx.councilSchoolRegistration.findUnique({
        where: { id: registration.id },
        select: {
          id: true,
          status: true,
          reviewedAt: true,
          decisionReason: true,
          version: true,
        },
      });
    });
  }
}
