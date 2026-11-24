-- Curriculum catalogue and Council configuration foundation.
CREATE TYPE "CurriculumVersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'RETIRED');
CREATE TYPE "CurriculumOptionality" AS ENUM ('UNKNOWN', 'CORE', 'OPTIONAL');
CREATE TYPE "CurriculumReviewStatus" AS ENUM ('REVIEW_REQUIRED', 'REVIEWED');
CREATE TYPE "CouncilCurriculumStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

CREATE TABLE "Curriculum" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "track" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CurriculumVersion" (
  "id" UUID NOT NULL,
  "curriculumId" UUID NOT NULL,
  "versionLabel" TEXT NOT NULL,
  "status" "CurriculumVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceTitle" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceRetrievedAt" TIMESTAMP(3) NOT NULL,
  "sourceSha256" VARCHAR(64) NOT NULL,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdByAccountId" UUID NOT NULL,
  "reviewedByAccountId" UUID,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CurriculumVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CurriculumVersion_sourceSha256_check" CHECK ("sourceSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CurriculumVersion_effective_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "CurriculumVersion_publication_review_check" CHECK ("status" <> 'PUBLISHED' OR ("reviewedByAccountId" IS NOT NULL AND "reviewedByAccountId" <> "createdByAccountId" AND "publishedAt" IS NOT NULL))
);
CREATE TABLE "LearningArea" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningArea_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GradeLearningArea" (
  "id" UUID NOT NULL,
  "curriculumVersionId" UUID NOT NULL,
  "learningAreaId" UUID NOT NULL,
  "grade" "SchoolGrade" NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "optionality" "CurriculumOptionality" NOT NULL DEFAULT 'UNKNOWN',
  "reviewStatus" "CurriculumReviewStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradeLearningArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradeLearningArea_sortOrder_check" CHECK ("sortOrder" >= 0)
);
CREATE TABLE "CouncilCurriculum" (
  "id" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "curriculumVersionId" UUID NOT NULL,
  "status" "CouncilCurriculumStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CouncilCurriculum_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CouncilCurriculum_effective_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "CouncilCurriculum_status_dates_check" CHECK (("status" = 'ACTIVE' AND "effectiveTo" IS NULL) OR ("status" = 'SUPERSEDED' AND "effectiveTo" IS NOT NULL))
);
CREATE TABLE "CouncilGradeLearningArea" (
  "id" UUID NOT NULL,
  "councilCurriculumId" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "curriculumVersionId" UUID NOT NULL,
  "gradeLearningAreaId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "assessmentEligible" BOOLEAN NOT NULL DEFAULT FALSE,
  "displayLabel" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CouncilGradeLearningArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CouncilGradeLearningArea_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "Curriculum_code_key" ON "Curriculum"("code");
CREATE INDEX "Curriculum_track_name_idx" ON "Curriculum"("track", "name");
CREATE UNIQUE INDEX "CurriculumVersion_curriculumId_versionLabel_key" ON "CurriculumVersion"("curriculumId", "versionLabel");
CREATE UNIQUE INDEX "CurriculumVersion_id_curriculumId_key" ON "CurriculumVersion"("id", "curriculumId");
CREATE INDEX "CurriculumVersion_status_createdAt_idx" ON "CurriculumVersion"("status", "createdAt");
CREATE INDEX "CurriculumVersion_curriculumId_status_idx" ON "CurriculumVersion"("curriculumId", "status");
CREATE UNIQUE INDEX "LearningArea_code_key" ON "LearningArea"("code");
CREATE INDEX "LearningArea_canonicalName_idx" ON "LearningArea"("canonicalName");
CREATE UNIQUE INDEX "GradeLearningArea_curriculumVersionId_grade_learningAreaId_key" ON "GradeLearningArea"("curriculumVersionId", "grade", "learningAreaId");
CREATE UNIQUE INDEX "GradeLearningArea_id_curriculumVersionId_key" ON "GradeLearningArea"("id", "curriculumVersionId");
CREATE INDEX "GradeLearningArea_curriculumVersionId_grade_sortOrder_idx" ON "GradeLearningArea"("curriculumVersionId", "grade", "sortOrder");
CREATE INDEX "GradeLearningArea_learningAreaId_grade_idx" ON "GradeLearningArea"("learningAreaId", "grade");
CREATE INDEX "GradeLearningArea_reviewStatus_optionality_idx" ON "GradeLearningArea"("reviewStatus", "optionality");
CREATE UNIQUE INDEX "CouncilCurriculum_id_councilId_curriculumVersionId_key" ON "CouncilCurriculum"("id", "councilId", "curriculumVersionId");
CREATE UNIQUE INDEX "CouncilCurriculum_councilId_curriculumVersionId_effectiveFrom_key" ON "CouncilCurriculum"("councilId", "curriculumVersionId", "effectiveFrom");
CREATE INDEX "CouncilCurriculum_councilId_status_effectiveFrom_idx" ON "CouncilCurriculum"("councilId", "status", "effectiveFrom");
CREATE INDEX "CouncilCurriculum_curriculumVersionId_status_idx" ON "CouncilCurriculum"("curriculumVersionId", "status");
CREATE UNIQUE INDEX "CouncilGradeLearningArea_councilCurriculumId_gradeLearningAreaId_key" ON "CouncilGradeLearningArea"("councilCurriculumId", "gradeLearningAreaId");
CREATE UNIQUE INDEX "CouncilGradeLearningArea_id_councilId_curriculumVersionId_key" ON "CouncilGradeLearningArea"("id", "councilId", "curriculumVersionId");
CREATE INDEX "CouncilGradeLearningArea_councilId_enabled_assessmentEligible_idx" ON "CouncilGradeLearningArea"("councilId", "enabled", "assessmentEligible");
CREATE INDEX "CouncilGradeLearningArea_councilCurriculumId_sortOrder_idx" ON "CouncilGradeLearningArea"("councilCurriculumId", "sortOrder");

ALTER TABLE "CurriculumVersion" ADD CONSTRAINT "CurriculumVersion_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CurriculumVersion" ADD CONSTRAINT "CurriculumVersion_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CurriculumVersion" ADD CONSTRAINT "CurriculumVersion_reviewedByAccountId_fkey" FOREIGN KEY ("reviewedByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeLearningArea" ADD CONSTRAINT "GradeLearningArea_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeLearningArea" ADD CONSTRAINT "GradeLearningArea_learningAreaId_fkey" FOREIGN KEY ("learningAreaId") REFERENCES "LearningArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouncilCurriculum" ADD CONSTRAINT "CouncilCurriculum_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouncilCurriculum" ADD CONSTRAINT "CouncilCurriculum_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouncilGradeLearningArea" ADD CONSTRAINT "CouncilGradeLearningArea_councilCurriculumId_councilId_curriculumVersionId_fkey" FOREIGN KEY ("councilCurriculumId", "councilId", "curriculumVersionId") REFERENCES "CouncilCurriculum"("id", "councilId", "curriculumVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouncilGradeLearningArea" ADD CONSTRAINT "CouncilGradeLearningArea_gradeLearningAreaId_curriculumVersionId_fkey" FOREIGN KEY ("gradeLearningAreaId", "curriculumVersionId") REFERENCES "GradeLearningArea"("id", "curriculumVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A Council has only one active current curriculum configuration.
CREATE UNIQUE INDEX "CouncilCurriculum_one_active_current"
ON "CouncilCurriculum" ("councilId")
WHERE "status" = 'ACTIVE' AND "effectiveTo" IS NULL;

-- Published catalogue versions and their grade mappings are immutable.
CREATE FUNCTION sentinel_reject_published_curriculum_mutation() RETURNS trigger AS $
DECLARE
  target_version_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'CurriculumVersion' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW."status" <> 'DRAFT' THEN
        RAISE EXCEPTION 'Curriculum versions must be created as drafts' USING ERRCODE = '55000';
      END IF;
    ELSIF OLD."status" = 'RETIRED' THEN
      RAISE EXCEPTION 'Retired curriculum versions are immutable' USING ERRCODE = '55000';
    ELSIF OLD."status" = 'PUBLISHED' THEN
      IF NEW."status" <> 'RETIRED'
        OR (to_jsonb(NEW) - 'status' - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updatedAt') THEN
        RAISE EXCEPTION 'Published curriculum versions are immutable except for retirement' USING ERRCODE = '55000';
      END IF;
      IF EXISTS (
        SELECT 1 FROM "CouncilCurriculum" cc
        WHERE cc."curriculumVersionId" = OLD."id"
          AND cc."status" = 'ACTIVE' AND cc."effectiveTo" IS NULL
      ) THEN
        RAISE EXCEPTION 'A curriculum version selected as current by a Council cannot be retired' USING ERRCODE = '55000';
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      target_version_id := NEW."curriculumVersionId";
    ELSE
      target_version_id := OLD."curriculumVersionId";
    END IF;
    IF EXISTS (
      SELECT 1 FROM "CurriculumVersion" v
      WHERE v."id" = target_version_id AND v."status" IN ('PUBLISHED', 'RETIRED')
    ) THEN
      RAISE EXCEPTION 'Grade mappings for published curriculum versions are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER "CurriculumVersion_immutable_published"
BEFORE INSERT OR UPDATE OR DELETE ON "CurriculumVersion"
FOR EACH ROW EXECUTE FUNCTION sentinel_reject_published_curriculum_mutation();

CREATE TRIGGER "GradeLearningArea_immutable_published"
BEFORE INSERT OR UPDATE OR DELETE ON "GradeLearningArea"
FOR EACH ROW EXECUTE FUNCTION sentinel_reject_published_curriculum_mutation();

CREATE FUNCTION sentinel_require_published_curriculum_selection() RETURNS trigger AS $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "CurriculumVersion" v
    WHERE v."id" = NEW."curriculumVersionId" AND v."status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'A Council may select only a published curriculum version' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER "CouncilCurriculum_requires_published_version"
BEFORE INSERT OR UPDATE ON "CouncilCurriculum"
FOR EACH ROW EXECUTE FUNCTION sentinel_require_published_curriculum_selection();
