-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlatformOperatorRole" AS ENUM ('PLATFORM_ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "PlatformOperatorStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "LoginIdentifierType" AS ENUM ('EMAIL', 'PHONE', 'USERNAME');

-- CreateEnum
CREATE TYPE "CouncilStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CouncilMembershipRole" AS ENUM ('COUNCIL_ADMINISTRATOR', 'COUNCIL_APPROVER', 'COUNCIL_GOVERNANCE_APPROVER', 'COUNCIL_MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('PROVISIONAL', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SchoolMembershipRole" AS ENUM ('SCHOOL_ADMINISTRATOR', 'TEACHER');

-- CreateEnum
CREATE TYPE "SchoolIdentifierType" AS ENUM ('MINISTRY_REGISTRY', 'COUNCIL_REGISTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "GeographyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "givenName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "authVersion" INTEGER NOT NULL DEFAULT 0,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformOperator" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "role" "PlatformOperatorRole" NOT NULL DEFAULT 'PLATFORM_ADMINISTRATOR',
    "status" "PlatformOperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginIdentifier" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" "LoginIdentifierType" NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Council" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CouncilStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Council_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilMembership" (
    "id" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "role" "CouncilMembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SchoolStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolIdentifier" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "type" "SchoolIdentifierType" NOT NULL,
    "issuer" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "County" (
    "id" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "County_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcounty" (
    "id" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "countyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subcounty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "subcountyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cluster" (
    "id" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" "GeographyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilSchoolRegistration" (
    "id" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "clusterId" UUID NOT NULL,
    "registrationCode" TEXT,
    "submittedSchoolName" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "initialRegistrantPersonId" UUID NOT NULL,
    "reviewedByAccountId" UUID,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CouncilSchoolRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMembership" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "role" "SchoolMembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorAccountId" UUID,
    "councilId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "decision" TEXT,
    "reason" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_familyName_givenName_idx" ON "Person"("familyName", "givenName");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_personId_key" ON "UserAccount"("personId");

-- CreateIndex
CREATE INDEX "UserAccount_status_idx" ON "UserAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOperator_accountId_key" ON "PlatformOperator"("accountId");

-- CreateIndex
CREATE INDEX "PlatformOperator_status_role_idx" ON "PlatformOperator"("status", "role");

-- CreateIndex
CREATE INDEX "LoginIdentifier_accountId_verifiedAt_idx" ON "LoginIdentifier"("accountId", "verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoginIdentifier_type_normalizedValue_key" ON "LoginIdentifier"("type", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "Council_slug_key" ON "Council"("slug");

-- CreateIndex
CREATE INDEX "Council_status_name_idx" ON "Council"("status", "name");

-- CreateIndex
CREATE INDEX "CouncilMembership_personId_status_idx" ON "CouncilMembership"("personId", "status");

-- CreateIndex
CREATE INDEX "CouncilMembership_councilId_status_role_idx" ON "CouncilMembership"("councilId", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilMembership_councilId_personId_role_key" ON "CouncilMembership"("councilId", "personId", "role");

-- CreateIndex
CREATE INDEX "School_name_idx" ON "School"("name");

-- CreateIndex
CREATE INDEX "SchoolIdentifier_schoolId_type_idx" ON "SchoolIdentifier"("schoolId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolIdentifier_issuer_normalizedValue_key" ON "SchoolIdentifier"("issuer", "normalizedValue");

-- CreateIndex
CREATE INDEX "Region_councilId_status_idx" ON "Region"("councilId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Region_id_councilId_key" ON "Region"("id", "councilId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_councilId_name_key" ON "Region"("councilId", "name");

-- CreateIndex
CREATE INDEX "County_councilId_status_idx" ON "County"("councilId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "County_id_councilId_key" ON "County"("id", "councilId");

-- CreateIndex
CREATE UNIQUE INDEX "County_regionId_name_key" ON "County"("regionId", "name");

-- CreateIndex
CREATE INDEX "Subcounty_councilId_status_idx" ON "Subcounty"("councilId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subcounty_id_councilId_key" ON "Subcounty"("id", "councilId");

-- CreateIndex
CREATE UNIQUE INDEX "Subcounty_countyId_name_key" ON "Subcounty"("countyId", "name");

-- CreateIndex
CREATE INDEX "Zone_councilId_status_idx" ON "Zone"("councilId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_id_councilId_key" ON "Zone"("id", "councilId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_subcountyId_name_key" ON "Zone"("subcountyId", "name");

-- CreateIndex
CREATE INDEX "Cluster_councilId_status_idx" ON "Cluster"("councilId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Cluster_id_councilId_key" ON "Cluster"("id", "councilId");

-- CreateIndex
CREATE UNIQUE INDEX "Cluster_zoneId_name_key" ON "Cluster"("zoneId", "name");

-- CreateIndex
CREATE INDEX "CouncilSchoolRegistration_councilId_status_submittedAt_idx" ON "CouncilSchoolRegistration"("councilId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "CouncilSchoolRegistration_schoolId_councilId_createdAt_idx" ON "CouncilSchoolRegistration"("schoolId", "councilId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilSchoolRegistration_id_councilId_key" ON "CouncilSchoolRegistration"("id", "councilId");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilSchoolRegistration_councilId_registrationCode_key" ON "CouncilSchoolRegistration"("councilId", "registrationCode");

-- CreateIndex
CREATE INDEX "SchoolMembership_personId_status_idx" ON "SchoolMembership"("personId", "status");

-- CreateIndex
CREATE INDEX "SchoolMembership_registrationId_status_role_idx" ON "SchoolMembership"("registrationId", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_registrationId_personId_role_key" ON "SchoolMembership"("registrationId", "personId", "role");

-- CreateIndex
CREATE INDEX "AuditEvent_councilId_createdAt_idx" ON "AuditEvent"("councilId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_createdAt_idx" ON "AuditEvent"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorAccountId_createdAt_idx" ON "AuditEvent"("actorAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_accountId_revokedAt_idx" ON "RefreshToken"("accountId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_revokedAt_idx" ON "RefreshToken"("familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformOperator" ADD CONSTRAINT "PlatformOperator_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginIdentifier" ADD CONSTRAINT "LoginIdentifier_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMembership" ADD CONSTRAINT "CouncilMembership_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMembership" ADD CONSTRAINT "CouncilMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolIdentifier" ADD CONSTRAINT "SchoolIdentifier_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "County" ADD CONSTRAINT "County_regionId_councilId_fkey" FOREIGN KEY ("regionId", "councilId") REFERENCES "Region"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcounty" ADD CONSTRAINT "Subcounty_countyId_councilId_fkey" FOREIGN KEY ("countyId", "councilId") REFERENCES "County"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_subcountyId_councilId_fkey" FOREIGN KEY ("subcountyId", "councilId") REFERENCES "Subcounty"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cluster" ADD CONSTRAINT "Cluster_zoneId_councilId_fkey" FOREIGN KEY ("zoneId", "councilId") REFERENCES "Zone"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilSchoolRegistration" ADD CONSTRAINT "CouncilSchoolRegistration_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilSchoolRegistration" ADD CONSTRAINT "CouncilSchoolRegistration_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilSchoolRegistration" ADD CONSTRAINT "CouncilSchoolRegistration_clusterId_councilId_fkey" FOREIGN KEY ("clusterId", "councilId") REFERENCES "Cluster"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilSchoolRegistration" ADD CONSTRAINT "CouncilSchoolRegistration_initialRegistrantPersonId_fkey" FOREIGN KEY ("initialRegistrantPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilSchoolRegistration" ADD CONSTRAINT "CouncilSchoolRegistration_reviewedByAccountId_fkey" FOREIGN KEY ("reviewedByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_registrationId_councilId_fkey" FOREIGN KEY ("registrationId", "councilId") REFERENCES "CouncilSchoolRegistration"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Only one active registration episode per Council and canonical School.
-- Historical REJECTED, WITHDRAWN and EXPIRED episodes remain available.
CREATE UNIQUE INDEX "CouncilSchoolRegistration_one_active"
ON "CouncilSchoolRegistration" ("councilId", "schoolId")
WHERE "status" IN ('PENDING_REVIEW', 'APPROVED', 'SUSPENDED');
