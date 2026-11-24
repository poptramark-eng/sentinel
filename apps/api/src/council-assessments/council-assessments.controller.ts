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
import { CouncilAdministratorGuard } from "../auth/council-administrator.guard";
import { CouncilGovernanceApproverGuard } from "../auth/council-governance-approver.guard";
import { CouncilRubricReaderGuard } from "../auth/council-rubric-reader.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { CreateAssessmentDto } from "./dto/create-assessment.dto";
import { CreateRubricDto, CreateRubricVersionDto, CreateRubricBandDto } from "./dto/create-rubric.dto";
import { ScheduleAssessmentDto } from "./dto/schedule-assessment.dto";
import { ReturnRubricForChangesDto } from "./dto/return-rubric-for-changes.dto";
import { ReturnAssessmentMarksDto } from "./dto/return-assessment-marks.dto";
import { CouncilAssessmentService } from "./council-assessment.service";
import { AssessmentResultsService } from "./assessment-results.service";

@Controller("councils/:councilId")
@UseGuards(AccessTokenGuard, CsrfGuard)
export class CouncilAssessmentsController {
  constructor(
    private readonly assessments: CouncilAssessmentService,
    private readonly results: AssessmentResultsService,
  ) {}

  @Get("rubrics")
  @UseGuards(CouncilRubricReaderGuard)
  listRubrics(@Param("councilId", new ParseUUIDPipe()) councilId: string) {
    return this.assessments.listRubrics(councilId);
  }

  @Post("rubrics")
  @UseGuards(CouncilAdministratorGuard)
  createRubric(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Body() body: CreateRubricDto,
  ) {
    return this.assessments.createRubric({ accountId: request.auth!.accountId }, councilId, body);
  }

  @Post("rubrics/:rubricId/versions")
  @UseGuards(CouncilAdministratorGuard)
  createRubricVersion(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("rubricId", new ParseUUIDPipe()) rubricId: string,
    @Body() body: CreateRubricVersionDto,
  ) {
    return this.assessments.createRubricVersion({ accountId: request.auth!.accountId }, councilId, rubricId, body);
  }

  @Post("rubrics/versions/:versionId/bands")
  @UseGuards(CouncilAdministratorGuard)
  addRubricBand(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() body: CreateRubricBandDto,
  ) {
    return this.assessments.addRubricBand({ accountId: request.auth!.accountId }, councilId, versionId, body);
  }

  @Post("rubrics/versions/:versionId/submit-review")
  @UseGuards(CouncilAdministratorGuard)
  submitRubricForReview(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.assessments.submitRubricForReview({ accountId: request.auth!.accountId }, councilId, versionId);
  }

  @Post("rubrics/versions/:versionId/return-for-changes")
  @UseGuards(CouncilGovernanceApproverGuard)
  returnRubricForChanges(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() body: ReturnRubricForChangesDto,
  ) {
    return this.assessments.returnRubricForChanges(
      { accountId: request.auth!.accountId },
      councilId,
      versionId,
      body.reason.trim(),
    );
  }

  @Post("rubrics/versions/:versionId/publish")
  @UseGuards(CouncilGovernanceApproverGuard)
  publishRubric(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.assessments.publishRubric({ accountId: request.auth!.accountId }, councilId, versionId);
  }

  @Get("rubrics/review-queue")
  @UseGuards(CouncilGovernanceApproverGuard)
  listRubricReviewQueue(@Param("councilId", new ParseUUIDPipe()) councilId: string) {
    return this.assessments.listRubricReviewQueue(councilId);
  }

  @Get("assessments")
  @UseGuards(CouncilRubricReaderGuard)
  listAssessments(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
  ) {
    return this.assessments.listAssessments(councilId, request.auth!.accountId);
  }

  @Post("assessments")
  @UseGuards(CouncilAdministratorGuard)
  createAssessment(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Body() body: CreateAssessmentDto,
  ) {
    return this.assessments.createAssessment({ accountId: request.auth!.accountId }, councilId, body);
  }

  @Post("assessments/:assessmentId/schedule")
  @UseGuards(CouncilAdministratorGuard)
  scheduleAssessment(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
    @Body() body: ScheduleAssessmentDto,
  ) {
    return this.assessments.scheduleAssessment({ accountId: request.auth!.accountId }, councilId, assessmentId, body);
  }

  @Post("assessments/:assessmentId/open")
  @UseGuards(CouncilAdministratorGuard)
  openAssessment(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.assessments.openAssessment({ accountId: request.auth!.accountId }, councilId, assessmentId);
  }

  @Post("assessments/:assessmentId/classes/:classId/return-marks")
  @UseGuards(CouncilGovernanceApproverGuard)
  returnClassMarksForCorrection(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
    @Body() body: ReturnAssessmentMarksDto,
  ) {
    return this.assessments.returnClassMarksForCorrection(
      { accountId: request.auth!.accountId },
      councilId,
      assessmentId,
      classId,
      body.reason.trim(),
    );
  }

  @Post("assessments/:assessmentId/classes/:classId/learning-areas/:learningAreaId/return-marks")
  @UseGuards(CouncilGovernanceApproverGuard)
  returnLearningAreaMarksForCorrection(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
    @Param("learningAreaId", new ParseUUIDPipe()) learningAreaId: string,
    @Body() body: ReturnAssessmentMarksDto,
  ) {
    return this.assessments.returnLearningAreaMarksForCorrection(
      { accountId: request.auth!.accountId },
      councilId,
      assessmentId,
      classId,
      learningAreaId,
      body.reason.trim(),
    );
  }

  @Get("assessments/:assessmentId/results")
  @UseGuards(CouncilRubricReaderGuard)
  getPublishedAssessmentResults(
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.results.published(councilId, assessmentId);
  }

  @Get("assessments/:assessmentId/results/preview")
  @UseGuards(CouncilRubricReaderGuard)
  previewAssessmentResults(
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.results.preview(councilId, assessmentId);
  }

  @Post("assessments/:assessmentId/results/publish")
  @UseGuards(CouncilGovernanceApproverGuard)
  publishAssessmentResults(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.results.publish({ accountId: request.auth!.accountId }, councilId, assessmentId);
  }

  @Post("assessments/:assessmentId/close")
  @UseGuards(CouncilAdministratorGuard)
  closeAssessment(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("assessmentId", new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.assessments.closeAssessment({ accountId: request.auth!.accountId }, councilId, assessmentId);
  }
}
