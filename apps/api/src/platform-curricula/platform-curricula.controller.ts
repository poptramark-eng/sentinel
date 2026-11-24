import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { PlatformOperatorGuard } from "../auth/platform-operator.guard";
import { ReturnCurriculumForChangesDto } from "./dto/return-curriculum-for-changes.dto";
import { ReviewGradeLearningAreaDto } from "./dto/review-grade-learning-area.dto";
import { CreateCurriculumDraftDto } from "./dto/create-curriculum-draft.dto";
import { UpdateCurriculumGradeAreaDto } from "./dto/update-curriculum-grade-area.dto";
import { PlatformCurriculumService } from "./platform-curriculum.service";

@Controller("platform/curricula")
@UseGuards(AccessTokenGuard, PlatformOperatorGuard, CsrfGuard)
export class PlatformCurriculaController {
  constructor(private readonly curricula: PlatformCurriculumService) {}

  @Post("import-preview")
  previewImport(@Body() body: CreateCurriculumDraftDto) {
    return this.curricula.previewImport(body);
  }

  @Post("import")
  importDraft(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateCurriculumDraftDto,
  ) {
    return this.curricula.createDraft(
      { accountId: request.auth!.accountId },
      body,
    );
  }

  @Get()
  list() {
    return this.curricula.list();
  }

  @Get(":versionId")
  getVersion(@Param("versionId", new ParseUUIDPipe()) versionId: string) {
    return this.curricula.getVersion(versionId);
  }

  @Patch(":versionId/grade-areas/:gradeLearningAreaId")
  updateGradeLearningArea(
    @Req() request: AuthenticatedRequest,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Param("gradeLearningAreaId", new ParseUUIDPipe()) gradeLearningAreaId: string,
    @Body() body: UpdateCurriculumGradeAreaDto,
  ) {
    return this.curricula.updateGradeLearningArea(
      { accountId: request.auth!.accountId },
      versionId,
      gradeLearningAreaId,
      body,
    );
  }

  @Patch(":versionId/grade-areas/:gradeLearningAreaId/review")
  reviewGradeLearningArea(
    @Req() request: AuthenticatedRequest,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Param("gradeLearningAreaId", new ParseUUIDPipe()) gradeLearningAreaId: string,
    @Body() body: ReviewGradeLearningAreaDto,
  ) {
    return this.curricula.reviewGradeLearningArea(
      { accountId: request.auth!.accountId },
      versionId,
      gradeLearningAreaId,
      body,
    );
  }

  @Post(":versionId/submit-review")
  submitForReview(
    @Req() request: AuthenticatedRequest,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.curricula.submitForReview(
      { accountId: request.auth!.accountId },
      versionId,
    );
  }

  @Post(":versionId/return")
  returnForChanges(
    @Req() request: AuthenticatedRequest,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() body: ReturnCurriculumForChangesDto,
  ) {
    return this.curricula.returnForChanges(
      { accountId: request.auth!.accountId },
      versionId,
      body,
    );
  }

  @Post(":versionId/publish")
  publish(
    @Req() request: AuthenticatedRequest,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.curricula.publish(
      { accountId: request.auth!.accountId },
      versionId,
    );
  }
}
