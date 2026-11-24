CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'FAILED'
);

CREATE TABLE "NotificationDelivery" (
  "id" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "recipientAccountId" UUID NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "textBody" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL,
  "payload" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'RESEND',
  "providerMessageId" TEXT,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDelivery_idempotencyKey_key"
  ON "NotificationDelivery"("idempotencyKey");
CREATE INDEX "NotificationDelivery_assessmentId_status_nextAttemptAt_idx"
  ON "NotificationDelivery"("assessmentId", "status", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_recipientAccountId_createdAt_idx"
  ON "NotificationDelivery"("recipientAccountId", "createdAt");
CREATE INDEX "NotificationDelivery_councilId_createdAt_idx"
  ON "NotificationDelivery"("councilId", "createdAt");
CREATE INDEX "NotificationDelivery_providerMessageId_idx"
  ON "NotificationDelivery"("providerMessageId");

ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_councilId_fkey"
  FOREIGN KEY ("councilId") REFERENCES "Council"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_recipientAccountId_fkey"
  FOREIGN KEY ("recipientAccountId") REFERENCES "UserAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;