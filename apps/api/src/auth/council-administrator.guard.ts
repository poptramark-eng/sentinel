import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuthenticatedRequest } from "./access-token.guard";

@Injectable()
export class CouncilAdministratorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accountId = request.auth?.accountId;
    const councilId = (request as AuthenticatedRequest & { params?: Record<string, string | undefined> }).params?.councilId;
    if (!accountId || !councilId) {
      throw new ForbiddenException("Council administrator access is required.");
    }

    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: accountId },
      select: { personId: true },
    });
    if (!account) {
      throw new ForbiddenException("Council administrator access is required.");
    }

    const now = new Date();
    const membership = await this.prisma.client.councilMembership.findFirst({
      where: {
        councilId,
        personId: account.personId,
        role: "COUNCIL_ADMINISTRATOR",
        status: "ACTIVE",
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException("An active Council Administrator membership is required for this Council.");
    }
    return true;
  }
}
