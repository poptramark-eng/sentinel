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

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [SchoolClassesController, LearnerEnrollmentController, SchoolAssessmentMarksController, SchoolTeachingController],
  providers: [SchoolClassService, LearnerEnrollmentService, SchoolAssessmentMarkService],
})
export class SchoolClassesModule {}
