import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { SchoolRegistrationsModule } from "./school-registrations/school-registrations.module";

@Module({
  imports: [DatabaseModule, AuthModule, SchoolRegistrationsModule],
  controllers: [HealthController],
})
export class AppModule {}
