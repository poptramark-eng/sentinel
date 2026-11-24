import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { getAccessCookie } from "./cookie";
import { verifyAccessToken } from "./token";

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: {
    accountId: string;
    personId: string;
    authVersion: number;
  };
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getAccessCookie(request as never);
    if (!token) {
      throw new UnauthorizedException("Authentication is required.");
    }

    const claims = verifyAccessToken(token);
    if (!claims) {
      throw new UnauthorizedException("Access token is invalid or expired.");
    }

    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        personId: true,
        status: true,
        authVersion: true,
      },
    });

    if (
      !account ||
      account.status !== "ACTIVE" ||
      account.personId !== claims.personId ||
      account.authVersion !== claims.av
    ) {
      throw new UnauthorizedException("Account access is no longer active.");
    }

    request.auth = {
      accountId: account.id,
      personId: account.personId,
      authVersion: account.authVersion,
    };
    return true;
  }
}
