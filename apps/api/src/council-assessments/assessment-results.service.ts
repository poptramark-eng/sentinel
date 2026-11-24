import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

interface ResultActor { accountId: string }

type ResultQueryClient = Pick<PrismaService["client"], "assessment">;

function round4(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

@Injectable()
export class AssessmentResultsService {
  constructor(private readonly prisma: PrismaService) {}

  private async prepare(client: ResultQueryClient, councilId: string, assessmentId: string) {
    const assessment = await client.assessment.findFirst({
      where: { id: assessmentId, councilId, status: "CLOSED" },
      include: {
        learningAreas: { orderBy: [{ sortOrder: "asc" }] },
        rubricBands: { orderBy: [{ sortOrder: "asc" }] },
        rubricVersion: {
          select: {
            versionLabel: true,
            scaleType: true,
            scoreUnit: true,
            minScore: true,
            maxScore: true,
            rubric: { select: { code: true, name: true } },
          },
        },
        candidates: {
          where: { status: "ACTIVE" },
          orderBy: [{ learnerNameSnapshot: "asc" }],
          select: {
            id: true,
            registrationId: true,
            schoolClassId: true,
            schoolIdSnapshot: true,
            schoolNameSnapshot: true,
            learnerNumberSnapshot: true,
            learnerNameSnapshot: true,
            classGradeSnapshot: true,
            classStreamSnapshot: true,
            marks: {
              select: {
                assessmentLearningAreaId: true,
                marks: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!assessment) throw new NotFoundException("A closed assessment was not found in this Council.");
    if (assessment.learningAreas.length === 0) {
      throw new ConflictException("The assessment has no snapshotted learning areas.");
    }
    if (assessment.candidates.length === 0) {
      throw new ConflictException("There are no active candidates to include in results.");
    }

    const maximumMarks = round4(assessment.learningAreas.reduce((sum, area) => sum + Number(area.maxMarks), 0));
    if (maximumMarks <= 0) throw new ConflictException("The assessment maximum mark total must be greater than zero.");

    const rows = assessment.candidates.map((candidate) => {
      const markByArea = new Map(candidate.marks.map((mark) => [mark.assessmentLearningAreaId, mark]));
      if (candidate.marks.length !== assessment.learningAreas.length ||
        assessment.learningAreas.some((area) => {
          const mark = markByArea.get(area.id);
          return !mark || mark.status !== "SUBMITTED" || mark.marks === null;
        })) {
        throw new ConflictException(
          `Results cannot be calculated: ${candidate.learnerNumberSnapshot} has missing or unsubmitted learning-area marks.`,
        );
      }
      const learningAreas = assessment.learningAreas.map((area) => {
        const mark = markByArea.get(area.id)!;
        const marks = Number(mark.marks);
        const max = Number(area.maxMarks);
        return {
          assessmentLearningAreaId: area.id,
          learningAreaCode: area.learningAreaCode,
          learningAreaName: area.canonicalName,
          displayLabel: area.displayLabel?.trim() || area.sourceLabel,
          marks,
          maximumMarks: max,
          percentage: round4((marks / max) * 100),
          sortOrder: area.sortOrder,
        };
      });
      const totalMarks = round4(learningAreas.reduce((sum, area) => sum + area.marks, 0));
      const percentage = round4((totalMarks / maximumMarks) * 100);
      return {
        candidateId: candidate.id,
        registrationId: candidate.registrationId,
        schoolClassId: candidate.schoolClassId,
        schoolIdSnapshot: candidate.schoolIdSnapshot,
        schoolNameSnapshot: candidate.schoolNameSnapshot,
        learnerNumberSnapshot: candidate.learnerNumberSnapshot,
        learnerNameSnapshot: candidate.learnerNameSnapshot,
        gradeSnapshot: candidate.classGradeSnapshot,
        schoolClassNameSnapshot: `${candidate.classGradeSnapshot} · ${candidate.classStreamSnapshot}`,
        totalMarks,
        maximumMarks,
        percentage,
        learningAreas,
        rank: 0,
        overallBandCode: null as string | null,
        overallBandLabel: null as string | null,
      };
    });

    const scoreUnit = assessment.rubricVersion.scoreUnit?.trim().toLowerCase() ?? "";
    const minScore = assessment.rubricVersion.minScore === null ? null : Number(assessment.rubricVersion.minScore);
    const maxScore = assessment.rubricVersion.maxScore === null ? null : Number(assessment.rubricVersion.maxScore);
    let classificationMode: "PERCENTAGE" | "RAW_MARKS" | "UNCONFIGURED" = "UNCONFIGURED";
    if (assessment.rubricVersion.scaleType === "NUMERIC_BANDS" &&
      ["percentage", "percent", "%"].includes(scoreUnit) && minScore === 0 && maxScore === 100) {
      classificationMode = "PERCENTAGE";
    } else if (assessment.rubricVersion.scaleType === "NUMERIC_BANDS" &&
      ["marks", "mark", "raw marks"].includes(scoreUnit) && minScore === 0 && maxScore === maximumMarks) {
      classificationMode = "RAW_MARKS";
    }

    const sorted = [...rows].sort((a, b) =>
      b.totalMarks - a.totalMarks || a.learnerNameSnapshot.localeCompare(b.learnerNameSnapshot),
    );
    let previousScore: number | null = null;
    let currentRank = 0;
    sorted.forEach((row, index) => {
      const scoreKey = Math.round(row.totalMarks * 10_000);
      if (previousScore !== scoreKey) currentRank = index + 1;
      row.rank = currentRank;
      previousScore = scoreKey;
      if (classificationMode !== "UNCONFIGURED") {
        const score = classificationMode === "PERCENTAGE" ? row.percentage : row.totalMarks;
        const band = assessment.rubricBands.find((item) =>
          item.lowerBound !== null && item.upperBound !== null &&
          score >= Number(item.lowerBound) && score < Number(item.upperBound),
        );
        row.overallBandCode = band?.code ?? null;
        row.overallBandLabel = band?.label ?? null;
      }
    });

    const schoolGroups = new Map<string, { schoolId: string; schoolName: string; candidateCount: number; totalPercentage: number; topRank: number }>();
    for (const row of rows) {
      const existing = schoolGroups.get(row.schoolIdSnapshot) ?? {
        schoolId: row.schoolIdSnapshot,
        schoolName: row.schoolNameSnapshot,
        candidateCount: 0,
        totalPercentage: 0,
        topRank: Number.MAX_SAFE_INTEGER,
      };
      existing.candidateCount += 1;
      existing.totalPercentage += row.percentage;
      existing.topRank = Math.min(existing.topRank, row.rank);
      schoolGroups.set(row.schoolIdSnapshot, existing);
    }
    const schoolSummaries = [...schoolGroups.values()]
      .map((school) => ({
        schoolId: school.schoolId,
        schoolName: school.schoolName,
        candidateCount: school.candidateCount,
        averagePercentage: round4(school.totalPercentage / school.candidateCount),
        topRank: school.topRank,
      }))
      .sort((a, b) => a.averagePercentage === b.averagePercentage
        ? a.schoolName.localeCompare(b.schoolName)
        : b.averagePercentage - a.averagePercentage);

    const averagePercentage = round4(rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length);
    return {
      assessment,
      rows: sorted,
      schoolSummaries,
      summary: {
        candidateCount: rows.length,
        schoolCount: schoolGroups.size,
        learningAreaCount: assessment.learningAreas.length,
        maximumMarks,
        averagePercentage,
        highestPercentage: Math.max(...rows.map((row) => row.percentage)),
        lowestPercentage: Math.min(...rows.map((row) => row.percentage)),
      },
      classificationMode,
    };
  }

  async preview(councilId: string, assessmentId: string) {
    const prepared = await this.prepare(this.prisma.client, councilId, assessmentId);
    return {
      assessment: {
        id: prepared.assessment.id,
        name: prepared.assessment.name,
        code: prepared.assessment.code,
        academicYear: prepared.assessment.academicYear,
        grade: prepared.assessment.grade,
        rubric: prepared.assessment.rubricVersion.rubric,
        rubricVersion: prepared.assessment.rubricVersion.versionLabel,
      },
      summary: prepared.summary,
      classification: {
        mode: prepared.classificationMode,
        note: prepared.classificationMode === "UNCONFIGURED"
          ? "No numeric classification is applied. The selected rubric does not explicitly define percentage or raw-mark boundaries that match this assessment."
          : "Classifications use only the published numeric rubric bands and the explicitly configured score unit.",
      },
      schools: prepared.schoolSummaries,
      candidates: prepared.rows.slice(0, 50).map((row) => ({
        learnerNumber: row.learnerNumberSnapshot,
        learnerName: row.learnerNameSnapshot,
        schoolName: row.schoolNameSnapshot,
        totalMarks: row.totalMarks,
        maximumMarks: row.maximumMarks,
        percentage: row.percentage,
        rank: row.rank,
        overallBandCode: row.overallBandCode,
        overallBandLabel: row.overallBandLabel,
      })),
      candidateRowsReturned: Math.min(prepared.rows.length, 50),
      truncated: prepared.rows.length > 50,
    };
  }

  async published(councilId: string, assessmentId: string) {
    const publication = await this.prisma.client.assessmentResultPublication.findFirst({
      where: { assessmentId, councilId, status: "PUBLISHED" },
      orderBy: { version: "desc" },
      include: {
        results: {
          orderBy: [{ rank: "asc" }],
          include: { learningAreas: { orderBy: [{ sortOrder: "asc" }] } },
        },
      },
    });
    if (!publication) return null;
    return {
      publication: {
        id: publication.id,
        version: publication.version,
        publishedAt: publication.publishedAt,
        candidateCount: publication.candidateCount,
        schoolCount: publication.schoolCount,
      },
      results: publication.results,
    };
  }

  async publish(actor: ResultActor, councilId: string, assessmentId: string) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const prepared = await this.prepare(tx, councilId, assessmentId);
        const existing = await tx.assessmentResultPublication.findFirst({
          where: { assessmentId, status: "PUBLISHED" },
          select: { id: true },
        });
        if (existing) throw new ConflictException("Results have already been published for this assessment.");

        const previous = await tx.assessmentResultPublication.findFirst({
          where: { assessmentId },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const publication = await tx.assessmentResultPublication.create({
          data: {
            assessmentId,
            councilId,
            version: (previous?.version ?? 0) + 1,
            publishedByAccountId: actor.accountId,
            candidateCount: prepared.summary.candidateCount,
            schoolCount: prepared.summary.schoolCount,
          },
        });

        for (const row of prepared.rows) {
          await tx.assessmentResult.create({
            data: {
              publicationId: publication.id,
              assessmentId,
              candidateId: row.candidateId,
              registrationId: row.registrationId,
              schoolClassId: row.schoolClassId,
              schoolIdSnapshot: row.schoolIdSnapshot,
              learnerNumberSnapshot: row.learnerNumberSnapshot,
              learnerNameSnapshot: row.learnerNameSnapshot,
              schoolNameSnapshot: row.schoolNameSnapshot,
              schoolClassNameSnapshot: row.schoolClassNameSnapshot,
              gradeSnapshot: row.gradeSnapshot,
              totalMarks: String(row.totalMarks),
              maximumMarks: String(row.maximumMarks),
              percentage: String(row.percentage),
              rank: row.rank,
              overallBandCode: row.overallBandCode,
              overallBandLabel: row.overallBandLabel,
              learningAreas: {
                createMany: {
                  data: row.learningAreas.map((area) => ({
                    assessmentId,
                    assessmentLearningAreaId: area.assessmentLearningAreaId,
                    learningAreaCode: area.learningAreaCode,
                    learningAreaName: area.learningAreaName,
                    displayLabel: area.displayLabel,
                    marks: String(area.marks),
                    maximumMarks: String(area.maximumMarks),
                    percentage: String(area.percentage),
                    sortOrder: area.sortOrder,
                  })),
                },
              },
            },
          });
        }

        const released = await tx.assessment.update({
          where: { id: assessmentId },
          data: { status: "RELEASED" },
          select: { id: true, status: true },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId,
            action: "ASSESSMENT_RESULTS_PUBLISHED",
            resourceType: "AssessmentResultPublication",
            resourceId: publication.id,
            decision: "ALLOW",
            metadata: {
              assessmentId,
              version: publication.version,
              candidateCount: prepared.summary.candidateCount,
              schoolCount: prepared.summary.schoolCount,
              averagePercentage: prepared.summary.averagePercentage,
              classificationMode: prepared.classificationMode,
            },
          },
        });
        return {
          publicationId: publication.id,
          version: publication.version,
          publishedAt: publication.publishedAt,
          assessment: released,
          summary: prepared.summary,
        };
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
    } catch (error) {
      if (prismaCode(error) === "P2034" || prismaCode(error) === "P2002") {
        throw new ConflictException("Results changed or were published concurrently. Refresh the assessment and try again.");
      }
      throw error;
    }
  }
}
