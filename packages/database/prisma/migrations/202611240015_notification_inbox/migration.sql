ALTER TABLE "NotificationDelivery"
ADD COLUMN "readAt" TIMESTAMP(3);

CREATE INDEX "NotificationDelivery_recipientAccountId_readAt_createdAt_idx"
ON "NotificationDelivery"("recipientAccountId", "readAt", "createdAt");