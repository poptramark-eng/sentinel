import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { SelectCouncilCurriculumDto } from "./dto/select-council-curriculum.dto";
import { UpdateCouncilGradeAreaDto } from "./dto/update-council-grade-area.dto";

interface CouncilActor {
  accountId: string;
}

@Injectable()
export class CouncilCurriculumService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(councilId: string) {
    const council = await this.prisma.client.council.findUnique({
      where: { id: councilId },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!council) throw new NotFoundException("Council not found.");

    const selection = await this.prisma.client.councilCurriculum.findFirst({
      where: { councilId, status: "ACTIVE", effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
      include: {
        curriculumVersion: {
          include: {
            curriculum: { select: { code: true, name: true, track: true } },
          },
        },
        gradeAreas: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            gradeLearningArea: {
              include: { learningArea: { select: { code: true, canonicalName: true } } },
            },
          },
        },
      },
    });
    return { council, selection };
  }

  async selectVersion(actor: CouncilActor, councilId: string, input: SelectCouncilCurriculumDto) {
    return this.prisma.client.$transaction(async (tx) => {
      const council = await tx.council.findUnique({
        where: { id: councilId },
        select: { id: true, name: true, status: true },
      });
      if (!council) throw new NotFoundException("Council not found.");
      if (council.status !== "ACTIVE") {
        throw new ConflictException("An inactive Council cannot select a curriculum.");
      }

      const version = await tx.curriculumVersion.findUnique({
        where: { id: input.curriculumVersionId },
        select: {
          id: true,
          status: true,
          curriculum: { select: { code: true, name: true } },
          gradeLearningAreas: {
            select: { id: true, sortOrder: true },
          },
        },
      });
      if (!version) throw new NotFoundException("Curriculum version not found.");
      if (version.status !== "PUBLISHED") {
        throw new ConflictException("A Council can select only a published curriculum version.");
      }
      if (version.gradeLearningAreas.length === 0) {
        throw new ConflictException("The published curriculum version has no grade learning areas to configure.");
      }

      const current = await tx.councilCurriculum.findFirst({
        where: { councilId, status: "ACTIVE", effectiveTo: null },
        select: { id: true, curriculumVersionId: true },
      });
      if (current?.curriculumVersionId === version.id) {
        throw new ConflictException("This curriculum version is already active for the Council.");
      }

      const now = new Date();
      if (current) {
        await tx.councilCurriculum.updateMany({
          where: { id: current.id, councilId, status: "ACTIVE", effectiveTo: null },
          data: { status: "SUPERSEDED", effectiveTo: now },
        });
      }

      const selection = await tx.councilCurriculum.create({
        data: {
          councilId,
          curriculumVersionId: version.id,
          status: "ACTIVE",
          effectiveFrom: now,
        },
        select: { id: true, councilId: true, curriculumVersionId: true, status: true, effectiveFrom: true },
      });

      await tx.councilGradeLearningArea.createMany({
        data: version.gradeLearningAreas.map((area) => ({
          councilCurriculumId: selection.id,
          councilId,
          curriculumVersionId: version.id,
          gradeLearningAreaId: area.id,
          enabled: true,
          assessmentEligible: false,
          sortOrder: area.sortOrder,
        })),
      });

      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId,
          action: "COUNCIL_CURRICULUM_SELECTED",
          resourceType: "CouncilCurriculum",
          resourceId: selection.id,
          decision: "ALLOW",
          metadata: {
            curriculumVersionId: version.id,
            curriculumCode: version.curriculum.code,
            curriculumName: version.curriculum.name,
            previousSelectionId: current?.id ?? null,
            gradeAreasConfigured: version.gradeLearningAreas.length,
          },
        },
      });

      return selection;
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
  }

  async updateGradeArea(
    actor: CouncilActor,
    councilId: string,
    councilGradeAreaId: string,
    input: UpdateCouncilGradeAreaDto,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const selection = await tx.councilCurriculum.findFirst({
        where: { councilId, status: "ACTIVE", effectiveTo: null },
        select: { id: true, curriculumVersionId: true },
      });
      if (!selection) {
        throw new ConflictException("Select a published curriculum version before configuring grade learning areas.");
      }

      const configuration = await tx.councilGradeLearningArea.findFirst({
        where: {
          id: councilGradeAreaId,
          councilId,
          councilCurriculumId: selection.id,
          curriculumVersionId: selection.curriculumVersionId,
        },
        select: {
          id: true,
          enabled: true,
          assessmentEligible: true,
          displayLabel: true,
          sortOrder: true,
          gradeLearningArea: {
            select: { grade: true, sourceLabel: true, optionality: true, reviewStatus: true },
          },
        },
      });
      if (!configuration) {
        throw new NotFoundException("Grade learning area not found in the Council's active curriculum.");
      }
      if (input.assessmentEligible && !input.enabled) {
        throw new BadRequestException("A disabled learning area cannot be assessment-eligible.");
      }
      if (
        input.assessmentEligible &&
        (configuration.gradeLearningArea.reviewStatus !== "REVIEWED" ||
          configuration.gradeLearningArea.optionality === "UNKNOWN")
      ) {
        throw new ConflictException("Only source-reviewed learning areas with resolved optionality can be made assessment-eligible.");
      }

      const updated = await tx.councilGradeLearningArea.update({
        where: { id: configuration.id },
        data: {
          enabled: input.enabled,
          assessmentEligible: input.assessmentEligible,
          displayLabel: input.displayLabel?.trim() || null,
          sortOrder: input.sortOrder,
          reviewNote: input.reason,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId,
          action: "COUNCIL_GRADE_LEARNING_AREA_CONFIGURED",
          resourceType: "CouncilGradeLearningArea",
          resourceId: configuration.id,
          decision: "ALLOW",
          reason: input.reason,
          metadata: {
            grade: configuration.gradeLearningArea.grade,
            sourceLabel: configuration.gradeLearningArea.sourceLabel,
            before: {
              enabled: configuration.enabled,
              assessmentEligible: configuration.assessmentEligible,
              displayLabel: configuration.displayLabel,
              sortOrder: configuration.sortOrder,
            },
            after: {
              enabled: updated.enabled,
              assessmentEligible: updated.assessmentEligible,
              displayLabel: updated.displayLabel,
              sortOrder: updated.sortOrder,
            },
          },
        },
      });
      return updated;
    });
  }
}
