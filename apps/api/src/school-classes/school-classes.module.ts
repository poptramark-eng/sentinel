import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { SchoolClassesController } from "./school-classes.controller";
import { SchoolClassService } from "./school-class.service";
import { LearnerEnrollmentController } from "./learner-enrollment.controller";
import { LearnerEnrollmentService } from "./learner-enrollment.service";
import { SchoolAssessmentMarksController } from "./school-assessment-marks.controller";
import { SchoolAssessmentMarkService } from "./school-assessment-mark.service";
import { SchoolTeachingController } from "./school-teaching.controller";
import { SchoolAssessmentSubmissionController } from "./school-assessment-submission.controller";
import { SchoolAssessmentSubmissionService } from "./school-assessment-submission.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [SchoolClassesController, LearnerEnrollmentController, SchoolAssessmentMarksController, SchoolTeachingController, SchoolAssessmentSubmissionController],
  providers: [SchoolClassService, LearnerEnrollmentService, SchoolAssessmentMarkService, SchoolAssessmentSubmissionService],
})
export class SchoolClassesModule {}
