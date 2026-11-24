-- Council-owned rubric versioning and immutable assessment configuration snapshots.
CREATE TYPE "RubricScaleType" AS ENUM ('NUMERIC_BANDS', 'PERFORMANCE_LEVELS', 'DESCRIPTIVE');
CREATE TYPE "RubricVersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'RETIRED');
CREATE TYPE "AssessmentType" AS ENUM ('FORMATIVE', 'SUMMATIVE', 'PRACTICE', 'OTHER');
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'RELEASED', 'CANCELLED');

CREATE TABLE "GradingRubric" (
  "id" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradingRubric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GradingRubricVersion" (
  "id" UUID NOT NULL,
  "rubricId" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "versionLabel" TEXT NOT NULL,
  "status" "RubricVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "scaleType" "RubricScaleType" NOT NULL,
  "scoreUnit" TEXT,
  "minScore" DECIMAL(10,4),
  "maxScore" DECIMAL(10,4),
  "createdByAccountId" UUID NOT NULL,
  "reviewedByAccountId" UUID,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradingRubricVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradingRubricVersion_score_range_check" CHECK (
    ("minScore" IS NULL AND "maxScore" IS NULL) OR
    ("minScore" IS NOT NULL AND "maxScore" IS NOT NULL AND "maxScore" > "minScore")
  ),
  CONSTRAINT "GradingRubricVersion_publication_review_check" CHECK (
    "status" <> 'PUBLISHED' OR
    ("reviewedByAccountId" IS NOT NULL AND "reviewedByAccountId" <> "createdByAccountId" AND "publishedAt" IS NOT NULL)
  )
);

CREATE TABLE "RubricBand" (
  "id" UUID NOT NULL,
  "rubricVersionId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "lowerBound" DECIMAL(10,4),
  "upperBound" DECIMAL(10,4),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RubricBand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RubricBand_bounds_check" CHECK (
    ("lowerBound" IS NULL AND "upperBound" IS NULL) OR
    ("lowerBound" IS NOT NULL AND "upperBound" IS NOT NULL AND "upperBound" > "lowerBound")
  ),
  CONSTRAINT "RubricBand_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "Assessment" (
  "id" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "councilCurriculumId" UUID NOT NULL,
  "curriculumVersionId" UUID NOT NULL,
  "rubricVersionId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "academicYear" INTEGER NOT NULL,
  "grade" "SchoolGrade" NOT NULL,
  "type" "AssessmentType" NOT NULL,
  "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "opensAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "createdByAccountId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Assessment_academicYear_check" CHECK ("academicYear" BETWEEN 2000 AND 2200),
  CONSTRAINT "Assessment_window_check" CHECK ("closesAt" IS NULL OR "opensAt" IS NULL OR "closesAt" > "opensAt")
);

CREATE TABLE "AssessmentLearningArea" (
  "id" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "curriculumVersionId" UUID NOT NULL,
  "councilGradeLearningAreaId" UUID NOT NULL,
  "grade" "SchoolGrade" NOT NULL,
  "learningAreaCode" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "displayLabel" TEXT,
  "maxMarks" DECIMAL(8,2) NOT NULL,
  "decimalPlaces" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentLearningArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentLearningArea_maxMarks_check" CHECK ("maxMarks" > 0),
  CONSTRAINT "AssessmentLearningArea_decimalPlaces_check" CHECK ("decimalPlaces" BETWEEN 0 AND 2),
  CONSTRAINT "AssessmentLearningArea_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "AssessmentRubricBand" (
  "id" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "rubricVersionId" UUID NOT NULL,
  "sourceRubricBandId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "lowerBound" DECIMAL(10,4),
  "upperBound" DECIMAL(10,4),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentRubricBand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentRubricBand_bounds_check" CHECK (
    ("lowerBound" IS NULL AND "upperBound" IS NULL) OR
    ("lowerBound" IS NOT NULL AND "upperBound" IS NOT NULL AND "upperBound" > "lowerBound")
  ),
  CONSTRAINT "AssessmentRubricBand_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "GradingRubric_id_councilId_key" ON "GradingRubric"("id", "councilId");
