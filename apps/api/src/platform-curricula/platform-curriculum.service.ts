import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ReturnCurriculumForChangesDto } from "./dto/return-curriculum-for-changes.dto";

interface PlatformActor {
  accountId: string;
}

@Injectable()
export class PlatformCurriculumService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.client.curriculum.findMany({
      orderBy: [{ name: "asc" }, { code: "asc" }],
      include: {
        versions: {
          orderBy: [{ createdAt: "desc" }, { versionLabel: "desc" }],
          include: {
            author: { select: { id: true } },
            reviewer: { select: { id: true } },
            _count: { select: { gradeLearningAreas: true, councilCurricula: true } },
          },
        },
      },
    });
  }

  async getVersion(versionId: string) {
    const version = await this.prisma.client.curriculumVersion.findUnique({
      where: { id: versionId },
      include: {
        curriculum: { select: { id: true, code: true, name: true, track: true } },
        author: { select: { id: true } },
        reviewer: { select: { id: true } },
        gradeLearningAreas: {
          orderBy: [{ grade: "asc" }, { sortOrder: "asc" }, { sourceLabel: "asc" }],
          include: {
            learningArea: { select: { code: true, canonicalName: true } },
          },
        },
        _count: { select: { gradeLearningAreas: true, councilCurricula: true } },
      },
    });
    if (!version) throw new NotFoundException("Curriculum version not found.");
    return version;
  }

  async reviewGradeLearningArea(
    actor: PlatformActor,
    versionId: string,
    gradeLearningAreaId: string,
    input: { optionality: "CORE" | "OPTIONAL"; reason: string },
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const version = await tx.curriculumVersion.findUnique({
        where: { id: versionId },
        select: { id: true, status: true },
      });
      if (!version) throw new NotFoundException("Curriculum version not found.");
      if (version.status !== "IN_REVIEW") {
        throw new ConflictException("Grade mappings can only be reviewed while the version is under review.");
      }

      const mapping = await tx.gradeLearningArea.findFirst({
        where: { id: gradeLearningAreaId, curriculumVersionId: versionId },
        select: { id: true, sourceLabel: true, grade: true },
      });
      if (!mapping) throw new NotFoundException("Grade learning area not found in this curriculum version.");

      await tx.gradeLearningArea.update({
        where: { id: mapping.id },
        data: {
          optionality: input.optionality,
          reviewStatus: "REVIEWED",
          reviewNote: input.reason,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          action: "PLATFORM_CURRICULUM_GRADE_AREA_REVIEWED",
          resourceType: "GradeLearningArea",
          resourceId: mapping.id,
          decision: "ALLOW",
          reason: input.reason,
          metadata: {
            curriculumVersionId: versionId,
            grade: mapping.grade,
            sourceLabel: mapping.sourceLabel,
            optionality: input.optionality,
          },
        },
      });
      return { id: mapping.id, reviewStatus: "REVIEWED", optionality: input.optionality };
    });
  }

  async submitForReview(actor: PlatformActor, versionId: string) {
    return this.transition(actor, versionId, {
      expectedStatus: "DRAFT",
      nextStatus: "IN_REVIEW",
      action: "PLATFORM_CURRICULUM_SUBMITTED_FOR_REVIEW",
    });
  }

  async returnForChanges(
    actor: PlatformActor,
    versionId: string,
    input: ReturnCurriculumForChangesDto,
  ) {
    return this.transition(actor, versionId, {
      expectedStatus: "IN_REVIEW",
      nextStatus: "DRAFT",
      action: "PLATFORM_CURRICULUM_RETURNED_FOR_CHANGES",
      reason: input.reason,
    });
  }

  async publish(actor: PlatformActor, versionId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const version = await tx.curriculumVersion.findUnique({
        where: { id: versionId },
        select: {
          id: true,
          status: true,
          createdByAccountId: true,
          _count: { select: { gradeLearningAreas: true } },
        },
      });
      if (!version) throw new NotFoundException("Curriculum version not found.");
      if (version.status !== "IN_REVIEW") {
        throw new ConflictException("Only a curriculum version under review can be published.");
      }
      if (version.createdByAccountId === actor.accountId) {
        throw new ConflictException("The curriculum author cannot publish their own version.");
      }
      if (version._count.gradeLearningAreas === 0) {
        throw new ConflictException("Add and review grade learning areas before publication.");
      }

      const now = new Date();
      const updated = await tx.curriculumVersion.updateMany({
        where: { id: versionId, status: "IN_REVIEW" },
        data: {
          status: "PUBLISHED",
          reviewedByAccountId: actor.accountId,
          publishedAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("The curriculum version changed. Reload it and try again.");
      }

      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          action: "PLATFORM_CURRICULUM_PUBLISHED",
          resourceType: "CurriculumVersion",
          resourceId: versionId,
          decision: "ALLOW",
          metadata: { publishedAt: now.toISOString() },
        },
      });
      return { id: versionId, status: "PUBLISHED", publishedAt: now };
    });
  }

  private async transition(
    actor: PlatformActor,
    versionId: string,
    input: {
      expectedStatus: "DRAFT" | "IN_REVIEW";
      nextStatus: "DRAFT" | "IN_REVIEW";
      action: string;
      reason?: string;
    },
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const version = await tx.curriculumVersion.findUnique({
        where: { id: versionId },
        select: { id: true, status: true },
      });
      if (!version) throw new NotFoundException("Curriculum version not found.");
      if (version.status !== input.expectedStatus) {
        throw new ConflictException(
          `This action requires a ${input.expectedStatus.toLowerCase().replace("_", " ")} curriculum version.`,
        );
      }

      const updated = await tx.curriculumVersion.updateMany({
        where: { id: versionId, status: input.expectedStatus },
        data: { status: input.nextStatus },
      });
      if (updated.count !== 1) {
        throw new ConflictException("The curriculum version changed. Reload it and try again.");
      }

      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          action: input.action,
          resourceType: "CurriculumVersion",
          resourceId: versionId,
          decision: "ALLOW",
          ...(input.reason ? { reason: input.reason } : {}),
          metadata: { from: input.expectedStatus, to: input.nextStatus },
        },
      });
      return { id: versionId, status: input.nextStatus };
    });
  }
}
