import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { PlatformCurriculaController } from "./platform-curricula.controller";
import { PlatformCurriculumService } from "./platform-curriculum.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PlatformCurriculaController],
  providers: [PlatformCurriculumService],
})
export class PlatformCurriculaModule {}
