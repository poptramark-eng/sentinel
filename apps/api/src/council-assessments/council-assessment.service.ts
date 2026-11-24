import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CreateAssessmentDto } from "./dto/create-assessment.dto";
import { CreateRubricDto, CreateRubricBandDto, CreateRubricVersionDto } from "./dto/create-rubric.dto";
import { ScheduleAssessmentDto } from "./dto/schedule-assessment.dto";

interface CouncilActor { accountId: string; }

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function validateRubricBands(
  scaleType: CreateRubricDto["scaleType"],
  minScore: number | undefined,
  maxScore: number | undefined,
  bands: CreateRubricBandDto[],
) {
  if (bands.length === 0) throw new BadRequestException("Add at least one rubric band.");
  if (new Set(bands.map((band) => band.code)).size !== bands.length) {
    throw new ConflictException("Rubric band codes must be unique within a version.");
  }
  if (new Set(bands.map((band) => band.sortOrder)).size !== bands.length) {
    throw new ConflictException("Rubric band ordering values must be unique within a version.");
  }

  if (scaleType === "NUMERIC_BANDS") {
    if (minScore === undefined || maxScore === undefined || maxScore <= minScore) {
      throw new BadRequestException("Numeric rubrics require a valid minimum and maximum score.");
    }
    const ordered = [...bands].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const band of ordered) {
      if (band.lowerBound === undefined || band.upperBound === undefined ||
        band.lowerBound < minScore || band.upperBound > maxScore || band.upperBound <= band.lowerBound) {
        throw new BadRequestException("Every numeric band needs valid lower-inclusive and upper-exclusive bounds within the rubric range.");
      }
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const current = ordered[index];
      const previous = ordered[index - 1];
      if (current && previous && current.lowerBound !== undefined && previous.upperBound !== undefined &&
        current.lowerBound < previous.upperBound) {
        throw new ConflictException("Numeric rubric bands cannot overlap.");
      }
    }
  } else if (minScore !== undefined || maxScore !== undefined ||
    bands.some((band) => band.lowerBound !== undefined || band.upperBound !== undefined)) {
    throw new BadRequestException("Performance-level and descriptive rubrics must not define numeric boundaries.");
  }
}

