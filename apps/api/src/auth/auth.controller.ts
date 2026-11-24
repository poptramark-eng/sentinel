import {
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Body,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./auth.dto";
import {
  clearAuthCookies,
  getRefreshCookie,
  hasValidCsrf,
  setAuthCookies,
} from "./cookie";
import { AccessTokenGuard, AuthenticatedRequest } from "./access-token.guard";

interface CookieReply {
  header(name: string, value: string | string[]): unknown;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) reply: CookieReply,
  ) {
    const result = await this.authService.login(body.email, body.password);
    setAuthCookies(
      reply as never,
      result.accessToken,
      result.refreshToken,
      result.csrfToken,
    );
    return { user: result.user };
  }

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
    return { status: "REFRESHED" };
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
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request.auth!.accountId);
  }
}