CREATE UNIQUE INDEX "GradingRubric_councilId_code_key" ON "GradingRubric"("councilId", "code");
CREATE INDEX "GradingRubric_councilId_name_idx" ON "GradingRubric"("councilId", "name");
CREATE UNIQUE INDEX "GradingRubricVersion_id_councilId_key" ON "GradingRubricVersion"("id", "councilId");
CREATE UNIQUE INDEX "GradingRubricVersion_id_rubricId_key" ON "GradingRubricVersion"("id", "rubricId");
CREATE UNIQUE INDEX "GradingRubricVersion_rubricId_versionLabel_key" ON "GradingRubricVersion"("rubricId", "versionLabel");
CREATE INDEX "GradingRubricVersion_councilId_status_createdAt_idx" ON "GradingRubricVersion"("councilId", "status", "createdAt");
CREATE INDEX "GradingRubricVersion_rubricId_status_idx" ON "GradingRubricVersion"("rubricId", "status");
CREATE UNIQUE INDEX "RubricBand_id_rubricVersionId_key" ON "RubricBand"("id", "rubricVersionId");
CREATE UNIQUE INDEX "RubricBand_rubricVersionId_code_key" ON "RubricBand"("rubricVersionId", "code");
CREATE UNIQUE INDEX "RubricBand_rubricVersionId_sortOrder_key" ON "RubricBand"("rubricVersionId", "sortOrder");
CREATE INDEX "RubricBand_rubricVersionId_lowerBound_upperBound_idx" ON "RubricBand"("rubricVersionId", "lowerBound", "upperBound");
CREATE UNIQUE INDEX "Assessment_id_councilId_curriculumVersionId_key" ON "Assessment"("id", "councilId", "curriculumVersionId");
CREATE UNIQUE INDEX "Assessment_id_rubricVersionId_key" ON "Assessment"("id", "rubricVersionId");
CREATE UNIQUE INDEX "Assessment_councilId_code_academicYear_key" ON "Assessment"("councilId", "code", "academicYear");
CREATE INDEX "Assessment_councilId_academicYear_grade_status_idx" ON "Assessment"("councilId", "academicYear", "grade", "status");
CREATE INDEX "Assessment_councilCurriculumId_status_idx" ON "Assessment"("councilCurriculumId", "status");
CREATE INDEX "Assessment_rubricVersionId_idx" ON "Assessment"("rubricVersionId");
CREATE UNIQUE INDEX "AssessmentLearningArea_assessmentId_councilGradeLearningAreaId_key" ON "AssessmentLearningArea"("assessmentId", "councilGradeLearningAreaId");
CREATE INDEX "AssessmentLearningArea_assessmentId_sortOrder_idx" ON "AssessmentLearningArea"("assessmentId", "sortOrder");
CREATE INDEX "AssessmentLearningArea_councilGradeLearningAreaId_idx" ON "AssessmentLearningArea"("councilGradeLearningAreaId");
CREATE UNIQUE INDEX "AssessmentRubricBand_assessmentId_sourceRubricBandId_key" ON "AssessmentRubricBand"("assessmentId", "sourceRubricBandId");
CREATE INDEX "AssessmentRubricBand_assessmentId_sortOrder_idx" ON "AssessmentRubricBand"("assessmentId", "sortOrder");

