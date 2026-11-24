import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { SchoolRegistrationsModule } from "./school-registrations/school-registrations.module";
import { PlatformCouncilsModule } from "./platform-councils/platform-councils.module";
import { SchoolTeachersModule } from "./school-teachers/school-teachers.module";

@Module({
  imports: [DatabaseModule, AuthModule, SchoolRegistrationsModule, PlatformCouncilsModule, SchoolTeachersModule],
  controllers: [HealthController],
})
export class AppModule {}
