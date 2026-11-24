import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuthenticatedRequest } from "./access-token.guard";

@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accountId = request.auth?.accountId;
    if (!accountId) {
      throw new ForbiddenException("Platform operator access is required.");
    }

    const operator = await this.prisma.client.platformOperator.findUnique({
      where: { accountId },
      select: { status: true, role: true },
    });

    if (
      !operator ||
      operator.status !== "ACTIVE" ||
      operator.role !== "PLATFORM_ADMINISTRATOR"
    ) {
      throw new ForbiddenException("Platform operator access is required.");
    }

    return true;
  }
}
