-- CreateEnum
CREATE TYPE "SchoolGrade" AS ENUM ('GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9');

-- CreateEnum
CREATE TYPE "SchoolClassStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StaffAssignmentType" AS ENUM ('CLASS_TEACHER');

-- CreateEnum
CREATE TYPE "StaffAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED', 'REVOKED');

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "grade" "SchoolGrade" NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "streamCode" TEXT NOT NULL DEFAULT 'MAIN',
    "displayName" TEXT,
    "status" "SchoolClassStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "councilId" UUID NOT NULL,
    "schoolClassId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "type" "StaffAssignmentType" NOT NULL DEFAULT 'CLASS_TEACHER',
    "status" "StaffAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolClass_councilId_academicYear_grade_status_idx" ON "SchoolClass"("councilId", "academicYear", "grade", "status");

-- CreateIndex
CREATE INDEX "SchoolClass_registrationId_status_grade_idx" ON "SchoolClass"("registrationId", "status", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_id_registrationId_councilId_key" ON "SchoolClass"("id", "registrationId", "councilId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_registrationId_academicYear_grade_streamCode_key" ON "SchoolClass"("registrationId", "academicYear", "grade", "streamCode");

-- CreateIndex
CREATE INDEX "StaffAssignment_registrationId_status_type_idx" ON "StaffAssignment"("registrationId", "status", "type");

-- CreateIndex
CREATE INDEX "StaffAssignment_membershipId_status_startsAt_idx" ON "StaffAssignment"("membershipId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "StaffAssignment_schoolClassId_status_type_idx" ON "StaffAssignment"("schoolClassId", "status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_id_registrationId_councilId_key" ON "StaffAssignment"("id", "registrationId", "councilId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMembership_id_registrationId_councilId_key" ON "SchoolMembership"("id", "registrationId", "councilId");

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_registrationId_councilId_fkey" FOREIGN KEY ("registrationId", "councilId") REFERENCES "CouncilSchoolRegistration"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_schoolClassId_registrationId_councilId_fkey" FOREIGN KEY ("schoolClassId", "registrationId", "councilId") REFERENCES "SchoolClass"("id", "registrationId", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_membershipId_registrationId_councilId_fkey" FOREIGN KEY ("membershipId", "registrationId", "councilId") REFERENCES "SchoolMembership"("id", "registrationId", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Only one active Class Teacher may coordinate a class at a time.
CREATE UNIQUE INDEX "StaffAssignment_one_active_class_teacher"
ON "StaffAssignment" ("schoolClassId")
WHERE "type" = 'CLASS_TEACHER' AND "status" = 'ACTIVE' AND "endsAt" IS NULL;

ALTER TABLE "SchoolClass"
ADD CONSTRAINT "SchoolClass_academicYear_range_check"
CHECK ("academicYear" BETWEEN 2000 AND 2100);

ALTER TABLE "SchoolClass"
ADD CONSTRAINT "SchoolClass_streamCode_normalized_check"
CHECK ("streamCode" = upper(btrim("streamCode")) AND length("streamCode") BETWEEN 1 AND 20);

ALTER TABLE "StaffAssignment"
ADD CONSTRAINT "StaffAssignment_dates_check"
CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");
