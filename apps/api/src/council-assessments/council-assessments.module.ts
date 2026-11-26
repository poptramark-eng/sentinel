import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CouncilAdministratorGuard } from "../auth/council-administrator.guard";
import { CouncilGovernanceApproverGuard } from "../auth/council-governance-approver.guard";
import { CouncilRubricReaderGuard } from "../auth/council-rubric-reader.guard";
import { DatabaseModule } from "../database/database.module";
import { ChildDataProcessingGuard } from "../privacy/child-data-processing.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { CouncilAssessmentsController } from "./council-assessments.controller";
import { CouncilAssessmentService } from "./council-assessment.service";
import { AssessmentResultsService } from "./assessment-results.service";

@Module({
  imports: [AuthModule, DatabaseModule, NotificationsModule],
  controllers: [CouncilAssessmentsController],
  providers: [CouncilAssessmentService, AssessmentResultsService, CouncilAdministratorGuard, CouncilGovernanceApproverGuard, CouncilRubricReaderGuard, ChildDataProcessingGuard],
})
export class CouncilAssessmentsModule {}