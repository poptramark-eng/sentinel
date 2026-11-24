-- Enforce the documented curriculum review lifecycle at the database boundary.
ALTER TABLE "CouncilGradeLearningArea"
  ADD CONSTRAINT "CouncilGradeLearningArea_assessment_requires_enabled_check"
  CHECK (NOT "assessmentEligible" OR "enabled");

CREATE OR REPLACE FUNCTION sentinel_validate_curriculum_version_transition() RETURNS trigger AS $function$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'IN_REVIEW')
    OR (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('DRAFT', 'PUBLISHED'))
    OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'RETIRED')
  ) THEN
    RAISE EXCEPTION 'Invalid curriculum version status transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."status" = 'PUBLISHED' THEN
    IF NEW."reviewedByAccountId" IS NULL
      OR NEW."reviewedByAccountId" = NEW."createdByAccountId"
      OR NEW."publishedAt" IS NULL THEN
      RAISE EXCEPTION 'Publication requires a separate reviewer and publication timestamp'
        USING ERRCODE = '55000';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM "GradeLearningArea" gla
      WHERE gla."curriculumVersionId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'A curriculum version must contain grade learning areas before publication'
        USING ERRCODE = '55000';
    END IF;

    IF EXISTS (
      SELECT 1 FROM "GradeLearningArea" gla
      WHERE gla."curriculumVersionId" = NEW."id"
        AND (gla."reviewStatus" <> 'REVIEWED' OR gla."optionality" = 'UNKNOWN')
    ) THEN
      RAISE EXCEPTION 'Every grade learning area must have reviewed optionality before publication'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "CurriculumVersion_validate_transition"
BEFORE UPDATE OF "status" ON "CurriculumVersion"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_curriculum_version_transition();

-- Explicitly reject DELETE for published versions; retirement is an UPDATE-only operation.
CREATE OR REPLACE FUNCTION sentinel_reject_published_curriculum_mutation() RETURNS trigger AS $function$
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
      IF TG_OP <> 'UPDATE' OR NEW."status" <> 'RETIRED'
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
    ) OR (
      TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM "CurriculumVersion" v
        WHERE v."id" = NEW."curriculumVersionId" AND v."status" IN ('PUBLISHED', 'RETIRED')
      )
    ) THEN
      RAISE EXCEPTION 'Grade mappings for published curriculum versions are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
