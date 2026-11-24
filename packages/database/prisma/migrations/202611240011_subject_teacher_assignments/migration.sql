
ALTER TABLE "StaffAssignment"
  ADD COLUMN "councilGradeLearningAreaId" UUID,
  ADD COLUMN "curriculumVersionId" UUID;

ALTER TABLE "StaffAssignment"
  ADD CONSTRAINT "StaffAssignment_subject_area_fkey"
  FOREIGN KEY ("councilGradeLearningAreaId", "councilId", "curriculumVersionId")
  REFERENCES "CouncilGradeLearningArea"("id", "councilId", "curriculumVersionId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffAssignment"
  ADD CONSTRAINT "StaffAssignment_type_area_check"
  CHECK (
    ("type" = 'CLASS_TEACHER' AND "councilGradeLearningAreaId" IS NULL AND "curriculumVersionId" IS NULL)
    OR
    ("type" = 'SUBJECT_TEACHER' AND "councilGradeLearningAreaId" IS NOT NULL AND "curriculumVersionId" IS NOT NULL)
  );

CREATE INDEX "StaffAssignment_subject_area_idx"
  ON "StaffAssignment"("councilGradeLearningAreaId", "status", "startsAt");

CREATE UNIQUE INDEX "StaffAssignment_one_active_subject_teacher_per_class_area"
  ON "StaffAssignment"("schoolClassId", "councilGradeLearningAreaId")
  WHERE "type" = 'SUBJECT_TEACHER' AND "status" = 'ACTIVE' AND "endsAt" IS NULL;
