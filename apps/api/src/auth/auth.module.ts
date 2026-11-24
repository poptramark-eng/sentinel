import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthService } from "./auth.service";
import { CsrfGuard } from "./csrf.guard";
import { AuthRateLimitGuard } from "./rate-limit.guard";
import { RateLimitService } from "./rate-limit.service";
import { EmailService } from "./email.service";
import { PlatformOperatorGuard } from "./platform-operator.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard, CsrfGuard, AuthRateLimitGuard, RateLimitService, EmailService, PlatformOperatorGuard],
  exports: [AuthService, AccessTokenGuard, CsrfGuard, RateLimitService, PlatformOperatorGuard, EmailService],
})
export class AuthModule {}
