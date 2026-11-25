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
          "Results cannot be calculated because one or more active candidates have missing or unsubmitted learning-area marks.",
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
          score >= Number(item.lowerBound) &&
          (score < Number(item.upperBound) ||
            (maxScore !== null && score === maxScore && Number(item.upperBound) === maxScore)),
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

    const areaGroups = new Map<string, { id: string; code: string; name: string; displayLabel: string; maximumMarks: number; candidateCount: number; totalMarks: number; totalPercentage: number; highestPercentage: number; lowestPercentage: number }>();
    const classGroups = new Map<string, { schoolId: string; schoolName: string; className: string; candidateCount: number; totalPercentage: number; topRank: number }>();
    const schoolAreaGroups = new Map<string, { schoolId: string; schoolName: string; areaId: string; areaLabel: string; candidateCount: number; totalPercentage: number }>();
    for (const row of rows) {
      const classKey = row.schoolIdSnapshot + ":" + row.schoolClassId;
      const classSummary = classGroups.get(classKey) ?? {
        schoolId: row.schoolIdSnapshot, schoolName: row.schoolNameSnapshot,
        className: row.schoolClassNameSnapshot, candidateCount: 0, totalPercentage: 0,
        topRank: Number.MAX_SAFE_INTEGER,
      };
      classSummary.candidateCount += 1;
      classSummary.totalPercentage += row.percentage;
      classSummary.topRank = Math.min(classSummary.topRank, row.rank);
      classGroups.set(classKey, classSummary);
      for (const area of row.learningAreas) {
        const group = areaGroups.get(area.assessmentLearningAreaId) ?? {
          id: area.assessmentLearningAreaId, code: area.learningAreaCode,
          name: area.learningAreaName, displayLabel: area.displayLabel,
          maximumMarks: area.maximumMarks, candidateCount: 0, totalMarks: 0,
          totalPercentage: 0, highestPercentage: 0, lowestPercentage: 100,
        };
        group.candidateCount += 1;
        group.totalMarks += area.marks;
        group.totalPercentage += area.percentage;
        group.highestPercentage = Math.max(group.highestPercentage, area.percentage);
        group.lowestPercentage = Math.min(group.lowestPercentage, area.percentage);
        areaGroups.set(area.assessmentLearningAreaId, group);
        const schoolAreaKey = row.schoolIdSnapshot + ":" + area.assessmentLearningAreaId;
        const schoolArea = schoolAreaGroups.get(schoolAreaKey) ?? {
          schoolId: row.schoolIdSnapshot, schoolName: row.schoolNameSnapshot,
          areaId: area.assessmentLearningAreaId, areaLabel: area.displayLabel,
          candidateCount: 0, totalPercentage: 0,
        };
        schoolArea.candidateCount += 1;
        schoolArea.totalPercentage += area.percentage;
        schoolAreaGroups.set(schoolAreaKey, schoolArea);
      }
    }
    const learningAreaSummaries = [...areaGroups.values()]
      .map((area) => ({
        assessmentLearningAreaId: area.id, code: area.code, name: area.name,
        displayLabel: area.displayLabel, maximumMarks: area.maximumMarks,
        candidateCount: area.candidateCount,
        averageMarks: round4(area.totalMarks / area.candidateCount),
        averagePercentage: round4(area.totalPercentage / area.candidateCount),
        highestPercentage: area.highestPercentage, lowestPercentage: area.lowestPercentage,
      }))
      .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
    const classSummaries = [...classGroups.values()]
      .map((item) => ({ ...item, averagePercentage: round4(item.totalPercentage / item.candidateCount) }))
      .sort((a, b) => b.averagePercentage - a.averagePercentage || a.className.localeCompare(b.className));
    const schoolLearningAreaSummaries = [...schoolAreaGroups.values()]
      .map((item) => ({ ...item, averagePercentage: round4(item.totalPercentage / item.candidateCount) }))
      .sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.areaLabel.localeCompare(b.areaLabel));

    const averagePercentage = round4(rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length);
    return {
      assessment,
      rows: sorted,
      schoolSummaries,
      learningAreaSummaries,
      classSummaries,
      schoolLearningAreaSummaries,
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
      learningAreas: prepared.learningAreaSummaries,
      classes: prepared.classSummaries,
      schoolLearningAreas: prepared.schoolLearningAreaSummaries,
    };
  }

  private summarizePublicationResults(results: Array<{
    registrationId: string;
    schoolIdSnapshot: string;
    schoolNameSnapshot: string;
    schoolClassId: string;
    schoolClassNameSnapshot: string;
    totalMarks: unknown;
    maximumMarks: unknown;
    percentage: unknown;
    rank: number;
    learningAreas: Array<{
      assessmentLearningAreaId: string;
      learningAreaCode: string;
      displayLabel: string;
      marks: unknown;
      maximumMarks: unknown;
      percentage: unknown;
      sortOrder: number;
    }>;
  }>) {
    const schoolGroups = new Map<string, { schoolId: string; schoolName: string; candidateCount: number; totalPercentage: number; topRank: number }>();
    const classGroups = new Map<string, { schoolId: string; schoolName: string; className: string; candidateCount: number; totalPercentage: number; topRank: number }>();
    const areaGroups = new Map<string, { id: string; code: string; displayLabel: string; maximumMarks: number; candidateCount: number; totalMarks: number; totalPercentage: number; highestPercentage: number; lowestPercentage: number }>();
    const schoolAreaGroups = new Map<string, { schoolId: string; schoolName: string; areaId: string; areaLabel: string; candidateCount: number; totalPercentage: number }>();

    for (const row of results) {
      const school = schoolGroups.get(row.registrationId) ?? {
        schoolId: row.schoolIdSnapshot, schoolName: row.schoolNameSnapshot,
        candidateCount: 0, totalPercentage: 0, topRank: Number.MAX_SAFE_INTEGER,
      };
      school.candidateCount += 1;
      school.totalPercentage += Number(row.percentage);
      school.topRank = Math.min(school.topRank, row.rank);
      schoolGroups.set(row.registrationId, school);

      const classKey = row.registrationId + ":" + row.schoolClassId;
      const classSummary = classGroups.get(classKey) ?? {
        schoolId: row.schoolIdSnapshot, schoolName: row.schoolNameSnapshot,
        className: row.schoolClassNameSnapshot, candidateCount: 0,
        totalPercentage: 0, topRank: Number.MAX_SAFE_INTEGER,
      };
      classSummary.candidateCount += 1;
      classSummary.totalPercentage += Number(row.percentage);
      classSummary.topRank = Math.min(classSummary.topRank, row.rank);
      classGroups.set(classKey, classSummary);

      for (const area of row.learningAreas) {
        const areaSummary = areaGroups.get(area.assessmentLearningAreaId) ?? {
          id: area.assessmentLearningAreaId, code: area.learningAreaCode,
          displayLabel: area.displayLabel, maximumMarks: Number(area.maximumMarks),
          candidateCount: 0, totalMarks: 0, totalPercentage: 0,
          highestPercentage: 0, lowestPercentage: 100,
        };
        const marks = Number(area.marks);
        const percentage = Number(area.percentage);
        areaSummary.candidateCount += 1;
        areaSummary.totalMarks += marks;
        areaSummary.totalPercentage += percentage;
        areaSummary.highestPercentage = Math.max(areaSummary.highestPercentage, percentage);
        areaSummary.lowestPercentage = Math.min(areaSummary.lowestPercentage, percentage);
        areaGroups.set(area.assessmentLearningAreaId, areaSummary);

        const schoolAreaKey = row.registrationId + ":" + area.assessmentLearningAreaId;
        const schoolArea = schoolAreaGroups.get(schoolAreaKey) ?? {
          schoolId: row.schoolIdSnapshot, schoolName: row.schoolNameSnapshot,
          areaId: area.assessmentLearningAreaId, areaLabel: area.displayLabel,
          candidateCount: 0, totalPercentage: 0,
        };
        schoolArea.candidateCount += 1;
        schoolArea.totalPercentage += percentage;
        schoolAreaGroups.set(schoolAreaKey, schoolArea);
      }
    }

    const schoolSummaries = [...schoolGroups.values()].map((school) => ({
      schoolId: school.schoolId,
      schoolName: school.schoolName,
      candidateCount: school.candidateCount,
      averagePercentage: round4(school.totalPercentage / school.candidateCount),
      topRank: school.topRank,
    })).sort((a, b) => b.averagePercentage - a.averagePercentage || a.schoolName.localeCompare(b.schoolName));

    const classSummaries = [...classGroups.values()].map((item) => ({
      ...item, averagePercentage: round4(item.totalPercentage / item.candidateCount),
    })).sort((a, b) => b.averagePercentage - a.averagePercentage || a.className.localeCompare(b.className));

    const learningAreaSummaries = [...areaGroups.values()].map((area) => ({
      assessmentLearningAreaId: area.id,
      code: area.code,
      displayLabel: area.displayLabel,
      maximumMarks: area.maximumMarks,
      candidateCount: area.candidateCount,
      averageMarks: round4(area.totalMarks / area.candidateCount),
      averagePercentage: round4(area.totalPercentage / area.candidateCount),
      highestPercentage: area.highestPercentage,
      lowestPercentage: area.lowestPercentage,
    })).sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));

    const schoolLearningAreaSummaries = [...schoolAreaGroups.values()].map((item) => ({
      ...item, averagePercentage: round4(item.totalPercentage / item.candidateCount),
    })).sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.areaLabel.localeCompare(b.areaLabel));

    const percentages = results.map((row) => Number(row.percentage));
    return {
      summary: {
        candidateCount: results.length,
        schoolCount: schoolGroups.size,
        averagePercentage: results.length ? round4(percentages.reduce((sum, value) => sum + value, 0) / results.length) : 0,
        highestPercentage: results.length ? Math.max(...percentages) : 0,
        lowestPercentage: results.length ? Math.min(...percentages) : 0,
        maximumMarks: results.length ? Number(results[0]!.maximumMarks) : 0,
      },
      schools: schoolSummaries,
      classes: classSummaries,
      learningAreas: learningAreaSummaries,
      schoolLearningAreas: schoolLearningAreaSummaries,
    };
  }

  async published(councilId: string, assessmentId: string) {
    const publication = await this.prisma.client.assessmentResultPublication.findFirst({
      where: { assessmentId, councilId, status: "PUBLISHED" },
      orderBy: { version: "desc" },
      include: {
        results: {
          orderBy: [{ rank: "asc" }],
          select: {
            registrationId: true, schoolIdSnapshot: true, schoolNameSnapshot: true,
            schoolClassId: true, schoolClassNameSnapshot: true,
            totalMarks: true, maximumMarks: true, percentage: true, rank: true,
            learningAreas: {
              orderBy: [{ sortOrder: "asc" }],
              select: {
                assessmentLearningAreaId: true, learningAreaCode: true,
                displayLabel: true, marks: true, maximumMarks: true,
                percentage: true, sortOrder: true,
              },
            },
          },
        },
      },
    });
    if (!publication) return null;
    return {
      publication: {
        id: publication.id,
        version: publication.version,
        status: publication.status,
        publishedAt: publication.publishedAt,
        candidateCount: publication.candidateCount,
        schoolCount: publication.schoolCount,
      },
      ...this.summarizePublicationResults(publication.results),
    };
  }

  async history(councilId: string, assessmentId: string) {
    const assessment = await this.prisma.client.assessment.findFirst({
      where: { id: assessmentId, councilId },
      select: { id: true },
    });
    if (!assessment) throw new NotFoundException("Assessment not found in this Council.");
    const publications = await this.prisma.client.assessmentResultPublication.findMany({
      where: { assessmentId, councilId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        status: true,
        publishedAt: true,
        candidateCount: true,
        schoolCount: true,
        _count: { select: { results: true } },
      },
    });
    return { publications: publications.map(({ _count, ...publication }) => ({ ...publication, resultCount: _count.results })) };
  }

  async version(councilId: string, assessmentId: string, version: number) {
    const publication = await this.prisma.client.assessmentResultPublication.findFirst({
      where: { assessmentId, councilId, version },
      include: {
        results: {
          orderBy: [{ rank: "asc" }],
          select: {
            registrationId: true, schoolIdSnapshot: true, schoolNameSnapshot: true,
            schoolClassId: true, schoolClassNameSnapshot: true,
            totalMarks: true, maximumMarks: true, percentage: true, rank: true,
            learningAreas: {
              orderBy: [{ sortOrder: "asc" }],
              select: {
                assessmentLearningAreaId: true, learningAreaCode: true,
                displayLabel: true, marks: true, maximumMarks: true,
                percentage: true, sortOrder: true,
              },
            },
          },
        },
      },
    });
    if (!publication) throw new NotFoundException("The requested result publication version was not found.");
    return {
      publication: {
        id: publication.id,
        version: publication.version,
        status: publication.status,
        publishedAt: publication.publishedAt,
        candidateCount: publication.candidateCount,
        schoolCount: publication.schoolCount,
      },
      ...this.summarizePublicationResults(publication.results),
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
