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
        personId: actor.personId, role: "TEACHER", status: "ACTIVE", endsAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
        staffAssignments: { some: { type: { in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] }, status: "ACTIVE", endsAt: null, startsAt: { lte: now }, schoolClass: { is: { status: "ACTIVE" } } } },
      },
      select: {
        id: true, registrationId: true, councilId: true,
        registration: { select: { school: { select: { name: true } }, council: { select: { name: true } } } },
        staffAssignments: {
          where: { type: { in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] }, status: "ACTIVE", endsAt: null, startsAt: { lte: now }, schoolClass: { is: { status: "ACTIVE" } } },
          select: {
            id: true, type: true,
            schoolClass: { select: { id: true, grade: true, academicYear: true, streamCode: true, displayName: true } },
            councilGradeLearningArea: { select: { id: true, displayLabel: true, gradeLearningArea: { select: { sourceLabel: true, learningArea: { select: { code: true, canonicalName: true } } } } } },
          },
        },
      },
    });
    const grouped = new Map<string, { membershipId: string; registrationId: string; councilId: string; schoolName: string; councilName: string; schoolClass: (typeof memberships)[number]["staffAssignments"][number]["schoolClass"]; isClassTeacher: boolean; learningAreas: { id: string; code: string; name: string }[] }>();
    for (const membership of memberships) {
      for (const assignment of membership.staffAssignments) {
        const key = assignment.schoolClass.id;
        const current = grouped.get(key) ?? {
          membershipId: membership.id, registrationId: membership.registrationId, councilId: membership.councilId,
          schoolName: membership.registration.school.name, councilName: membership.registration.council.name,
          schoolClass: assignment.schoolClass, isClassTeacher: false, learningAreas: [],
        };
        if (assignment.type === "CLASS_TEACHER") current.isClassTeacher = true;
        if (assignment.type === "SUBJECT_TEACHER" && assignment.councilGradeLearningArea) {
          const mapping = assignment.councilGradeLearningArea;
          current.learningAreas.push({ id: mapping.id, code: mapping.gradeLearningArea.learningArea.code, name: mapping.displayLabel?.trim() || mapping.gradeLearningArea.sourceLabel || mapping.gradeLearningArea.learningArea.canonicalName });
        }
        grouped.set(key, current);
      }
    }
    return Promise.all([...grouped.values()].map(async (item) => {
      const assessments = await this.prisma.client.assessment.findMany({
        where: { councilId: item.councilId, grade: item.schoolClass.grade, academicYear: item.schoolClass.academicYear, status: "OPEN" },
        orderBy: [{ opensAt: "asc" }, { name: "asc" }],
        select: { id: true, name: true, code: true, opensAt: true, closesAt: true },
      });
      return { ...item, learningAreas: item.learningAreas, assessments };
    }));
  }

  private async resolveSchoolClass(client: Pick<PrismaService["client"], "schoolClass">, registrationId: string, classId: string) {
    const schoolClass = await client.schoolClass.findFirst({
      where: {
        id: classId,
        registrationId,
        status: "ACTIVE",
        registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
      },
      select: { id: true, registrationId: true, councilId: true, grade: true, academicYear: true },
    });
    if (!schoolClass) throw new NotFoundException("The class was not found in an approved school.");
    return schoolClass;
  }

  private async assertTeacherAccess(client: Pick<PrismaService["client"], "schoolMembership">, actor: TeacherActor, schoolClass: { id: string; registrationId: string; councilId: string }, councilGradeLearningAreaId?: string) {
    if (!councilGradeLearningAreaId) {
      throw new ForbiddenException("Teacher mark access requires an explicit Subject Teacher assignment for one learning area. Class coordination alone does not grant marks access.");
    }
    const now = new Date();
    const membership = await client.schoolMembership.findFirst({
      where: {
        registrationId: schoolClass.registrationId,
        councilId: schoolClass.councilId,
        personId: actor.personId,
        role: "TEACHER",
        status: "ACTIVE",
        endsAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        staffAssignments: {
          some: {
            schoolClassId: schoolClass.id,
            type: "SUBJECT_TEACHER",
            councilGradeLearningAreaId,
            status: "ACTIVE",
            endsAt: null,
            startsAt: { lte: now },
          },
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException("Only the active Subject Teacher assigned to this learning area may manage its marks. Class Teacher coordination does not bypass subject assignments.");
    }
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

  async getMarkSheet(actor: TeacherActor, registrationId: string, classId: string, assessmentId: string, learningAreaId?: string) {
    const schoolClass = await this.resolveSchoolClass(this.prisma.client, registrationId, classId);
    const assessment = await this.resolveOpenAssessment(this.prisma.client, schoolClass.councilId, schoolClass, assessmentId);
    if (!learningAreaId) throw new ForbiddenException("A Subject Teacher must open marks for an explicitly assigned learning area.");
    const requestedArea = await this.prisma.client.assessmentLearningArea.findFirst({
      where: { id: learningAreaId, assessmentId }, select: { id: true, councilGradeLearningAreaId: true },
    });
    if (!requestedArea) throw new NotFoundException("The learning area is not part of this assessment.");
    await this.assertTeacherAccess(this.prisma.client, actor, schoolClass, requestedArea.councilGradeLearningAreaId);
    const areaWhere = { assessmentId, ...(learningAreaId ? { id: learningAreaId } : {}) };
    const [areas, candidates] = await Promise.all([
      this.prisma.client.assessmentLearningArea.findMany({
        where: areaWhere,
        orderBy: [{ sortOrder: "asc" }],
        select: { id: true, learningAreaCode: true, canonicalName: true, displayLabel: true, maxMarks: true, decimalPlaces: true, sortOrder: true },
      }),
      this.prisma.client.assessmentCandidate.findMany({
        where: { assessmentId, registrationId, schoolClassId: classId, status: "ACTIVE" },
        orderBy: [{ learnerNameSnapshot: "asc" }],
        select: {
          id: true, learnerNumberSnapshot: true, learnerNameSnapshot: true,
          marks: { ...(learningAreaId ? { where: { assessmentLearningAreaId: learningAreaId } } : {}), orderBy: [{ assessmentLearningArea: { sortOrder: "asc" } }], select: { id: true, assessmentLearningAreaId: true, marks: true, status: true, submittedAt: true, returnedReason: true } },
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
        const schoolClass = await this.resolveSchoolClass(tx, registrationId, classId);
        await this.resolveOpenAssessment(tx, schoolClass.councilId, schoolClass, assessmentId);
        const candidate = await tx.assessmentCandidate.findFirst({
          where: { id: input.candidateId, assessmentId, registrationId, schoolClassId: classId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!candidate) throw new NotFoundException("The learner is not an active participant in this class assessment.");
        const area = await tx.assessmentLearningArea.findFirst({
          where: { id: input.assessmentLearningAreaId, assessmentId },
          select: { id: true, councilGradeLearningAreaId: true, maxMarks: true, decimalPlaces: true, canonicalName: true },
        });
        if (!area) throw new NotFoundException("The learning area is not part of this assessment.");
        await this.assertTeacherAccess(tx, actor, schoolClass, area.councilGradeLearningAreaId);
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
          data: {
            marks: String(input.marks),
            enteredByAccountId: actor.accountId,
            status: existing.status === "RETURNED" ? "DRAFT" : existing.status,
            returnedReason: null,
          },
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

  async submitLearningAreaMarks(actor: TeacherActor, registrationId: string, classId: string, assessmentId: string, learningAreaId?: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const schoolClass = await this.resolveSchoolClass(tx, registrationId, classId);
      await this.resolveOpenAssessment(tx, schoolClass.councilId, schoolClass, assessmentId);
      if (!learningAreaId) throw new ForbiddenException("A Subject Teacher must submit marks for an explicitly assigned learning area.");
      const requestedArea = await tx.assessmentLearningArea.findFirst({ where: { id: learningAreaId, assessmentId }, select: { id: true, councilGradeLearningAreaId: true, canonicalName: true } });
      if (!requestedArea) throw new NotFoundException("The learning area is not part of this assessment.");
      await this.assertTeacherAccess(tx, actor, schoolClass, requestedArea.councilGradeLearningAreaId);
      const candidates = await tx.assessmentCandidate.findMany({
        where: { assessmentId, registrationId, schoolClassId: classId, status: "ACTIVE" },
        select: { id: true, marks: { ...(learningAreaId ? { where: { assessmentLearningAreaId: learningAreaId } } : {}), select: { id: true, marks: true, status: true } } },
      });
      if (candidates.length === 0) throw new ConflictException("There are no active assessment candidates in this class.");
      if (learningAreaId && candidates.some((candidate) => candidate.marks.length !== 1)) throw new ConflictException("The selected learning area is not initialized for every active candidate.");
      const incomplete = candidates.flatMap((candidate) => candidate.marks.filter((mark) =>
        mark.marks === null || (mark.status !== "DRAFT" && mark.status !== "RETURNED"),
      ).map((mark) => mark.id));
      if (incomplete.length > 0) {
        throw new ConflictException(`${incomplete.length} mark entries are missing or already submitted. Complete ${learningAreaId ? "this learning area for every candidate" : "every learning area for every candidate"} before submitting.`);
      }
      const markIds = candidates.flatMap((candidate) => candidate.marks.map((mark) => mark.id));
      await tx.assessmentMark.updateMany({
        where: { id: { in: markIds }, status: { in: ["DRAFT", "RETURNED"] } },
        data: { status: "SUBMITTED", submittedAt: new Date(), enteredByAccountId: actor.accountId, returnedReason: null },
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
          action: learningAreaId ? "ASSESSMENT_LEARNING_AREA_MARKS_SUBMITTED" : "ASSESSMENT_CLASS_MARKS_SUBMITTED",
          resourceType: "Assessment",
          resourceId: assessmentId,
          decision: "ALLOW",
          metadata: { registrationId, classId, learningAreaId: learningAreaId ?? null, candidateCount: candidates.length, markCount: markIds.length },
        },
      });
      return { success: true, candidateCount: candidates.length, markCount: markIds.length, learningAreaId: learningAreaId ?? null };
    }, { isolationLevel: "Serializable" });
  }
}
