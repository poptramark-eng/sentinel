import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CouncilAdministratorGuard } from "../auth/council-administrator.guard";
import { CouncilGovernanceApproverGuard } from "../auth/council-governance-approver.guard";
import { DatabaseModule } from "../database/database.module";
import { CouncilAssessmentsController } from "./council-assessments.controller";
import { CouncilAssessmentService } from "./council-assessment.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CouncilAssessmentsController],
  providers: [CouncilAssessmentService, CouncilAdministratorGuard, CouncilGovernanceApproverGuard],
})
export class CouncilAssessmentsModule {}
