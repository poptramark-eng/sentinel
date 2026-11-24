-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "loginIdentifierId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_accountId_expiresAt_idx" ON "EmailVerificationToken"("accountId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_loginIdentifierId_consumedAt_idx" ON "EmailVerificationToken"("loginIdentifierId", "consumedAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoginIdentifier_id_accountId_key" ON "LoginIdentifier"("id", "accountId");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_loginIdentifierId_accountId_fkey" FOREIGN KEY ("loginIdentifierId", "accountId") REFERENCES "LoginIdentifier"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep at most one live, unconsumed verification token per email identifier.
CREATE UNIQUE INDEX "EmailVerificationToken_one_unconsumed_per_identifier"
ON "EmailVerificationToken" ("loginIdentifierId")
WHERE "consumedAt" IS NULL;
