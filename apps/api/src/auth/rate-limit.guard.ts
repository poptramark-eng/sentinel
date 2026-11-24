import {
  CanActivate,
  ExecutionContext,
  SetMetadata,
  HttpException,
  HttpStatus,
  UseGuards,
  applyDecorators,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimitService } from "./rate-limit.service";
import { CookieRequest, hasTrustedOrigin, hasValidCsrf } from "./cookie";

const AUTH_RATE_LIMIT_POLICY = "sentinel:auth-rate-limit-policy";
type AuthRateLimitPolicy = "LOGIN" | "REFRESH" | "REGISTER" | "VERIFY_EMAIL" | "RESEND_VERIFICATION";
interface RequestWithLoginBody extends CookieRequest {
  ip: string;
  body?: { email?: unknown };
}

interface RateLimitReply {
  header(name: string, value: string): unknown;
}

export function AuthRateLimit(policy: AuthRateLimitPolicy) {
  return applyDecorators(
    SetMetadata(AUTH_RATE_LIMIT_POLICY, policy),
    UseGuards(AuthRateLimitGuard),
  );
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.get<AuthRateLimitPolicy>(
      AUTH_RATE_LIMIT_POLICY,
      context.getHandler(),
    );
    if (!policy) return true;

    const request = context.switchToHttp().getRequest<RequestWithLoginBody>();
    const reply = context.switchToHttp().getResponse<RateLimitReply>();

    if (policy === "REFRESH" && !hasValidCsrf(request)) {
      throw new UnauthorizedException("CSRF validation failed.");
    }
    if (policy !== "REFRESH" && !hasTrustedOrigin(request)) {
      throw new UnauthorizedException("Request origin is not trusted.");
    }

    const email = typeof request.body?.email === "string"
      ? request.body.email
      : undefined;
    const decision = policy === "LOGIN"
      ? await this.rateLimitService.checkLogin(request.ip, email)
      : policy === "REFRESH"
        ? await this.rateLimitService.checkRefresh(request.ip)
        : policy === "REGISTER"
          ? await this.rateLimitService.checkRegister(request.ip, email)
          : policy === "RESEND_VERIFICATION"
            ? await this.rateLimitService.checkResendVerification(request.ip, email)
            : await this.rateLimitService.checkVerifyEmail(request.ip);

    if (!decision.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil(((decision.resetAt ?? Date.now()) - Date.now()) / 1_000),
      );
      reply.header("Retry-After", String(retryAfter));
      throw new HttpException(
        "Too many authentication attempts. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
