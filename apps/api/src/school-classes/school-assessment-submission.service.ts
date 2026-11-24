import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

interface SchoolAdministratorActor { accountId: string; personId: string }

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

@Injectable()
export class SchoolAssessmentSubmissionService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveSchoolScope(client: Pick<PrismaService["client"], "schoolMembership">, actor: SchoolAdministratorActor, registrationId: string) {
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
      select: { id: true, registrationId: true, councilId: true, registration: { select: { school: { select: { name: true } }, council: { select: { name: true } } } } },
    });
    if (!membership) throw new ForbiddenException("An active School Administrator membership for this approved school is required.");
    return membership;
  }

  private async resolveAssessment(client: Pick<PrismaService["client"], "assessment">, councilId: string, assessmentId: string) {
    const assessment = await client.assessment.findFirst({
      where: { id: assessmentId, councilId },
      select: { id: true, councilId: true, name: true, code: true, grade: true, academicYear: true, status: true, opensAt: true, closesAt: true },
    });
    if (!assessment) throw new NotFoundException("The assessment was not found in this Council.");
    return assessment;
  }

  private async collectProgress(client: Pick<PrismaService["client"], "assessmentCandidate" | "assessmentLearningArea">, assessmentId: string, registrationId: string) {
    const [areas, candidates] = await Promise.all([
      client.assessmentLearningArea.findMany({
        where: { assessmentId }, orderBy: [{ sortOrder: "asc" }],
        select: { id: true, learningAreaCode: true, canonicalName: true, displayLabel: true, maxMarks: true, sortOrder: true },
      }),
      client.assessmentCandidate.findMany({
        where: { assessmentId, registrationId, status: "ACTIVE" },
        orderBy: [{ learnerNameSnapshot: "asc" }],
        select: {
          id: true, schoolClassId: true,
          schoolClass: { select: { grade: true, academicYear: true, streamCode: true, displayName: true } },
          marks: { select: { id: true, assessmentLearningAreaId: true, marks: true, status: true, updatedAt: true, returnedReason: true } },
        },
      }),
    ]);
    const expectedMarkCount = candidates.length * areas.length;
    const markRows = candidates.flatMap((candidate) => candidate.marks);
    const submittedMarks = markRows.filter((mark) => mark.status === "SUBMITTED" && mark.marks !== null);
    const returnedMarks = markRows.filter((mark) => mark.status === "RETURNED");
    const missingMarks = Math.max(0, expectedMarkCount - markRows.length) + markRows.filter((mark) => mark.marks === null).length;
    const isComplete = candidates.length > 0 && areas.length > 0 && markRows.length === expectedMarkCount && submittedMarks.length === expectedMarkCount;

    const areaProgress = areas.map((area) => {
      const marks = markRows.filter((mark) => mark.assessmentLearningAreaId === area.id);
      const submittedCount = marks.filter((mark) => mark.status === "SUBMITTED" && mark.marks !== null).length;
      const returnedCount = marks.filter((mark) => mark.status === "RETURNED").length;
      return {
        id: area.id, code: area.learningAreaCode,
        name: area.displayLabel?.trim() || area.canonicalName,
        maxMarks: Number(area.maxMarks), candidateCount: candidates.length,
        submittedCount, returnedCount,
        pendingCount: Math.max(0, candidates.length - submittedCount - returnedCount),
        complete: submittedCount === candidates.length && candidates.length > 0,
      };
    });

    const classMap = new Map<string, { id: string; grade: string; academicYear: number; streamCode: string; displayName: string | null; candidateCount: number; submittedCount: number; expectedMarkCount: number }>();
    for (const candidate of candidates) {
      const current = classMap.get(candidate.schoolClassId) ?? {
        id: candidate.schoolClassId,
        grade: candidate.schoolClass.grade,
        academicYear: candidate.schoolClass.academicYear,
        streamCode: candidate.schoolClass.streamCode,
        displayName: candidate.schoolClass.displayName,
        candidateCount: 0, submittedCount: 0, expectedMarkCount: 0,
      };
      current.candidateCount += 1;
      current.expectedMarkCount += areas.length;
      current.submittedCount += candidate.marks.filter((mark) => mark.status === "SUBMITTED" && mark.marks !== null).length;
      classMap.set(candidate.schoolClassId, current);
    }
    return {
      candidateCount: candidates.length,
      learningAreaCount: areas.length,
      expectedMarkCount,
      submittedMarkCount: submittedMarks.length,
      returnedMarkCount: returnedMarks.length,
      missingMarkCount: missingMarks,
      pendingMarkCount: Math.max(0, expectedMarkCount - submittedMarks.length - returnedMarks.length),
      isComplete,
      learningAreas: areaProgress,
      returnedReasons: candidates.flatMap((candidate) => candidate.marks
        .filter((mark) => mark.status === "RETURNED" && mark.returnedReason)
        .map((mark) => ({
          className: candidate.schoolClass.displayName || `${candidate.schoolClass.grade.replace("GRADE_", "Grade ")} · ${candidate.schoolClass.streamCode}`,
          learningAreaName: areas.find((area) => area.id === mark.assessmentLearningAreaId)?.displayLabel?.trim()
            || areas.find((area) => area.id === mark.assessmentLearningAreaId)?.canonicalName
            || "Learning area",
          reason: mark.returnedReason!,
        }))),
      classes: [...classMap.values()].sort((a, b) => a.grade.localeCompare(b.grade) || a.streamCode.localeCompare(b.streamCode)),
      candidates,
    };
  }

  async listSchoolAssessments(actor: SchoolAdministratorActor, registrationId: string) {
    const scope = await this.resolveSchoolScope(this.prisma.client, actor, registrationId);
    const assessments = await this.prisma.client.assessment.findMany({
      where: {
        councilId: scope.councilId,
        status: { in: ["OPEN", "CLOSED", "RELEASED"] },
        candidates: { some: { registrationId: scope.registrationId, status: "ACTIVE" } },
      },
      orderBy: [{ academicYear: "desc" }, { opensAt: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, code: true, grade: true, academicYear: true, status: true, opensAt: true, closesAt: true,
        schoolSubmissions: {
          where: { registrationId: scope.registrationId },
          select: { id: true, status: true, version: true, submittedAt: true, returnedAt: true, returnedReason: true },
        },
      },
    });
    return Promise.all(assessments.map(async (assessment) => {
      const progress = await this.collectProgress(this.prisma.client, assessment.id, scope.registrationId);
      const summary = Object.fromEntries(Object.entries(progress).filter(([key]) => key !== "candidates")) as Omit<typeof progress, "candidates">;
      const submission = assessment.schoolSubmissions[0] ?? null;
      return {
        id: assessment.id, name: assessment.name, code: assessment.code, grade: assessment.grade,
        academicYear: assessment.academicYear, status: assessment.status, opensAt: assessment.opensAt, closesAt: assessment.closesAt,
        progress: summary,
        submission,
        canSubmit: assessment.status === "OPEN" && progress.isComplete && submission?.status !== "SUBMITTED",
      };
    }));
  }

  async getSubmission(actor: SchoolAdministratorActor, registrationId: string, assessmentId: string) {
    const scope = await this.resolveSchoolScope(this.prisma.client, actor, registrationId);
    const assessment = await this.resolveAssessment(this.prisma.client, scope.councilId, assessmentId);
    const [progress, submission] = await Promise.all([
      this.collectProgress(this.prisma.client, assessmentId, scope.registrationId),
      this.prisma.client.assessmentSchoolSubmission.findUnique({
        where: { assessmentId_registrationId: { assessmentId, registrationId: scope.registrationId } },
        include: {
          versions: {
            orderBy: { version: "desc" },
            select: {
              version: true, candidateCount: true, markCount: true, createdAt: true,
              submittedBy: { select: { person: { select: { displayName: true, givenName: true, familyName: true } } } },
            },
          },
        },
      }),
    ]);
    const summary = Object.fromEntries(Object.entries(progress).filter(([key]) => key !== "candidates")) as Omit<typeof progress, "candidates">;
    return {
      school: { name: scope.registration.school.name },
      council: { name: scope.registration.council.name },
      assessment,
      progress: summary,
      submission: submission ? {
        id: submission.id, status: submission.status, version: submission.version,
        candidateCount: submission.candidateCount, markCount: submission.markCount,
        submittedAt: submission.submittedAt, returnedAt: submission.returnedAt,
        returnedReason: submission.returnedReason,
        versions: submission.versions.map((version) => ({
          version: version.version, candidateCount: version.candidateCount, markCount: version.markCount, createdAt: version.createdAt,
          submittedBy: version.submittedBy.person.displayName?.trim() || `${version.submittedBy.person.givenName} ${version.submittedBy.person.familyName}`.trim(),
        })),
      } : null,
      canSubmit: assessment.status === "OPEN" && progress.isComplete && submission?.status !== "SUBMITTED",
    };
  }

  async submitSchoolAssessment(actor: SchoolAdministratorActor, registrationId: string, assessmentId: string) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const scope = await this.resolveSchoolScope(tx, actor, registrationId);
        const assessment = await this.resolveAssessment(tx, scope.councilId, assessmentId);
        if (assessment.status !== "OPEN") throw new ConflictException("School submissions are accepted only while the assessment is open.");
        const progress = await this.collectProgress(tx, assessmentId, scope.registrationId);
        if (!progress.isComplete) {
          throw new ConflictException(`School submission is blocked: ${progress.candidateCount} candidates, ${progress.submittedMarkCount}/${progress.expectedMarkCount} submitted marks, ${progress.returnedMarkCount} returned marks and ${progress.missingMarkCount} missing values. Complete every learning area for every active candidate first.`);
        }

        const existing = await tx.assessmentSchoolSubmission.findUnique({
          where: { assessmentId_registrationId: { assessmentId, registrationId: scope.registrationId } },
          select: { id: true, status: true, version: true },
        });
        if (existing?.status === "SUBMITTED") {
          return { success: true, idempotent: true, submissionId: existing.id, version: existing.version, status: existing.status };
        }

        const now = new Date();
        const version = existing ? existing.version + 1 : 1;
        const submission = existing
          ? await tx.assessmentSchoolSubmission.update({
              where: { id: existing.id },
              data: { version, status: "SUBMITTED", candidateCount: progress.candidateCount, markCount: progress.expectedMarkCount, submittedByAccountId: actor.accountId, submittedAt: now, returnedByAccountId: null, returnedAt: null, returnedReason: null },
              select: { id: true, version: true, status: true, submittedAt: true },
            })
          : await tx.assessmentSchoolSubmission.create({
              data: { assessmentId, councilId: scope.councilId, registrationId: scope.registrationId, version, status: "SUBMITTED", candidateCount: progress.candidateCount, markCount: progress.expectedMarkCount, submittedByAccountId: actor.accountId, submittedAt: now },
              select: { id: true, version: true, status: true, submittedAt: true },
            });

        const snapshot = progress.candidates.flatMap((candidate) => candidate.marks.map((mark) => ({
          candidateId: candidate.id,
          schoolClassId: candidate.schoolClassId,
          markId: mark.id,
          assessmentLearningAreaId: mark.assessmentLearningAreaId,
          marks: mark.marks === null ? null : String(mark.marks),
        })));
        await tx.assessmentSchoolSubmissionVersion.create({
          data: { submissionId: submission.id, version, submittedByAccountId: actor.accountId, candidateCount: progress.candidateCount, markCount: progress.expectedMarkCount, snapshot },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId, councilId: scope.councilId,
            action: existing ? "SCHOOL_ASSESSMENT_RESUBMITTED" : "SCHOOL_ASSESSMENT_SUBMITTED",
            resourceType: "AssessmentSchoolSubmission", resourceId: submission.id, decision: "ALLOW",
            metadata: { assessmentId, registrationId: scope.registrationId, version, candidateCount: progress.candidateCount, learningAreaCount: progress.learningAreaCount, markCount: progress.expectedMarkCount },
          },
        });
        return { success: true, idempotent: false, submissionId: submission.id, version: submission.version, status: submission.status, submittedAt: submission.submittedAt };
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (prismaCode(error) === "P2034" || prismaCode(error) === "P2002") {
        throw new ConflictException("The school submission changed concurrently. Refresh the submission summary and try again.");
      }
      throw error;
    }
  }
}
