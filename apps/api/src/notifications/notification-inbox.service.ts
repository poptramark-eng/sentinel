import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

const notificationSelect = {
  id: true, template: true, subject: true, textBody: true, status: true,
  createdAt: true, readAt: true, sentAt: true, deliveredAt: true,
} as const;

@Injectable()
export class NotificationInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async listForAccount(accountId: string, requestedLimit = 25) {
    const limit = Math.min(50, Math.max(1, requestedLimit));
    const [items, unreadCount] = await Promise.all([
      this.prisma.client.notificationDelivery.findMany({
        where: { recipientAccountId: accountId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: notificationSelect,
      }),
      this.prisma.client.notificationDelivery.count({
        where: { recipientAccountId: accountId, readAt: null },
      }),
    ]);
    return { items, unreadCount };
  }

  async markRead(accountId: string, notificationId: string) {
    const result = await this.prisma.client.notificationDelivery.updateMany({
      where: { id: notificationId, recipientAccountId: accountId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const existing = await this.prisma.client.notificationDelivery.findFirst({
        where: { id: notificationId, recipientAccountId: accountId },
        select: notificationSelect,
      });
      if (!existing) throw new NotFoundException("Notification was not found.");
      return existing;
    }
    return this.prisma.client.notificationDelivery.findFirstOrThrow({
      where: { id: notificationId, recipientAccountId: accountId },
      select: notificationSelect,
    });
  }

  async markAllRead(accountId: string) {
    const result = await this.prisma.client.notificationDelivery.updateMany({
      where: { recipientAccountId: accountId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }
}