import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Body, UseGuards, Patch } from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { EnrollLearnerDto } from "./dto/enroll-learner.dto";
import { EndLearnerEnrollmentDto } from "./dto/end-learner-enrollment.dto";
import { LearnerEnrollmentService } from "./learner-enrollment.service";

@Controller("school/registrations/:registrationId")
@UseGuards(AccessTokenGuard, CsrfGuard)
export class LearnerEnrollmentController {
  constructor(private readonly learners: LearnerEnrollmentService) {}

  @Get("learners/search")
  searchExisting(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Query("q") query = "",
  ) {
    return this.learners.searchExisting(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId,
      query,
    );
  }

  @Get("classes/:classId/learners")
  listClassLearners(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
  ) {
    return this.learners.listClassLearners(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId,
      classId,
    );
  }

  @Patch("learners/:enrollmentId/end")
  endEnrollment(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("enrollmentId", new ParseUUIDPipe()) enrollmentId: string,
    @Body() body: EndLearnerEnrollmentDto,
  ) {
    return this.learners.endEnrollment(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId,
      enrollmentId,
      body.status,
      body.reason.trim(),
    );
  }

  @Post("classes/:classId/learners")
  enroll(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
    @Body() body: EnrollLearnerDto,
  ) {
    return this.learners.enroll(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId,
      classId,
      body,
    );
  }
}
