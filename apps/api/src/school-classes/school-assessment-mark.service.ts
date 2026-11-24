import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { UpdateAssessmentMarkDto } from "./dto/update-assessment-mark.dto";

interface TeacherActor { accountId: string; personId: string }

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

@Injectable()
export class SchoolAssessmentMarkService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssignedClasses(actor: TeacherActor) {
    const now = new Date();
    const memberships = await this.prisma.client.schoolMembership.findMany({
      where: {
        personId: actor.personId,
        role: "TEACHER",
        status: "ACTIVE",
        endsAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
        staffAssignments: {
          some: { type: "CLASS_TEACHER", status: "ACTIVE", endsAt: null, startsAt: { lte: now }, schoolClass: { is: { status: "ACTIVE" } } },
        },
      },
      select: {
        id: true,
        registrationId: true,
        councilId: true,
        registration: { select: { school: { select: { name: true } }, council: { select: { name: true } } } },
        staffAssignments: {
          where: { type: "CLASS_TEACHER", status: "ACTIVE", endsAt: null, startsAt: { lte: now }, schoolClass: { is: { status: "ACTIVE" } } },
          select: {
            schoolClass: { select: { id: true, grade: true, academicYear: true, streamCode: true, displayName: true } },
          },
        },
      },
    });
    const assigned = memberships.flatMap((membership) => membership.staffAssignments.map((assignment) => ({
      membershipId: membership.id,
      registrationId: membership.registrationId,
      councilId: membership.councilId,
      schoolName: membership.registration.school.name,
      councilName: membership.registration.council.name,
      schoolClass: assignment.schoolClass,
    })));
    const unique = new Map(assigned.map((item) => [item.schoolClass.id, item]));
    return Promise.all([...unique.values()].map(async (item) => {
      const assessments = await this.prisma.client.assessment.findMany({
        where: {
          councilId: item.councilId,
          grade: item.schoolClass.grade,
          academicYear: item.schoolClass.academicYear,
          status: "OPEN",
        },
        orderBy: [{ opensAt: "asc" }, { name: "asc" }],
        select: { id: true, name: true, code: true, opensAt: true, closesAt: true },
      });
      return { ...item, assessments };
    }));
  }

  private async resolveTeacherClass(actor: TeacherActor, registrationId: string, classId: string) {
    const now = new Date();
    const schoolClass = await this.prisma.client.schoolClass.findFirst({
      where: {
        id: classId,
        registrationId,
        status: "ACTIVE",
        registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
      },
      select: { id: true, registrationId: true, councilId: true, grade: true, academicYear: true },
    });
    if (!schoolClass) throw new NotFoundException("The class was not found in an approved school.");

    const membership = await this.prisma.client.schoolMembership.findFirst({
      where: {
        registrationId,
        councilId: schoolClass.councilId,
        personId: actor.personId,
        role: "TEACHER",
        status: "ACTIVE",
        endsAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        staffAssignments: {
          some: {
            schoolClassId: classId,
            type: "CLASS_TEACHER",
            status: "ACTIVE",
            endsAt: null,
            startsAt: { lte: now },
          },
        },
      },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException("Only the active Class Teacher assigned to this class may manage its assessment marks.");
    return schoolClass;
  }

  private async resolveOpenAssessment(client: Pick<PrismaService["client"], "assessment">, councilId: string, classScope: { grade: string; academicYear: number }, assessmentId: string) {
    const assessment = await client.assessment.findFirst({
      where: {
        id: assessmentId,
        councilId,
        grade: classScope.grade as never,
        academicYear: classScope.academicYear,
        status: "OPEN",
      },
      select: { id: true, name: true, code: true, grade: true, academicYear: true, opensAt: true, closesAt: true },
    });
    if (!assessment) throw new NotFoundException("An open assessment for this class and academic year was not found.");
    return assessment;
  }

  async getMarkSheet(actor: TeacherActor, registrationId: string, classId: string, assessmentId: string) {
    const schoolClass = await this.resolveTeacherClass(actor, registrationId, classId);
    const assessment = await this.resolveOpenAssessment(this.prisma.client, schoolClass.councilId, schoolClass, assessmentId);
    const [areas, candidates] = await Promise.all([
      this.prisma.client.assessmentLearningArea.findMany({
        where: { assessmentId },
        orderBy: [{ sortOrder: "asc" }],
        select: { id: true, learningAreaCode: true, canonicalName: true, displayLabel: true, maxMarks: true, decimalPlaces: true, sortOrder: true },
      }),
      this.prisma.client.assessmentCandidate.findMany({
        where: { assessmentId, registrationId, schoolClassId: classId, status: "ACTIVE" },
        orderBy: [{ learnerNameSnapshot: "asc" }],
        select: {
          id: true, learnerNumberSnapshot: true, learnerNameSnapshot: true,
          marks: { orderBy: [{ assessmentLearningArea: { sortOrder: "asc" } }], select: { id: true, assessmentLearningAreaId: true, marks: true, status: true, submittedAt: true, returnedReason: true } },
        },
      }),
    ]);
    return {
      assessment,
      class: schoolClass,
      learningAreas: areas.map((area) => ({ ...area, maxMarks: Number(area.maxMarks) })),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        learnerNumber: candidate.learnerNumberSnapshot,
        learnerName: candidate.learnerNameSnapshot,
        marks: candidate.marks.map((mark) => ({ id: mark.id, assessmentLearningAreaId: mark.assessmentLearningAreaId, marks: mark.marks === null ? null : Number(mark.marks), status: mark.status, submittedAt: mark.submittedAt, returnedReason: mark.returnedReason })),
      })),
    };
  }

  async saveMark(actor: TeacherActor, registrationId: string, classId: string, assessmentId: string, input: UpdateAssessmentMarkDto) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const schoolClass = await this.resolveTeacherClass(actor, registrationId, classId);
        await this.resolveOpenAssessment(tx, schoolClass.councilId, schoolClass, assessmentId);
        const candidate = await tx.assessmentCandidate.findFirst({
          where: { id: input.candidateId, assessmentId, registrationId, schoolClassId: classId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!candidate) throw new NotFoundException("The learner is not an active participant in this class assessment.");
        const area = await tx.assessmentLearningArea.findFirst({
          where: { id: input.assessmentLearningAreaId, assessmentId },
          select: { id: true, maxMarks: true, decimalPlaces: true, canonicalName: true },
        });
        if (!area) throw new NotFoundException("The learning area is not part of this assessment.");
        if (input.marks > Number(area.maxMarks)) throw new BadRequestException(`Marks cannot exceed the maximum of ${area.maxMarks} for ${area.canonicalName}.`);
        const scale = 10 ** area.decimalPlaces;
        if (Math.abs(input.marks * scale - Math.round(input.marks * scale)) > 1e-8) {
          throw new BadRequestException(`Marks for ${area.canonicalName} allow at most ${area.decimalPlaces} decimal places.`);
        }
        const existing = await tx.assessmentMark.findFirst({
          where: { candidateId: candidate.id, assessmentLearningAreaId: area.id },
          select: { id: true, marks: true, status: true },
        });
        if (!existing) throw new NotFoundException("The assessment mark row was not initialized.");
        if (existing.status !== "DRAFT" && existing.status !== "RETURNED") {
          throw new ConflictException("Submitted marks are locked and require the formal correction process.");
        }
        const updated = await tx.assessmentMark.update({
          where: { id: existing.id },
          data: { marks: String(input.marks), enteredByAccountId: actor.accountId, returnedReason: null },
          select: { id: true, marks: true, status: true, updatedAt: true },
        });
        await tx.assessmentMarkRevision.create({
          data: {
            markId: existing.id,
            actorAccountId: actor.accountId,
            action: existing.marks === null ? "CREATED" : "UPDATED",
            previousMarks: existing.marks,
            newMarks: String(input.marks),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId: schoolClass.councilId,
            action: "ASSESSMENT_MARK_SAVED",
            resourceType: "AssessmentMark",
            resourceId: existing.id,
            decision: "ALLOW",
            metadata: { assessmentId, classId, candidateId: candidate.id, assessmentLearningAreaId: area.id },
          },
        });
        return { ...updated, marks: Number(updated.marks) };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (prismaCode(error) === "P2034") throw new ConflictException("The mark changed concurrently. Refresh the mark sheet and try again.");
      throw error;
    }
  }

  async submitClassMarks(actor: TeacherActor, registrationId: string, classId: string, assessmentId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const schoolClass = await this.resolveTeacherClass(actor, registrationId, classId);
      await this.resolveOpenAssessment(tx, schoolClass.councilId, schoolClass, assessmentId);
      const candidates = await tx.assessmentCandidate.findMany({
        where: { assessmentId, registrationId, schoolClassId: classId, status: "ACTIVE" },
        select: { id: true, marks: { select: { id: true, marks: true, status: true } } },
      });
      if (candidates.length === 0) throw new ConflictException("There are no active assessment candidates in this class.");
      const incomplete = candidates.flatMap((candidate) => candidate.marks.filter((mark) =>
        mark.marks === null || (mark.status !== "DRAFT" && mark.status !== "RETURNED"),
      ).map((mark) => mark.id));
      if (incomplete.length > 0) {
        throw new ConflictException(`${incomplete.length} mark entries are missing or already submitted. Complete every learning area before submitting this class.`);
      }
      const markIds = candidates.flatMap((candidate) => candidate.marks.map((mark) => mark.id));
      await tx.assessmentMark.updateMany({
        where: { id: { in: markIds }, status: { in: ["DRAFT", "RETURNED"] } },
        data: { status: "SUBMITTED", submittedAt: new Date(), enteredByAccountId: actor.accountId },
      });
      await tx.assessmentMarkRevision.createMany({
        data: markIds.map((markId) => ({
          markId,
          actorAccountId: actor.accountId,
          action: "SUBMITTED" as const,
        })),
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId: schoolClass.councilId,
          action: "ASSESSMENT_CLASS_MARKS_SUBMITTED",
          resourceType: "Assessment",
          resourceId: assessmentId,
          decision: "ALLOW",
          metadata: { registrationId, classId, candidateCount: candidates.length, markCount: markIds.length },
        },
      });
      return { success: true, candidateCount: candidates.length, markCount: markIds.length };
    }, { isolationLevel: "Serializable" });
  }
}
