import {
  Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post,
  Query, Req, UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { NotificationInboxService } from "./notification-inbox.service";

@Controller("notifications")
@UseGuards(AccessTokenGuard, CsrfGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationInboxService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.notifications.listForAccount(request.auth!.accountId, limit);
  }

  @Patch(":id/read")
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.notifications.markRead(request.auth!.accountId, id);
  }

  @Post("read-all")
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(request.auth!.accountId);
  }
}