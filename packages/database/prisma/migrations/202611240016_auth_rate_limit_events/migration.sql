CREATE TABLE "AuthRateLimitEvent" (
    "id" UUID NOT NULL,
    "keyHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "AuthRateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthRateLimitEvent_keyHash_createdAt_idx"
    ON "AuthRateLimitEvent"("keyHash", "createdAt");

CREATE INDEX "AuthRateLimitEvent_expiresAt_idx"
    ON "AuthRateLimitEvent"("expiresAt");
