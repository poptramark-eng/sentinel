import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { PlatformCouncilsController } from "./platform-councils.controller";
import { PlatformCouncilService } from "./platform-council.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PlatformCouncilsController],
  providers: [PlatformCouncilService],
})
export class PlatformCouncilsModule {}
