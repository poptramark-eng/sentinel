-- CreateTable
CREATE TABLE "TeacherInvitationToken" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "loginIdentifierId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "invitedByAccountId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherInvitationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherInvitationToken_tokenHash_key" ON "TeacherInvitationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TeacherInvitationToken_accountId_expiresAt_idx" ON "TeacherInvitationToken"("accountId", "expiresAt");

-- CreateIndex
CREATE INDEX "TeacherInvitationToken_membershipId_expiresAt_idx" ON "TeacherInvitationToken"("membershipId", "expiresAt");

-- CreateIndex
CREATE INDEX "TeacherInvitationToken_loginIdentifierId_consumedAt_idx" ON "TeacherInvitationToken"("loginIdentifierId", "consumedAt");

-- CreateIndex
CREATE INDEX "TeacherInvitationToken_expiresAt_idx" ON "TeacherInvitationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "TeacherInvitationToken" ADD CONSTRAINT "TeacherInvitationToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherInvitationToken" ADD CONSTRAINT "TeacherInvitationToken_invitedByAccountId_fkey" FOREIGN KEY ("invitedByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherInvitationToken" ADD CONSTRAINT "TeacherInvitationToken_loginIdentifierId_accountId_fkey" FOREIGN KEY ("loginIdentifierId", "accountId") REFERENCES "LoginIdentifier"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherInvitationToken" ADD CONSTRAINT "TeacherInvitationToken_membershipId_registrationId_councilId_fkey" FOREIGN KEY ("membershipId", "registrationId", "councilId") REFERENCES "SchoolMembership"("id", "registrationId", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep one unconsumed teacher invitation per global account.
CREATE UNIQUE INDEX "TeacherInvitationToken_one_unconsumed_per_account"
ON "TeacherInvitationToken" ("accountId")
WHERE "consumedAt" IS NULL;
