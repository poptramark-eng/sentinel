import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { ChildDataProcessingGuard } from "../privacy/child-data-processing.guard";
import { UpdateAssessmentMarkDto } from "./dto/update-assessment-mark.dto";
import { SchoolAssessmentMarkService } from "./school-assessment-mark.service";

@Controller("school/registrations/:registrationId/classes/:classId/assessments/:assessmentId/marks")
@UseGuards(AccessTokenGuard, CsrfGuard, ChildDataProcessingGuard)
export class SchoolAssessmentMarksController {
  constructor(private readonly marks: SchoolAssessmentMarkService) {}

  @Get()
  getMarkSheet(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
    @Query("learningAreaId") learningAreaId?: string,
  ) {
    return this.marks.getMarkSheet(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId, classId, assessmentId, learningAreaId,
    );
  }

  @Put()
  saveMark(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
    @Body() body: UpdateAssessmentMarkDto,
  ) {
    return this.marks.saveMark(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId, classId, assessmentId, body,
    );
  }

  @Post("submit")
  submitClassMarks(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
    @Query("learningAreaId") learningAreaId?: string,
  ) {
    return this.marks.submitLearningAreaMarks(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId, classId, assessmentId, learningAreaId,
    );
  }
}
