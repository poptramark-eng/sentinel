import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { ChildDataProcessingGuard } from "../privacy/child-data-processing.guard";
import { SchoolAssessmentSubmissionService } from "./school-assessment-submission.service";

@Controller("school/registrations/:registrationId/assessments")
@UseGuards(AccessTokenGuard, CsrfGuard, ChildDataProcessingGuard)
export class SchoolAssessmentSubmissionController {
  constructor(private readonly submissions: SchoolAssessmentSubmissionService) {}

  @Get()
  listSchoolAssessments(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
  ) {
    return this.submissions.listSchoolAssessments({ accountId: request.auth!.accountId, personId: request.auth!.personId }, registrationId);
  }

  @Get(":assessmentId/submission")
  getSubmission(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.submissions.getSubmission({ accountId: request.auth!.accountId, personId: request.auth!.personId }, registrationId, assessmentId);
  }

  @Get(":assessmentId/results")
  getPublishedResults(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.submissions.publishedSchoolResults({ accountId: request.auth!.accountId, personId: request.auth!.personId }, registrationId, assessmentId);
  }

  @Post(":assessmentId/submission")
  submit(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.submissions.submitSchoolAssessment({ accountId: request.auth!.accountId, personId: request.auth!.personId }, registrationId, assessmentId);
  }
}
