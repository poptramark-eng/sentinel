import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { CouncilAdministratorGuard } from "../auth/council-administrator.guard";
import { CouncilCurriculaController } from "./council-curricula.controller";
import { CouncilCurriculumService } from "./council-curriculum.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CouncilCurriculaController],
  providers: [CouncilCurriculumService, CouncilAdministratorGuard],
})
export class CouncilCurriculaModule {}
