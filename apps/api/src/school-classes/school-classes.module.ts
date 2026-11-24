import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { SchoolClassesController } from "./school-classes.controller";
import { SchoolClassService } from "./school-class.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [SchoolClassesController],
  providers: [SchoolClassService],
})
export class SchoolClassesModule {}
