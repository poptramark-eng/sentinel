import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ReturnCurriculumForChangesDto } from "./dto/return-curriculum-for-changes.dto";
import { CreateCurriculumDraftDto } from "./dto/create-curriculum-draft.dto";

interface PlatformActor {
  accountId: string;
}

@Injectable()
export class PlatformCurriculumService {
  constructor(private readonly prisma: PrismaService) {}

  previewImport(input: CreateCurriculumDraftDto) {
    const seen = new Set<string>();
    const errors: Array<{ row: number; message: string }> = [];
    const learningAreaCodes = new Set<string>();
    const grades = new Set<string>();

    input.rows.forEach((row, index) => {
      const key = `${row.grade}|${row.learningAreaCode}`;
      if (seen.has(key)) {
        errors.push({ row: index + 1, message: `Duplicate learning area code '${row.learningAreaCode}' for ${row.grade.replace("_", " ")}.` });
      }
      seen.add(key);
      learningAreaCodes.add(row.learningAreaCode);
      grades.add(row.grade);
    });

    return {
      valid: errors.length === 0,
      curriculumCode: input.curriculumCode,
      versionLabel: input.versionLabel,
      rowsReceived: input.rows.length,
      uniqueLearningAreas: learningAreaCodes.size,
      gradesCovered: [...grades].sort(),
      unresolvedOptionality: input.rows.filter((row) => row.optionality === "UNKNOWN").length,
      errors,
    };
  }

  async createDraft(actor: PlatformActor, input: CreateCurriculumDraftDto) {
    const preview = this.previewImport(input);
    if (!preview.valid) {
      throw new ConflictException({
        code: "CURRICULUM_IMPORT_INVALID",
        message: "Correct duplicate grade-to-learning-area mappings before importing.",
        errors: preview.errors,
      });
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const existingCurriculum = await tx.curriculum.findUnique({
          where: { code: input.curriculumCode },
          select: { id: true, name: true, track: true },
        });
        if (
          existingCurriculum &&
          (existingCurriculum.name !== input.curriculumName || existingCurriculum.track !== input.track)
        ) {
          throw new ConflictException("The curriculum code already exists with a different name or track.");
        }

        const curriculum = existingCurriculum ?? await tx.curriculum.create({
          data: {
            code: input.curriculumCode,
            name: input.curriculumName,
            track: input.track,
          },
          select: { id: true, code: true, name: true, track: true },
        });

        const version = await tx.curriculumVersion.create({
          data: {
            curriculumId: curriculum.id,
            versionLabel: input.versionLabel,
            sourceTitle: input.sourceTitle,
            sourceUrl: input.sourceUrl,
            sourceRetrievedAt: new Date(input.sourceRetrievedAt),
            sourceSha256: input.sourceSha256,
            createdByAccountId: actor.accountId,
            status: "DRAFT",
          },
          select: { id: true, versionLabel: true, status: true },
        });

        const learningAreaIds = new Map<string, string>();
        for (const row of input.rows) {
          let learningAreaId = learningAreaIds.get(row.learningAreaCode);
          if (!learningAreaId) {
            const existing = await tx.learningArea.findUnique({
              where: { code: row.learningAreaCode },
              select: { id: true, canonicalName: true },
            });
            if (existing && existing.canonicalName !== row.canonicalName) {
              throw new ConflictException(
                `Learning area code '${row.learningAreaCode}' is already assigned to a different canonical name. Resolve the code/name conflict before importing.`,
              );
            }
            const learningArea = existing ?? await tx.learningArea.create({
              data: {
                code: row.learningAreaCode,
                canonicalName: row.canonicalName,
              },
              select: { id: true },
            });
            learningAreaId = learningArea.id;
            learningAreaIds.set(row.learningAreaCode, learningAreaId);
          }

          await tx.gradeLearningArea.create({
            data: {
              curriculumVersionId: version.id,
              learningAreaId,
              grade: row.grade,
              sourceLabel: row.sourceLabel,
              sourceUrl: row.sourceUrl,
              sortOrder: row.sortOrder ?? 0,
              optionality: row.optionality,
              reviewStatus: "REVIEW_REQUIRED",
            },
          });
        }

        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            action: "PLATFORM_CURRICULUM_DRAFT_IMPORTED",
            resourceType: "CurriculumVersion",
            resourceId: version.id,
            decision: "ALLOW",
            metadata: {
              curriculumCode: curriculum.code,
              versionLabel: version.versionLabel,
              sourceSha256: input.sourceSha256,
              rowsImported: input.rows.length,
              uniqueLearningAreas: learningAreaIds.size,
            },
          },
        });

        return {
          curriculum,
          version,
          rowsImported: input.rows.length,
          unresolvedOptionality: preview.unresolvedOptionality,
        };
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new ConflictException("This curriculum version label or learning-area code already exists. Refresh and resolve the conflict.");
      }
      throw error;
    }
  }

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
