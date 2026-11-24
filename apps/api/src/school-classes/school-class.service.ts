import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AssignClassTeacherDto } from "./dto/assign-class-teacher.dto";
import { CreateSchoolClassDto } from "./dto/create-school-class.dto";

interface SchoolActor {
  accountId: string;
  personId: string;
}

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function personName(person: { displayName: string | null; givenName: string; familyName: string }) {
  return person.displayName?.trim() || `${person.givenName} ${person.familyName}`.trim();
}

@Injectable()
export class SchoolClassService {
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
        registration: { select: { school: { select: { id: true, name: true } }, council: { select: { id: true, name: true } } } },
      },
    });
    if (!membership) throw new ForbiddenException("An active School Administrator membership for an approved school is required.");
    return membership;
  }

  async list(actor: SchoolActor, registrationId: string) {
    const scope = await this.resolveAdminScope(this.prisma.client, actor, registrationId);
    const classes = await this.prisma.client.schoolClass.findMany({
      where: { registrationId: scope.registrationId, councilId: scope.councilId },
      orderBy: [{ academicYear: "desc" }, { grade: "asc" }, { streamCode: "asc" }],
      include: {
        assignments: {
          where: { type: "CLASS_TEACHER", status: "ACTIVE", endsAt: null, startsAt: { lte: new Date() }, membership: { is: { status: "ACTIVE", endsAt: null, OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] } } },
          take: 1,
          select: {
            id: true,
            membershipId: true,
            startsAt: true,
            membership: { select: { person: { select: { givenName: true, familyName: true, displayName: true } } } },
          },
        },
      },
    });
    return {
      school: scope.registration.school,
      council: scope.registration.council,
      classes: classes.map((schoolClass) => {
        const assignment = schoolClass.assignments[0];
        return {
          id: schoolClass.id,
          grade: schoolClass.grade,
          academicYear: schoolClass.academicYear,
          streamCode: schoolClass.streamCode,
          displayName: schoolClass.displayName,
          status: schoolClass.status,
          createdAt: schoolClass.createdAt,
          classTeacher: assignment ? {
            assignmentId: assignment.id,
            membershipId: assignment.membershipId,
            name: personName(assignment.membership.person),
            startsAt: assignment.startsAt,
          } : null,
        };
      }),
    };
  }

  async create(actor: SchoolActor, registrationId: string, input: CreateSchoolClassDto) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const scope = await this.resolveAdminScope(tx, actor, registrationId);
        const schoolClass = await tx.schoolClass.create({
          data: {
            registrationId: scope.registrationId,
            councilId: scope.councilId,
            grade: input.grade,
            academicYear: input.academicYear,
            streamCode: input.streamCode?.trim().toUpperCase() || "MAIN",
            displayName: input.displayName?.trim() || null,
          },
          select: { id: true, grade: true, academicYear: true, streamCode: true, displayName: true, status: true, createdAt: true },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId: scope.councilId,
            action: "SCHOOL_CLASS_CREATED",
            resourceType: "SchoolClass",
            resourceId: schoolClass.id,
            decision: "ALLOW",
            metadata: { registrationId: scope.registrationId, grade: schoolClass.grade, academicYear: schoolClass.academicYear, streamCode: schoolClass.streamCode },
          },
        });
        return schoolClass;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (prismaCode(error) === "P2002" || prismaCode(error) === "P2034") {
        throw new ConflictException("A class with this grade, academic year and stream already exists at this school.");
      }
      throw error;
    }
  }

  async assignClassTeacher(actor: SchoolActor, registrationId: string, classId: string, input: AssignClassTeacherDto) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const scope = await this.resolveAdminScope(tx, actor, registrationId);
        const schoolClass = await tx.schoolClass.findFirst({
          where: { id: classId, registrationId: scope.registrationId, councilId: scope.councilId, status: "ACTIVE" },
          select: { id: true, grade: true, academicYear: true, streamCode: true },
        });
        if (!schoolClass) throw new NotFoundException("The class was not found in this approved school.");

        const teacher = await tx.schoolMembership.findFirst({
          where: {
            id: input.membershipId,
            registrationId: scope.registrationId,
            councilId: scope.councilId,
            role: "TEACHER",
            status: "ACTIVE",
            endsAt: null,
            OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
            person: { account: { is: { status: "ACTIVE" } } },
          },
          select: { id: true, person: { select: { givenName: true, familyName: true, displayName: true } } },
        });
        if (!teacher) throw new NotFoundException("An active teacher membership for this school was not found.");

        const existing = await tx.staffAssignment.findFirst({
          where: { schoolClassId: classId, registrationId: scope.registrationId, councilId: scope.councilId, type: "CLASS_TEACHER", status: "ACTIVE", endsAt: null },
          select: { id: true },
        });
        if (existing) throw new ConflictException("This class already has an active Class Teacher. End that assignment before replacing it.");

        const assignment = await tx.staffAssignment.create({
          data: {
            registrationId: scope.registrationId,
            councilId: scope.councilId,
            schoolClassId: classId,
            membershipId: teacher.id,
            type: "CLASS_TEACHER",
            status: "ACTIVE",
            startsAt: new Date(),
          },
          select: { id: true, membershipId: true, startsAt: true },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId: scope.councilId,
            action: "SCHOOL_CLASS_TEACHER_ASSIGNED",
            resourceType: "StaffAssignment",
            resourceId: assignment.id,
            decision: "ALLOW",
            metadata: { registrationId: scope.registrationId, schoolClassId: classId, membershipId: teacher.id, assignmentType: "CLASS_TEACHER" },
          },
        });
        return { ...assignment, teacherName: personName(teacher.person) };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (prismaCode(error) === "P2002" || prismaCode(error) === "P2034") {
        throw new ConflictException("The class teacher assignment changed concurrently. Refresh and try again.");
      }
      throw error;
    }
  }

  async endClassTeacher(actor: SchoolActor, registrationId: string, classId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const scope = await this.resolveAdminScope(tx, actor, registrationId);
      const assignment = await tx.staffAssignment.findFirst({
        where: { schoolClassId: classId, registrationId: scope.registrationId, councilId: scope.councilId, type: "CLASS_TEACHER", status: "ACTIVE", endsAt: null },
        select: { id: true },
      });
      if (!assignment) throw new NotFoundException("No active Class Teacher assignment was found for this class.");
      const ended = await tx.staffAssignment.update({
        where: { id: assignment.id },
        data: { status: "ENDED", endsAt: new Date() },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId: scope.councilId,
          action: "SCHOOL_CLASS_TEACHER_ENDED",
          resourceType: "StaffAssignment",
          resourceId: ended.id,
          decision: "ALLOW",
          metadata: { registrationId: scope.registrationId, schoolClassId: classId },
        },
      });
      return { success: true };
    }, { isolationLevel: "Serializable" });
  }
}
