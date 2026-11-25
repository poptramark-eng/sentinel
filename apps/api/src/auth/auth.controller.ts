import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto, PasswordResetCompleteDto, PasswordResetRequestDto, RegisterDto, ResendVerificationDto, VerifyEmailDto } from "./auth.dto";
import {
  CookieReply,
  clearAuthCookies,
  getRefreshCookie,
  hasTrustedOrigin,
  hasValidCsrf,
  setAuthCookies,
  setCsrfCookie,
} from "./cookie";
import { AccessTokenGuard, AuthenticatedRequest } from "./access-token.guard";
import { createCsrfToken } from "./token";
import { AuthRateLimit } from "./rate-limit.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @AuthRateLimit("REGISTER")
  @Post("register")
  @HttpCode(HttpStatus.ACCEPTED)
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @AuthRateLimit("VERIFY_EMAIL")
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.token);
  }

  @AuthRateLimit("RESEND_VERIFICATION")
  @Post("resend-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body.email);
  }

  @AuthRateLimit("PASSWORD_RESET_REQUEST")
  @Post("password-reset/request")
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @AuthRateLimit("PASSWORD_RESET_COMPLETE")
  @Post("password-reset/complete")
  @HttpCode(HttpStatus.OK)
  completePasswordReset(@Body() body: PasswordResetCompleteDto) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Get("csrf")
  csrf(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: CookieReply,
  ) {
    if (!hasTrustedOrigin(request)) {
      throw new UnauthorizedException("Request origin is not trusted.");
    }
    const csrfToken = createCsrfToken();
    setCsrfCookie(reply, csrfToken);
    return { csrfToken };
  }

  @AuthRateLimit("LOGIN")
  @Post("login")
  async login(
    @Body() body: LoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: CookieReply,
  ) {
    if (!hasTrustedOrigin(request)) {
      throw new UnauthorizedException("Request origin is not trusted.");
    }
    const result = await this.authService.login(body.email, body.password);
    setAuthCookies(
      reply as never,
      result.accessToken,
      result.refreshToken,
      result.csrfToken,
    );
    return { user: result.user, csrfToken: result.csrfToken };
  }

  @AuthRateLimit("REFRESH")
  @Post("refresh")
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: CookieReply,
  ) {
    if (!hasValidCsrf(request as never)) {
      throw new UnauthorizedException("CSRF validation failed.");
    }
    const rawToken = getRefreshCookie(request as never);
    if (!rawToken) {
      throw new UnauthorizedException("Refresh token is missing.");
    }

    const result = await this.authService.refresh(rawToken);
    setAuthCookies(
      reply as never,
      result.accessToken,
      result.refreshToken,
      result.csrfToken,
    );
    return { status: "REFRESHED", csrfToken: result.csrfToken };
  }

  @UseGuards(AccessTokenGuard)
  @Post("logout")
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: CookieReply,
  ) {
    if (!hasValidCsrf(request as never)) {
      throw new UnauthorizedException("CSRF validation failed.");
    }
    await this.authService.logout(
      request.auth!.accountId,
      getRefreshCookie(request as never),
    );
    clearAuthCookies(reply as never);
    return { status: "SIGNED_OUT" };
  }

  @UseGuards(AccessTokenGuard)
  @Post("logout-all")
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: CookieReply,
  ) {
    if (!hasValidCsrf(request as never)) {
      throw new UnauthorizedException("CSRF validation failed.");
    }
    await this.authService.logoutAll(request.auth!.accountId);
    clearAuthCookies(reply as never);
    return { status: "SIGNED_OUT_ALL_DEVICES" };
  }

  @UseGuards(AccessTokenGuard)
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request.auth!.accountId);
  }
}
