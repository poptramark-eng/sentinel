import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { PlatformOperatorGuard } from "../auth/platform-operator.guard";
import { ReturnCurriculumForChangesDto } from "./dto/return-curriculum-for-changes.dto";
import { PlatformCurriculumService } from "./platform-curriculum.service";

@Controller("platform/curricula")
@UseGuards(AccessTokenGuard, PlatformOperatorGuard, CsrfGuard)
export class PlatformCurriculaController {
  constructor(private readonly curricula: PlatformCurriculumService) {}

  @Get()
  list() {
    return this.curricula.list();
  }

  @Get(":versionId")
  getVersion(@Param("versionId", new ParseUUIDPipe()) versionId: string) {
    return this.curricula.getVersion(versionId);
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
