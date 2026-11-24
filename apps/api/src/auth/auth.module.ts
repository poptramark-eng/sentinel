import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthService } from "./auth.service";
import { CsrfGuard } from "./csrf.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard, CsrfGuard],
  exports: [AuthService, AccessTokenGuard, CsrfGuard],
})
export class AuthModule {}
