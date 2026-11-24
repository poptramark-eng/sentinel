import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { SchoolTeachersController } from "./school-teachers.controller";
import { SchoolTeacherService } from "./school-teacher.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [SchoolTeachersController],
  providers: [SchoolTeacherService],
})
export class SchoolTeachersModule {}