@Injectable()
export class CouncilAssessmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listRubrics(councilId: string) {
    return this.prisma.client.gradingRubric.findMany({
      where: { councilId },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      include: {
        versions: {
          orderBy: [{ createdAt: "desc" }],
          include: { bands: { orderBy: [{ sortOrder: "asc" }] } },
        },
      },
    });
  }

  async listRubricReviewQueue(councilId: string) {
    return this.prisma.client.gradingRubricVersion.findMany({
      where: { councilId, status: "IN_REVIEW" },
      orderBy: [{ createdAt: "asc" }],
      include: {
        rubric: { select: { id: true, code: true, name: true } },
        bands: { orderBy: [{ sortOrder: "asc" }] },
      },
    });
  }

  async createRubric(actor: CouncilActor, councilId: string, input: CreateRubricDto) {
    validateRubricBands(input.scaleType, input.minScore, input.maxScore, input.bands);
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const council = await tx.council.findUnique({
          where: { id: councilId },
          select: { id: true, status: true },
        });
        if (!council) throw new NotFoundException("Council not found.");
        if (council.status !== "ACTIVE") throw new ConflictException("Rubrics cannot be configured for an inactive Council.");

        const rubric = await tx.gradingRubric.create({
          data: {
            councilId,
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            description: input.description?.trim() || null,
          },
        });
        const version = await tx.gradingRubricVersion.create({
          data: {
            rubricId: rubric.id,
            councilId,
            versionLabel: input.versionLabel.trim(),
            scaleType: input.scaleType,
            scoreUnit: input.scoreUnit?.trim() || null,
            minScore: input.minScore === undefined ? null : String(input.minScore),
            maxScore: input.maxScore === undefined ? null : String(input.maxScore),
            createdByAccountId: actor.accountId,
          },
        });
        await tx.rubricBand.createMany({
          data: input.bands.map((band) => ({
            rubricVersionId: version.id,
            code: band.code.trim().toUpperCase(),
            label: band.label.trim(),
            description: band.description?.trim() || null,
            lowerBound: band.lowerBound === undefined ? null : String(band.lowerBound),
            upperBound: band.upperBound === undefined ? null : String(band.upperBound),
            sortOrder: band.sortOrder,
          })),
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId,
            action: "GRADING_RUBRIC_DRAFT_CREATED",
            resourceType: "GradingRubricVersion",
            resourceId: version.id,
            decision: "ALLOW",
            metadata: {
              rubricId: rubric.id,
              rubricCode: rubric.code,
              versionLabel: version.versionLabel,
              scaleType: version.scaleType,
              bandCount: input.bands.length,
            },
          },
        });
        return tx.gradingRubricVersion.findUnique({
          where: { id: version.id },
          include: { rubric: true, bands: { orderBy: [{ sortOrder: "asc" }] } },
        });
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (prismaCode(error) === "P2002" || prismaCode(error) === "P2034") {
        throw new ConflictException("A rubric code or version label already exists, or another Council configuration changed concurrently.");
      }
      throw error;
    }
  }

  async createRubricVersion(
    actor: CouncilActor,
    councilId: string,
    rubricId: string,
    input: CreateRubricVersionDto,
  ) {
    if (input.scaleType === "NUMERIC_BANDS") {
      if (input.minScore === undefined || input.maxScore === undefined || input.maxScore <= input.minScore) {
        throw new BadRequestException("Numeric rubric versions require a valid minimum and maximum score.");
      }
    } else if (input.minScore !== undefined || input.maxScore !== undefined) {
      throw new BadRequestException("Performance-level and descriptive rubric versions must not define numeric score bounds.");
    }
    return this.prisma.client.$transaction(async (tx) => {
      const rubric = await tx.gradingRubric.findFirst({
        where: { id: rubricId, councilId },
        select: { id: true },
      });
      if (!rubric) throw new NotFoundException("Rubric not found in this Council.");
      const version = await tx.gradingRubricVersion.create({
        data: {
          rubricId,
          councilId,
          versionLabel: input.versionLabel.trim(),
          scaleType: input.scaleType,
          scoreUnit: input.scoreUnit?.trim() || null,
          minScore: input.minScore === undefined ? null : String(input.minScore),
          maxScore: input.maxScore === undefined ? null : String(input.maxScore),
          createdByAccountId: actor.accountId,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId,
          action: "GRADING_RUBRIC_VERSION_DRAFT_CREATED",
          resourceType: "GradingRubricVersion",
          resourceId: version.id,
          decision: "ALLOW",
          metadata: { rubricId, versionLabel: version.versionLabel, scaleType: version.scaleType },
        },
      });
      return version;
    });
  }

  async addRubricBand(
    actor: CouncilActor,
    councilId: string,
    versionId: string,
    input: CreateRubricBandDto,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const version = await tx.gradingRubricVersion.findFirst({
        where: { id: versionId, councilId, status: "DRAFT" },
        select: { id: true, createdByAccountId: true, scaleType: true, minScore: true, maxScore: true, bands: { select: { code: true, sortOrder: true } } },
      });
      if (!version) throw new NotFoundException("A draft rubric version was not found in this Council.");
      if (version.createdByAccountId !== actor.accountId) {
        throw new ConflictException("Only the rubric author may edit bands in this draft version.");
      }
      const code = input.code.trim().toUpperCase();
      if (version.bands.some((band) => band.code === code)) throw new ConflictException("A rubric band with this code already exists.");
      if (version.bands.some((band) => band.sortOrder === input.sortOrder)) throw new ConflictException("A rubric band already uses this ordering value.");
      if (version.scaleType === "NUMERIC_BANDS") {
        if (version.minScore === null || version.maxScore === null ||
          input.lowerBound === undefined || input.upperBound === undefined ||
          input.lowerBound < Number(version.minScore) || input.upperBound > Number(version.maxScore) ||
          input.upperBound <= input.lowerBound) {
          throw new BadRequestException("Numeric bands require valid lower-inclusive and upper-exclusive bounds within the rubric score range.");
        }
        const existing = await tx.rubricBand.findMany({
          where: { rubricVersionId: versionId },
          select: { lowerBound: true, upperBound: true },
        });
        if (existing.some((band) => band.lowerBound !== null && band.upperBound !== null &&
          input.lowerBound! < Number(band.upperBound) && Number(band.lowerBound) < input.upperBound!)) {
          throw new ConflictException("Numeric rubric bands cannot overlap.");
        }
      } else if (input.lowerBound !== undefined || input.upperBound !== undefined) {
        throw new BadRequestException("Performance-level and descriptive bands must not define numeric boundaries.");
      }
      const band = await tx.rubricBand.create({
        data: {
          rubricVersionId: versionId,
          code,
          label: input.label.trim(),
          description: input.description?.trim() || null,
          lowerBound: input.lowerBound === undefined ? null : String(input.lowerBound),
          upperBound: input.upperBound === undefined ? null : String(input.upperBound),
          sortOrder: input.sortOrder,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId,
          action: "GRADING_RUBRIC_BAND_ADDED",
          resourceType: "RubricBand",
          resourceId: band.id,
          decision: "ALLOW",
          metadata: { rubricVersionId: versionId, code: band.code, sortOrder: band.sortOrder },
        },
      });
      return band;
    });
  }

  async submitRubricForReview(actor: CouncilActor, councilId: string, versionId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const version = await tx.gradingRubricVersion.findFirst({
        where: { id: versionId, councilId },
        select: { id: true, status: true, createdByAccountId: true, scaleType: true, minScore: true, maxScore: true, bands: { orderBy: { sortOrder: "asc" } } },
      });
      if (!version) throw new NotFoundException("Rubric version not found in this Council.");
      if (version.createdByAccountId !== actor.accountId) {
        throw new ConflictException("Only the rubric author may submit this draft for independent review.");
      }
      if (version.status !== "DRAFT") throw new ConflictException("Only a draft rubric version can be submitted for review.");
      if (version.bands.length === 0) throw new ConflictException("Add at least one rubric band before review.");
      if (version.scaleType === "NUMERIC_BANDS") {
        if (version.minScore === null || version.maxScore === null) throw new ConflictException("Configure the numeric rubric score range before review.");
        const bounds = version.bands.map((band) => ({
          code: band.code,
          lower: band.lowerBound === null ? undefined : Number(band.lowerBound),
          upper: band.upperBound === null ? undefined : Number(band.upperBound),
        }));
        if (bounds.some((band) => band.lower === undefined || band.upper === undefined ||
          band.lower < Number(version.minScore) || band.upper > Number(version.maxScore) || band.upper <= band.lower)) {
          throw new ConflictException("Every numeric rubric band needs valid bounds within the rubric score range.");
        }
        for (let index = 1; index < bounds.length; index += 1) {
          const current = bounds[index];
          const previous = bounds[index - 1];
          if (current?.lower !== undefined && previous?.upper !== undefined && current.lower < previous.upper) {
            throw new ConflictException("Numeric rubric bands cannot overlap.");
          }
        }
      } else if (version.minScore !== null || version.maxScore !== null ||
        version.bands.some((band) => band.lowerBound !== null || band.upperBound !== null)) {
        throw new ConflictException("Performance-level and descriptive rubrics must not define numeric boundaries.");
      }
      const updated = await tx.gradingRubricVersion.update({
        where: { id: versionId },
        data: { status: "IN_REVIEW" },
        select: { id: true, status: true, versionLabel: true },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId,
          action: "GRADING_RUBRIC_SUBMITTED_FOR_REVIEW",
          resourceType: "GradingRubricVersion",
          resourceId: versionId,
          decision: "ALLOW",
          metadata: { versionLabel: updated.versionLabel, bandCount: version.bands.length },
        },
      });
      return updated;
    });
  }

  async returnRubricForChanges(actor: CouncilActor, councilId: string, versionId: string, reason: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const version = await tx.gradingRubricVersion.findFirst({
        where: { id: versionId, councilId, status: "IN_REVIEW" },
        select: { id: true, createdByAccountId: true, versionLabel: true },
      });
      if (!version) throw new NotFoundException("Rubric version awaiting review was not found in this Council.");
      if (version.createdByAccountId === actor.accountId) {
        throw new ConflictException("A rubric author cannot return their own version for changes.");
      }
      const updated = await tx.gradingRubricVersion.update({
        where: { id: versionId },
        data: { status: "DRAFT" },
        select: { id: true, status: true, versionLabel: true },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId,
          action: "GRADING_RUBRIC_RETURNED_FOR_CHANGES",
          resourceType: "GradingRubricVersion",
          resourceId: versionId,
          decision: "ALLOW",
          reason,
          metadata: { versionLabel: updated.versionLabel },
        },
      });
      return updated;
    });
  }

  async publishRubric(actor: CouncilActor, councilId: string, versionId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const version = await tx.gradingRubricVersion.findFirst({
        where: { id: versionId, councilId },
        select: { id: true, status: true, createdByAccountId: true, versionLabel: true, bands: { select: { id: true } } },
      });
      if (!version) throw new NotFoundException("Rubric version not found in this Council.");
      if (version.status !== "IN_REVIEW") throw new ConflictException("Only a rubric version under independent review can be published.");
      if (version.createdByAccountId === actor.accountId) {
        throw new ConflictException("The rubric author cannot publish their own version.");
      }
      const updated = await tx.gradingRubricVersion.update({
        where: { id: versionId },
        data: { status: "PUBLISHED", reviewedByAccountId: actor.accountId, publishedAt: new Date() },
        select: { id: true, status: true, versionLabel: true, publishedAt: true },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId,
          action: "GRADING_RUBRIC_PUBLISHED",
          resourceType: "GradingRubricVersion",
          resourceId: versionId,
          decision: "ALLOW",
          metadata: { versionLabel: updated.versionLabel, bandCount: version.bands.length },
        },
      });
      return updated;
    });
  }

  async listAssessments(councilId: string, accountId: string) {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: accountId },
      select: { personId: true },
    });
    if (!account) throw new NotFoundException("Account not found.");
    const now = new Date();
    const memberships = await this.prisma.client.councilMembership.findMany({
      where: {
        councilId,
        personId: account.personId,
        status: "ACTIVE",
        role: { in: ["COUNCIL_ADMINISTRATOR", "COUNCIL_GOVERNANCE_APPROVER"] },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      select: { role: true },
    });
    const [assessments] = await Promise.all([this.prisma.client.assessment.findMany({
      where: { councilId },
      orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
      include: {
        learningAreas: { orderBy: [{ sortOrder: "asc" }] },
        rubricBands: { orderBy: [{ sortOrder: "asc" }] },
        rubricVersion: { select: { id: true, versionLabel: true, scaleType: true, rubric: { select: { code: true, name: true } } } },
        candidates: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            registrationId: true,
            schoolClassId: true,
            schoolClass: {
              select: {
                displayName: true,
                streamCode: true,
                registration: { select: { school: { select: { name: true } } } },
              },
            },
          },
        },
      },
    })]);
    return {
      canManage: memberships.some((membership) => membership.role === "COUNCIL_ADMINISTRATOR"),
      canModerate: memberships.some((membership) => membership.role === "COUNCIL_GOVERNANCE_APPROVER"),
      assessments,
    };
  }

  async createAssessment(actor: CouncilActor, councilId: string, input: CreateAssessmentDto) {
    const areaIds = input.learningAreas.map((area) => area.councilGradeLearningAreaId);
    if (new Set(areaIds).size !== areaIds.length) {
      throw new BadRequestException("Select each learning area only once.");
    }
    for (const area of input.learningAreas) {
      const precision = String(area.maxMarks).split(".")[1]?.length ?? 0;
      if (precision > area.decimalPlaces) {
        throw new BadRequestException("Each maximum mark must respect the selected decimal precision.");
      }
    }
    if (input.opensAt && input.closesAt && new Date(input.closesAt) <= new Date(input.opensAt)) {
      throw new BadRequestException("The assessment closing time must be later than its opening time.");
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const council = await tx.council.findUnique({
          where: { id: councilId },
          select: { id: true, status: true },
        });
        if (!council) throw new NotFoundException("Council not found.");
        if (council.status !== "ACTIVE") throw new ConflictException("Assessments cannot be created for an inactive Council.");

        const selection = await tx.councilCurriculum.findFirst({
          where: { councilId, status: "ACTIVE", effectiveTo: null },
          select: { id: true, curriculumVersionId: true, curriculumVersion: { select: { status: true } } },
        });
        if (!selection || selection.curriculumVersion.status !== "PUBLISHED") {
          throw new ConflictException("The Council must have an active published curriculum before creating assessments.");
        }

        const rubric = await tx.gradingRubricVersion.findFirst({
          where: { id: input.rubricVersionId, councilId, status: "PUBLISHED" },
          include: {
            rubric: { select: { id: true, code: true, name: true } },
            bands: { orderBy: [{ sortOrder: "asc" }] },
          },
        });
        if (!rubric) throw new NotFoundException("A published grading rubric version was not found in this Council.");
        if (rubric.bands.length === 0) throw new ConflictException("The published grading rubric has no bands.");

        const mappings = await tx.councilGradeLearningArea.findMany({
          where: {
            id: { in: areaIds },
            councilId,
            councilCurriculumId: selection.id,
            curriculumVersionId: selection.curriculumVersionId,
            enabled: true,
            assessmentEligible: true,
            gradeLearningArea: {
              grade: input.grade,
              reviewStatus: "REVIEWED",
              optionality: { not: "UNKNOWN" },
            },
          },
          include: {
            gradeLearningArea: {
              include: { learningArea: { select: { code: true, canonicalName: true } } },
            },
          },
        });
        if (mappings.length !== areaIds.length) {
          throw new ConflictException("One or more selected learning areas are not enabled and assessment-eligible for this Council, curriculum and grade.");
        }

        const orderByInput = new Map(input.learningAreas.map((area) => [area.councilGradeLearningAreaId, area]));
        const assessment = await tx.assessment.create({
          data: {
            councilId,
            councilCurriculumId: selection.id,
            curriculumVersionId: selection.curriculumVersionId,
            rubricVersionId: rubric.id,
            name: input.name.trim(),
            code: input.code.trim().toUpperCase(),
            academicYear: input.academicYear,
            grade: input.grade,
            type: input.type,
            opensAt: input.opensAt ? new Date(input.opensAt) : null,
            closesAt: input.closesAt ? new Date(input.closesAt) : null,
            createdByAccountId: actor.accountId,
          },
        });

        await tx.assessmentLearningArea.createMany({
          data: mappings.map((mapping) => {
            const requested = orderByInput.get(mapping.id)!;
            return {
              assessmentId: assessment.id,
              councilId,
              curriculumVersionId: selection.curriculumVersionId,
              councilGradeLearningAreaId: mapping.id,
              grade: input.grade,
              learningAreaCode: mapping.gradeLearningArea.learningArea.code,
              canonicalName: mapping.gradeLearningArea.learningArea.canonicalName,
              sourceLabel: mapping.gradeLearningArea.sourceLabel,
              displayLabel: mapping.displayLabel,
              maxMarks: String(requested.maxMarks),
              decimalPlaces: requested.decimalPlaces,
              sortOrder: mapping.sortOrder,
            };
          }),
        });
        await tx.assessmentRubricBand.createMany({
          data: rubric.bands.map((band) => ({
            assessmentId: assessment.id,
            rubricVersionId: rubric.id,
            sourceRubricBandId: band.id,
            code: band.code,
            label: band.label,
            description: band.description,
            lowerBound: band.lowerBound === null ? null : String(band.lowerBound),
            upperBound: band.upperBound === null ? null : String(band.upperBound),
            sortOrder: band.sortOrder,
          })),
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId,
            action: "ASSESSMENT_DRAFT_CREATED",
            resourceType: "Assessment",
            resourceId: assessment.id,
            decision: "ALLOW",
            metadata: {
              code: assessment.code,
              academicYear: assessment.academicYear,
              grade: assessment.grade,
              type: assessment.type,
              curriculumVersionId: selection.curriculumVersionId,
              councilCurriculumId: selection.id,
              rubricVersionId: rubric.id,
              rubricCode: rubric.rubric.code,
              learningAreaCount: mappings.length,
              rubricBandCount: rubric.bands.length,
            },
          },
        });
        return tx.assessment.findUnique({
          where: { id: assessment.id },
          include: {
            learningAreas: { orderBy: [{ sortOrder: "asc" }] },
            rubricBands: { orderBy: [{ sortOrder: "asc" }] },
            rubricVersion: { select: { id: true, versionLabel: true, scaleType: true, rubric: { select: { code: true, name: true } } } },
          },
        });
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (prismaCode(error) === "P2002" || prismaCode(error) === "P2034") {
        throw new ConflictException("The assessment code already exists for this academic year, or Council configuration changed concurrently.");
      }
      throw error;
    }
  }

  async scheduleAssessment(
    actor: CouncilActor,
    councilId: string,
    assessmentId: string,
    input: ScheduleAssessmentDto,
  ) {
    const opensAt = new Date(input.opensAt);
    const closesAt = new Date(input.closesAt);
    if (closesAt <= opensAt || opensAt <= new Date()) {
      throw new BadRequestException("Scheduling requires a future opening time and a later closing time.");
    }
    try {
      return await this.prisma.client.$transaction(async (tx) => {
      const assessment = await tx.assessment.findFirst({
        where: { id: assessmentId, councilId },
        select: { id: true, status: true, grade: true, academicYear: true, curriculumVersionId: true },
      });
      if (!assessment) throw new NotFoundException("Assessment not found in this Council.");
      if (assessment.status !== "DRAFT") throw new ConflictException("Only a draft assessment can be scheduled.");

      const enrollments = await tx.schoolLearnerEnrollment.findMany({
        where: {
          councilId,
          status: "ACTIVE",
          endedAt: null,
          registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
          schoolClass: { is: { grade: assessment.grade, academicYear: assessment.academicYear, status: "ACTIVE" } },
        },
        select: {
          id: true,
          learnerId: true,
          registrationId: true,
          councilId: true,
          schoolClassId: true,
          learner: { select: { id: true, learnerNumber: true, givenName: true, familyName: true, otherNames: true, displayName: true } },
          registration: { select: { school: { select: { id: true, name: true } } } },
          schoolClass: { select: { grade: true, streamCode: true } },
        },
        orderBy: [{ registrationId: "asc" }, { learner: { familyName: "asc" } }, { learner: { givenName: "asc" } }],
      });
      if (enrollments.length === 0) {
        throw new ConflictException("No active learner enrollments match this assessment's grade and academic year. Enroll learners before scheduling.");
      }
      const learnerIds = new Set<string>();
      for (const enrollment of enrollments) {
        if (learnerIds.has(enrollment.learnerId)) {
          throw new ConflictException("A learner has active enrollments in more than one participating school. Resolve the duplicate enrollment before scheduling.");
        }
        learnerIds.add(enrollment.learnerId);
      }

      await tx.assessmentCandidate.createMany({
        data: enrollments.map((enrollment) => ({
          assessmentId,
          councilId,
          curriculumVersionId: assessment.curriculumVersionId,
          learnerId: enrollment.learnerId,
          enrollmentId: enrollment.id,
          registrationId: enrollment.registrationId,
          schoolClassId: enrollment.schoolClassId,
          learnerNumberSnapshot: enrollment.learner.learnerNumber,
          learnerNameSnapshot: enrollment.learner.displayName?.trim() ||
            [enrollment.learner.givenName, enrollment.learner.otherNames, enrollment.learner.familyName].filter(Boolean).join(" "),
          schoolIdSnapshot: enrollment.registration.school.id,
          schoolNameSnapshot: enrollment.registration.school.name,
          classGradeSnapshot: enrollment.schoolClass.grade,
          classStreamSnapshot: enrollment.schoolClass.streamCode,
        })),
      });
      const candidates = await tx.assessmentCandidate.findMany({
        where: { assessmentId, status: "ACTIVE" },
        select: { id: true },
      });
      const learningAreas = await tx.assessmentLearningArea.findMany({
        where: { assessmentId },
        select: { id: true },
      });
      await tx.assessmentMark.createMany({
        data: candidates.flatMap((candidate) => learningAreas.map((area) => ({
          assessmentId,
          candidateId: candidate.id,
          assessmentLearningAreaId: area.id,
        }))),
      });

      const updated = await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: "SCHEDULED", opensAt, closesAt },
        select: { id: true, name: true, code: true, status: true, opensAt: true, closesAt: true },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId,
          action: "ASSESSMENT_SCHEDULED",
          resourceType: "Assessment",
          resourceId: assessmentId,
          decision: "ALLOW",
          metadata: { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), candidateCount: candidates.length, participatingSchoolCount: new Set(enrollments.map((item) => item.registrationId)).size },
        },
      });
      return updated;
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (prismaCode(error) === "P2034") {
        throw new ConflictException("The active school roster changed while this assessment was being scheduled. Refresh and try again.");
      }
      throw error;
    }
  }
  async returnClassMarksForCorrection(
    actor: CouncilActor,
    councilId: string,
    assessmentId: string,
    classId: string,
    reason: string,
  ) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 2000) {
      throw new BadRequestException("A correction reason between 10 and 2,000 characters is required.");
    }
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const assessment = await tx.assessment.findFirst({
          where: { id: assessmentId, councilId, status: "CLOSED" },
          select: { id: true, grade: true, academicYear: true },
        });
        if (!assessment) throw new NotFoundException("A closed assessment was not found in this Council.");

        const schoolClass = await tx.schoolClass.findFirst({
          where: { id: classId, councilId, grade: assessment.grade, academicYear: assessment.academicYear },
          select: { id: true, registrationId: true },
        });
        if (!schoolClass) throw new NotFoundException("The class is not part of this assessment grade and academic year.");

        const candidates = await tx.assessmentCandidate.findMany({
          where: { assessmentId, schoolClassId: classId, status: "ACTIVE" },
          select: { id: true },
        });
        if (candidates.length === 0) throw new ConflictException("This class has no active candidates in the assessment.");

        const candidateIds = candidates.map((candidate) => candidate.id);
        const learningAreaCount = await tx.assessmentLearningArea.count({ where: { assessmentId } });
        if (learningAreaCount === 0) throw new ConflictException("The assessment has no snapshotted learning areas.");
        const marks = await tx.assessmentMark.findMany({
          where: { assessmentId, candidateId: { in: candidateIds } },
          select: { id: true, marks: true, status: true },
        });
        if (marks.length !== candidates.length * learningAreaCount || marks.some((mark) => mark.status !== "SUBMITTED" || mark.marks === null)) {
          throw new ConflictException("A class can be returned only when every mark has been submitted.");
        }

        await tx.assessmentMark.updateMany({
          where: { id: { in: marks.map((mark) => mark.id) }, status: "SUBMITTED" },
          data: { status: "RETURNED", returnedReason: normalizedReason, submittedAt: null },
        });
        await tx.assessmentMarkRevision.createMany({
          data: marks.map((mark) => ({
            markId: mark.id,
            actorAccountId: actor.accountId,
            action: "RETURNED" as const,
            previousMarks: mark.marks,
            newMarks: mark.marks,
            reason: normalizedReason,
          })),
        });

        const reopened = await tx.assessment.update({
          where: { id: assessmentId },
          data: { status: "OPEN" },
          select: { id: true, status: true },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId,
            action: "ASSESSMENT_CLASS_MARKS_RETURNED_FOR_CORRECTION",
            resourceType: "Assessment",
            resourceId: assessmentId,
            decision: "ALLOW",
            reason: normalizedReason,
            metadata: { classId, registrationId: schoolClass.registrationId, candidateCount: candidates.length, markCount: marks.length },
          },
        });
        return { ...reopened, classId, candidateCount: candidates.length, markCount: marks.length, reason: normalizedReason };
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (prismaCode(error) === "P2034") {
        throw new ConflictException("Assessment marks changed during moderation. Refresh and try again.");
      }
      throw error;
    }
  }

  async openAssessment(actor: CouncilActor, councilId: string, assessmentId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const assessment = await tx.assessment.findFirst({
        where: { id: assessmentId, councilId },
        select: { id: true, status: true, opensAt: true, closesAt: true },
      });
      if (!assessment) throw new NotFoundException("Assessment not found in this Council.");
      const now = new Date();
      if (assessment.status !== "SCHEDULED" || !assessment.opensAt || !assessment.closesAt ||
        now < assessment.opensAt || now >= assessment.closesAt) {
        throw new ConflictException("The assessment can open only during its scheduled entry window.");
      }
      const updated = await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: "OPEN" },
        select: { id: true, status: true, opensAt: true, closesAt: true },
      });
      await tx.auditEvent.create({
        data: { actorAccountId: actor.accountId, councilId, action: "ASSESSMENT_OPENED", resourceType: "Assessment", resourceId: assessmentId, decision: "ALLOW" },
      });
      return updated;
    });
  }

  async closeAssessment(actor: CouncilActor, councilId: string, assessmentId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const assessment = await tx.assessment.findFirst({
        where: { id: assessmentId, councilId },
        select: { id: true, status: true },
      });
      if (!assessment) throw new NotFoundException("Assessment not found in this Council.");
      if (assessment.status !== "OPEN") throw new ConflictException("Only an open assessment can be closed.");
      const updated = await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: "CLOSED" },
        select: { id: true, status: true },
      });
      await tx.auditEvent.create({
        data: { actorAccountId: actor.accountId, councilId, action: "ASSESSMENT_CLOSED", resourceType: "Assessment", resourceId: assessmentId, decision: "ALLOW" },
      });
      return updated;
    });
  }
}
