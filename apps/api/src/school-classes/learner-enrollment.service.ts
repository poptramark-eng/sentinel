import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { EnrollLearnerDto } from "./dto/enroll-learner.dto";

interface SchoolActor { accountId: string; personId: string }

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function displayName(person: { displayName: string | null; givenName: string; otherNames: string | null; familyName: string }) {
  return person.displayName?.trim() || [person.givenName, person.otherNames, person.familyName].filter(Boolean).join(" ");
}

@Injectable()
export class LearnerEnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveAdminScope(client: Pick<PrismaService["client"], "schoolMembership">, actor: SchoolActor, registrationId: string) {
    const membership = await client.schoolMembership.findFirst({
      where: {
        registrationId,
        personId: actor.personId,
        role: "SCHOOL_ADMINISTRATOR",
        status: "ACTIVE",
        endsAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
      },
      select: {
        id: true,
        registrationId: true,
        councilId: true,
        registration: { select: { school: { select: { id: true, name: true } }, council: { select: { id: true, name: true } } } },
      },
    });
    if (!membership) throw new ForbiddenException("An active School Administrator membership for an approved school is required.");
    return membership;
  }

  private async resolveClassAccess(actor: SchoolActor, registrationId: string, classId: string) {
    const now = new Date();
    const schoolClass = await this.prisma.client.schoolClass.findFirst({
      where: {
        id: classId,
        registrationId,
        status: "ACTIVE",
        registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
      },
      select: {
        id: true, registrationId: true, councilId: true, grade: true, academicYear: true, streamCode: true, displayName: true,
        registration: { select: { school: { select: { id: true, name: true } } } },
      },
    });
    if (!schoolClass) throw new NotFoundException("The class was not found in an approved school.");

    const [administrator, teacher] = await Promise.all([
      this.prisma.client.schoolMembership.findFirst({
        where: {
          registrationId, councilId: schoolClass.councilId, personId: actor.personId,
          role: "SCHOOL_ADMINISTRATOR", status: "ACTIVE", endsAt: null,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        },
        select: { id: true },
      }),
      this.prisma.client.schoolMembership.findFirst({
        where: {
          registrationId, councilId: schoolClass.councilId, personId: actor.personId,
          role: "TEACHER", status: "ACTIVE", endsAt: null,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          staffAssignments: { some: { schoolClassId: classId, type: "CLASS_TEACHER", status: "ACTIVE", endsAt: null, startsAt: { lte: now } } },
        },
        select: { id: true },
      }),
    ]);
    if (!administrator && !teacher) throw new ForbiddenException("An active School Administrator or assigned Class Teacher membership is required.");
    return { schoolClass, accessRole: administrator ? "SCHOOL_ADMINISTRATOR" as const : "TEACHER" as const };
  }

  async searchExisting(actor: SchoolActor, registrationId: string, query: string) {
    await this.resolveAdminScope(this.prisma.client, actor, registrationId);
    const normalized = query.trim();
    if (normalized.length < 2) throw new BadRequestException("Search with at least two characters.");
    const learners = await this.prisma.client.learner.findMany({
      where: {
        OR: [
          { learnerNumber: { equals: normalized, mode: "insensitive" } },
          { givenName: { contains: normalized, mode: "insensitive" } },
          { familyName: { contains: normalized, mode: "insensitive" } },
          { otherNames: { contains: normalized, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: [{ familyName: "asc" }, { givenName: "asc" }],
      select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true, enrollments: { where: { status: "ACTIVE", endedAt: null }, select: { registrationId: true } } },
    });
    return learners.map((learner) => ({
      id: learner.id,
      learnerNumber: learner.learnerNumber,
      name: displayName(learner),
      alreadyEnrolledAtThisSchool: learner.enrollments.some((enrollment) => enrollment.registrationId === registrationId),
      hasActiveEnrollment: learner.enrollments.length > 0,
    }));
  }

  async listClassLearners(actor: SchoolActor, registrationId: string, classId: string) {
    const { schoolClass, accessRole } = await this.resolveClassAccess(actor, registrationId, classId);
    const enrollments = await this.prisma.client.schoolLearnerEnrollment.findMany({
      where: { registrationId, councilId: schoolClass.councilId, schoolClassId: classId, status: "ACTIVE", endedAt: null },
      orderBy: [{ learner: { familyName: "asc" } }, { learner: { givenName: "asc" } }],
      select: {
        id: true, admissionNumber: true, enrolledAt: true,
        learner: { select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true } },
      },
    });
    return {
      school: schoolClass.registration.school,
      class: { id: schoolClass.id, grade: schoolClass.grade, academicYear: schoolClass.academicYear, streamCode: schoolClass.streamCode, displayName: schoolClass.displayName },
      accessRole,
      learners: enrollments.map((enrollment) => ({
        enrollmentId: enrollment.id,
        learnerId: enrollment.learner.id,
        learnerNumber: enrollment.learner.learnerNumber,
        name: displayName(enrollment.learner),
        admissionNumber: enrollment.admissionNumber,
        enrolledAt: enrollment.enrolledAt,
      })),
    };
  }

  async enroll(actor: SchoolActor, registrationId: string, classId: string, input: EnrollLearnerDto) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const scope = await this.resolveAdminScope(tx, actor, registrationId);
        const schoolClass = await tx.schoolClass.findFirst({
          where: { id: classId, registrationId: scope.registrationId, councilId: scope.councilId, status: "ACTIVE" },
          select: { id: true, grade: true, academicYear: true },
        });
        if (!schoolClass) throw new NotFoundException("The class was not found in this approved school.");

        if (Boolean(input.learnerId) === Boolean(input.givenName || input.familyName)) {
          throw new BadRequestException("Provide either an existing learner ID or the learner's name to create a new identity.");
        }
        let learner;
        if (input.learnerId) {
          learner = await tx.learner.findUnique({
            where: { id: input.learnerId },
            select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true },
          });
          if (!learner) throw new NotFoundException("The existing learner identity was not found.");
        } else {
          const givenName = input.givenName?.trim() ?? "";
          const familyName = input.familyName?.trim() ?? "";
          if (!givenName || !familyName) throw new BadRequestException("Learner given name and family name are required.");
          learner = await tx.learner.create({
            data: {
              learnerNumber: `LRN-${randomUUID().replaceAll("-", "").toUpperCase()}`,
              givenName,
              familyName,
              otherNames: input.otherNames?.trim() || null,
            },
            select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true },
          });
        }

        const activeEnrollment = await tx.schoolLearnerEnrollment.findFirst({
          where: { learnerId: learner.id, status: "ACTIVE", endedAt: null },
          select: { id: true, registrationId: true },
        });
        if (activeEnrollment) {
          throw new ConflictException(activeEnrollment.registrationId === registrationId
            ? "This learner is already actively enrolled at this school. Move the existing enrollment instead of creating a duplicate."
            : "This learner has an active enrollment at another school. End that enrollment before transferring the learner.");
        }

        const enrollment = await tx.schoolLearnerEnrollment.create({
          data: {
            learnerId: learner.id,
            registrationId: scope.registrationId,
            councilId: scope.councilId,
            schoolClassId: schoolClass.id,
            admissionNumber: input.admissionNumber?.trim().toUpperCase() || null,
          },
          select: { id: true, admissionNumber: true, enrolledAt: true, status: true },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId: scope.councilId,
            action: "LEARNER_ENROLLED",
            resourceType: "SchoolLearnerEnrollment",
            resourceId: enrollment.id,
            decision: "ALLOW",
            metadata: { registrationId, schoolClassId: classId, learnerId: learner.id, learnerNumber: learner.learnerNumber },
          },
        });
        return {
          ...enrollment,
          learner: { id: learner.id, learnerNumber: learner.learnerNumber, name: displayName(learner) },
        };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (prismaCode(error) === "P2002" || prismaCode(error) === "P2034") {
        throw new ConflictException("The learner is already enrolled or the admission number is already in use. Refresh and try again.");
      }
      throw error;
    }
  }
}
