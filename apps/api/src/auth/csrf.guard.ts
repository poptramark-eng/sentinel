import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { hasValidCsrf } from "./cookie";
import { AuthenticatedRequest } from "./access-token.guard";

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!hasValidCsrf(request)) {
      throw new UnauthorizedException("CSRF validation failed.");
    }
    return true;
  }
}
