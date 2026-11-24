import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { PlatformSchoolRegistrationsController } from "./platform-school-registrations.controller";
import { SchoolRegistrationsController } from "./school-registrations.controller";
import { SchoolRegistrationService } from "./school-registration.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    SchoolRegistrationsController,
    PlatformSchoolRegistrationsController,
  ],
  providers: [SchoolRegistrationService],
})
export class SchoolRegistrationsModule {}