ALTER TABLE "GradingRubric" ADD CONSTRAINT "GradingRubric_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradingRubricVersion" ADD CONSTRAINT "GradingRubricVersion_rubricId_councilId_fkey" FOREIGN KEY ("rubricId", "councilId") REFERENCES "GradingRubric"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradingRubricVersion" ADD CONSTRAINT "GradingRubricVersion_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradingRubricVersion" ADD CONSTRAINT "GradingRubricVersion_reviewedByAccountId_fkey" FOREIGN KEY ("reviewedByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RubricBand" ADD CONSTRAINT "RubricBand_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "GradingRubricVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_councilCurriculumId_councilId_curriculumVersionId_fkey" FOREIGN KEY ("councilCurriculumId", "councilId", "curriculumVersionId") REFERENCES "CouncilCurriculum"("id", "councilId", "curriculumVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_rubricVersionId_councilId_fkey" FOREIGN KEY ("rubricVersionId", "councilId") REFERENCES "GradingRubricVersion"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentLearningArea" ADD CONSTRAINT "AssessmentLearningArea_assessmentId_councilId_curriculumVersionId_fkey" FOREIGN KEY ("assessmentId", "councilId", "curriculumVersionId") REFERENCES "Assessment"("id", "councilId", "curriculumVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentLearningArea" ADD CONSTRAINT "AssessmentLearningArea_councilGradeLearningAreaId_councilId_curriculumVersionId_fkey" FOREIGN KEY ("councilGradeLearningAreaId", "councilId", "curriculumVersionId") REFERENCES "CouncilGradeLearningArea"("id", "councilId", "curriculumVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentRubricBand" ADD CONSTRAINT "AssessmentRubricBand_assessmentId_rubricVersionId_fkey" FOREIGN KEY ("assessmentId", "rubricVersionId") REFERENCES "Assessment"("id", "rubricVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentRubricBand" ADD CONSTRAINT "AssessmentRubricBand_sourceRubricBandId_rubricVersionId_fkey" FOREIGN KEY ("sourceRubricBandId", "rubricVersionId") REFERENCES "RubricBand"("id", "rubricVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION sentinel_validate_rubric_version_transition() RETURNS trigger AS $function$
DECLARE
  overlap_count INTEGER;
BEGIN
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'IN_REVIEW')
    OR (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('DRAFT', 'PUBLISHED'))
    OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'RETIRED')
  ) THEN
    RAISE EXCEPTION 'Invalid rubric version status transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."status" = 'PUBLISHED' THEN
    IF NEW."reviewedByAccountId" IS NULL OR NEW."reviewedByAccountId" = NEW."createdByAccountId"
      OR NEW."publishedAt" IS NULL THEN
      RAISE EXCEPTION 'Rubric publication requires an independent reviewer and publication timestamp'
        USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "RubricBand" b WHERE b."rubricVersionId" = NEW."id") THEN
      RAISE EXCEPTION 'A rubric version must contain at least one band before publication'
        USING ERRCODE = '55000';
    END IF;

    IF NEW."scaleType" = 'NUMERIC_BANDS' THEN
      IF NEW."minScore" IS NULL OR NEW."maxScore" IS NULL THEN
        RAISE EXCEPTION 'Numeric rubric versions require a configured score range'
          USING ERRCODE = '55000';
      END IF;
      IF EXISTS (
        SELECT 1 FROM "RubricBand" b
        WHERE b."rubricVersionId" = NEW."id"
          AND (b."lowerBound" IS NULL OR b."upperBound" IS NULL
            OR b."lowerBound" < NEW."minScore" OR b."upperBound" > NEW."maxScore")
      ) THEN
        RAISE EXCEPTION 'Every numeric rubric band must have bounds within the rubric score range'
          USING ERRCODE = '55000';
      END IF;
      SELECT COUNT(*) INTO overlap_count
      FROM "RubricBand" a
      JOIN "RubricBand" b ON a."rubricVersionId" = b."rubricVersionId"
        AND a."id" < b."id"
        AND a."lowerBound" < b."upperBound"
        AND b."lowerBound" < a."upperBound"
      WHERE a."rubricVersionId" = NEW."id";
      IF overlap_count > 0 THEN
        RAISE EXCEPTION 'Numeric rubric bands must not overlap; use lower-inclusive, upper-exclusive intervals'
          USING ERRCODE = '55000';
      END IF;
    ELSIF NEW."minScore" IS NOT NULL OR NEW."maxScore" IS NOT NULL OR EXISTS (
      SELECT 1 FROM "RubricBand" b
      WHERE b."rubricVersionId" = NEW."id"
        AND (b."lowerBound" IS NOT NULL OR b."upperBound" IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'Performance-level and descriptive rubrics do not accept numeric boundaries'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "GradingRubricVersion_validate_transition"
BEFORE UPDATE OF "status" ON "GradingRubricVersion"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_rubric_version_transition();

CREATE FUNCTION sentinel_reject_published_rubric_mutation() RETURNS trigger AS $function$
DECLARE
  target_version_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'GradingRubricVersion' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW."status" <> 'DRAFT' THEN
        RAISE EXCEPTION 'Rubric versions must be created as drafts' USING ERRCODE = '55000';
      END IF;
    ELSIF OLD."status" IN ('PUBLISHED', 'RETIRED') THEN
      IF OLD."status" = 'RETIRED' OR TG_OP <> 'UPDATE' OR NEW."status" <> 'RETIRED'
        OR (to_jsonb(NEW) - 'status' - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updatedAt') THEN
        RAISE EXCEPTION 'Published and retired rubric versions are immutable except for retirement' USING ERRCODE = '55000';
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      target_version_id := NEW."rubricVersionId";
    ELSE
      target_version_id := OLD."rubricVersionId";
    END IF;
    IF EXISTS (
      SELECT 1 FROM "GradingRubricVersion" v
      WHERE v."id" = target_version_id AND v."status" IN ('PUBLISHED', 'RETIRED')
    ) OR (
      TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM "GradingRubricVersion" v
        WHERE v."id" = NEW."rubricVersionId" AND v."status" IN ('PUBLISHED', 'RETIRED')
      )
    ) THEN
      RAISE EXCEPTION 'Bands for published or retired rubric versions are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "GradingRubricVersion_immutable_published"
BEFORE INSERT OR UPDATE OR DELETE ON "GradingRubricVersion"
FOR EACH ROW EXECUTE FUNCTION sentinel_reject_published_rubric_mutation();

CREATE TRIGGER "RubricBand_immutable_published"
BEFORE INSERT OR UPDATE OR DELETE ON "RubricBand"
FOR EACH ROW EXECUTE FUNCTION sentinel_reject_published_rubric_mutation();

CREATE FUNCTION sentinel_validate_assessment_transition() RETURNS trigger AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Assessments must be created as drafts' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Only draft assessments may be deleted' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" <> 'DRAFT'
    AND (to_jsonb(NEW) - 'status' - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updatedAt') THEN
    RAISE EXCEPTION 'Assessment configuration is locked after leaving draft' USING ERRCODE = '55000';
  END IF;

  IF NEW."status" <> OLD."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('SCHEDULED', 'CANCELLED'))
    OR (OLD."status" = 'SCHEDULED' AND NEW."status" IN ('OPEN', 'CANCELLED'))
    OR (OLD."status" = 'OPEN' AND NEW."status" = 'CLOSED')
    OR (OLD."status" = 'CLOSED' AND NEW."status" = 'RELEASED')
  ) THEN
    RAISE EXCEPTION 'Invalid assessment status transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."status" = 'SCHEDULED' THEN
    IF NEW."opensAt" IS NULL OR NEW."closesAt" IS NULL OR NEW."closesAt" <= NEW."opensAt" THEN
      RAISE EXCEPTION 'Scheduling requires a valid opening and closing window' USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "AssessmentLearningArea" a WHERE a."assessmentId" = NEW."id")
      OR NOT EXISTS (SELECT 1 FROM "AssessmentRubricBand" b WHERE b."assessmentId" = NEW."id") THEN
      RAISE EXCEPTION 'Assessment snapshots must be complete before scheduling' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "Assessment_validate_transition"
BEFORE INSERT OR UPDATE OR DELETE ON "Assessment"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_assessment_transition();

CREATE FUNCTION sentinel_lock_assessment_snapshot() RETURNS trigger AS $function$
DECLARE
  target_assessment_id UUID;
  target_status "AssessmentStatus";
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_assessment_id := NEW."assessmentId";
  ELSE
    target_assessment_id := OLD."assessmentId";
  END IF;
  SELECT "status" INTO target_status FROM "Assessment" WHERE "id" = target_assessment_id;
  IF target_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Assessment snapshots are immutable after the assessment leaves draft' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."assessmentId" <> OLD."assessmentId" THEN
    SELECT "status" INTO target_status FROM "Assessment" WHERE "id" = NEW."assessmentId";
    IF target_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Assessment snapshots cannot be moved into a locked assessment' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentLearningArea_lock_snapshot"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentLearningArea"
FOR EACH ROW EXECUTE FUNCTION sentinel_lock_assessment_snapshot();

CREATE TRIGGER "AssessmentRubricBand_lock_snapshot"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentRubricBand"
FOR EACH ROW EXECUTE FUNCTION sentinel_lock_assessment_snapshot();
