import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { SchoolRegistrationsModule } from "./school-registrations/school-registrations.module";
import { PlatformCouncilsModule } from "./platform-councils/platform-councils.module";
import { SchoolTeachersModule } from "./school-teachers/school-teachers.module";
import { SchoolClassesModule } from "./school-classes/school-classes.module";
import { PlatformCurriculaModule } from "./platform-curricula/platform-curricula.module";
import { CouncilCurriculaModule } from "./council-curricula/council-curricula.module";
import { CouncilAssessmentsModule } from "./council-assessments/council-assessments.module";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [DatabaseModule, AuthModule, SchoolRegistrationsModule, PlatformCouncilsModule, SchoolTeachersModule, SchoolClassesModule, PlatformCurriculaModule, CouncilCurriculaModule, CouncilAssessmentsModule, NotificationsModule],
  controllers: [HealthController],
})
export class AppModule {}
