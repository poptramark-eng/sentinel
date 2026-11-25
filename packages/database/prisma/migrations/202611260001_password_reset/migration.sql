-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "loginIdentifierId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_accountId_expiresAt_idx" ON "PasswordResetToken"("accountId", "expiresAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_loginIdentifierId_consumedAt_idx" ON "PasswordResetToken"("loginIdentifierId", "consumedAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_loginIdentifierId_accountId_fkey" FOREIGN KEY ("loginIdentifierId", "accountId") REFERENCES "LoginIdentifier"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep at most one live, unconsumed reset token per email identifier.
CREATE UNIQUE INDEX "PasswordResetToken_one_unconsumed_per_identifier"
ON "PasswordResetToken" ("loginIdentifierId")
WHERE "consumedAt" IS NULL;
