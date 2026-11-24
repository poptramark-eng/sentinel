import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { SchoolClassesController } from "./school-classes.controller";
import { SchoolClassService } from "./school-class.service";
import { LearnerEnrollmentController } from "./learner-enrollment.controller";
import { LearnerEnrollmentService } from "./learner-enrollment.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [SchoolClassesController, LearnerEnrollmentController],
  providers: [SchoolClassService, LearnerEnrollmentService],
})
export class SchoolClassesModule {}
