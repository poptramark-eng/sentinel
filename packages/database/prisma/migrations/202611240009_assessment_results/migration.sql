CREATE TYPE "AssessmentResultPublicationStatus" AS ENUM ('PUBLISHED', 'SUPERSEDED');

ALTER TABLE "AssessmentCandidate"
  ADD COLUMN "schoolIdSnapshot" UUID,
  ADD COLUMN "schoolNameSnapshot" TEXT;

UPDATE "AssessmentCandidate" c
SET "schoolIdSnapshot" = r."schoolId",
    "schoolNameSnapshot" = s."name"
FROM "CouncilSchoolRegistration" r
JOIN "School" s ON s."id" = r."schoolId"
WHERE c."registrationId" = r."id";

ALTER TABLE "AssessmentCandidate"
  ALTER COLUMN "schoolIdSnapshot" SET NOT NULL,
  ALTER COLUMN "schoolNameSnapshot" SET NOT NULL;

CREATE TABLE "AssessmentResultPublication" (
  "id" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "AssessmentResultPublicationStatus" NOT NULL DEFAULT 'PUBLISHED',
  "publishedByAccountId" UUID NOT NULL,
  "candidateCount" INTEGER NOT NULL,
  "schoolCount" INTEGER NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentResultPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentResultPublication_version_check" CHECK ("version" > 0),
  CONSTRAINT "AssessmentResultPublication_candidateCount_check" CHECK ("candidateCount" > 0),
  CONSTRAINT "AssessmentResultPublication_schoolCount_check" CHECK ("schoolCount" > 0),
  CONSTRAINT "AssessmentResultPublication_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentResultPublication_councilId_fkey"
    FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentResultPublication_publishedByAccountId_fkey"
    FOREIGN KEY ("publishedByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssessmentResultPublication_id_assessmentId_key"
  ON "AssessmentResultPublication"("id", "assessmentId");
CREATE UNIQUE INDEX "AssessmentResultPublication_assessmentId_version_key"
  ON "AssessmentResultPublication"("assessmentId", "version");
CREATE UNIQUE INDEX "AssessmentResultPublication_one_published_per_assessment"
  ON "AssessmentResultPublication"("assessmentId") WHERE "status" = 'PUBLISHED';
CREATE INDEX "AssessmentResultPublication_councilId_publishedAt_idx"
  ON "AssessmentResultPublication"("councilId", "publishedAt");

CREATE TABLE "AssessmentResult" (
  "id" UUID NOT NULL,
  "publicationId" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "schoolClassId" UUID NOT NULL,
  "schoolIdSnapshot" UUID NOT NULL,
  "learnerNumberSnapshot" TEXT NOT NULL,
  "learnerNameSnapshot" TEXT NOT NULL,
  "schoolNameSnapshot" TEXT NOT NULL,
  "schoolClassNameSnapshot" TEXT NOT NULL,
  "gradeSnapshot" "SchoolGrade" NOT NULL,
  "totalMarks" DECIMAL(12,4) NOT NULL,
  "maximumMarks" DECIMAL(12,4) NOT NULL,
  "percentage" DECIMAL(8,4) NOT NULL,
  "rank" INTEGER NOT NULL,
  "overallBandCode" TEXT,
  "overallBandLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentResult_totalMarks_check" CHECK ("totalMarks" >= 0),
  CONSTRAINT "AssessmentResult_maximumMarks_check" CHECK ("maximumMarks" > 0),
  CONSTRAINT "AssessmentResult_percentage_check" CHECK ("percentage" >= 0 AND "percentage" <= 100),
  CONSTRAINT "AssessmentResult_rank_check" CHECK ("rank" > 0),
  CONSTRAINT "AssessmentResult_publicationId_assessmentId_fkey"
    FOREIGN KEY ("publicationId", "assessmentId")
    REFERENCES "AssessmentResultPublication"("id", "assessmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentResult_candidateId_assessmentId_fkey"
    FOREIGN KEY ("candidateId", "assessmentId")
    REFERENCES "AssessmentCandidate"("id", "assessmentId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssessmentResult_id_assessmentId_key"
  ON "AssessmentResult"("id", "assessmentId");
CREATE UNIQUE INDEX "AssessmentResult_publicationId_candidateId_key"
  ON "AssessmentResult"("publicationId", "candidateId");
CREATE INDEX "AssessmentResult_publicationId_rank_idx"
  ON "AssessmentResult"("publicationId", "rank");
CREATE INDEX "AssessmentResult_registrationId_schoolClassId_idx"
  ON "AssessmentResult"("registrationId", "schoolClassId");
CREATE INDEX "AssessmentResult_schoolIdSnapshot_rank_idx"
  ON "AssessmentResult"("schoolIdSnapshot", "rank");

CREATE TABLE "AssessmentResultLearningArea" (
  "id" UUID NOT NULL,
  "resultId" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "assessmentLearningAreaId" UUID NOT NULL,
  "learningAreaCode" TEXT NOT NULL,
  "learningAreaName" TEXT NOT NULL,
  "displayLabel" TEXT NOT NULL,
  "marks" DECIMAL(12,4) NOT NULL,
  "maximumMarks" DECIMAL(12,4) NOT NULL,
  "percentage" DECIMAL(8,4) NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentResultLearningArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentResultLearningArea_marks_check" CHECK ("marks" >= 0),
  CONSTRAINT "AssessmentResultLearningArea_maximumMarks_check" CHECK ("maximumMarks" > 0),
  CONSTRAINT "AssessmentResultLearningArea_percentage_check" CHECK ("percentage" >= 0 AND "percentage" <= 100),
  CONSTRAINT "AssessmentResultLearningArea_resultId_assessmentId_fkey"
    FOREIGN KEY ("resultId", "assessmentId")
    REFERENCES "AssessmentResult"("id", "assessmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentResultLearningArea_assessmentLearningAreaId_assessmentId_fkey"
    FOREIGN KEY ("assessmentLearningAreaId", "assessmentId")
    REFERENCES "AssessmentLearningArea"("id", "assessmentId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssessmentResultLearningArea_resultId_assessmentLearningAreaId_key"
  ON "AssessmentResultLearningArea"("resultId", "assessmentLearningAreaId");
CREATE INDEX "AssessmentResultLearningArea_assessmentId_assessmentLearningAreaId_idx"
  ON "AssessmentResultLearningArea"("assessmentId", "assessmentLearningAreaId");

CREATE FUNCTION sentinel_validate_assessment_result_publication() RETURNS trigger AS $function$
DECLARE
  assessment_status "AssessmentStatus";
  assessment_council_id UUID;
  active_candidates INTEGER;
  distinct_schools INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Assessment result publications are immutable' USING ERRCODE = '55000';
  END IF;
  SELECT "status", "councilId" INTO assessment_status, assessment_council_id
  FROM "Assessment" WHERE "id" = NEW."assessmentId";
  IF assessment_status <> 'CLOSED' OR assessment_council_id <> NEW."councilId" OR NEW."status" <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'Results can be published only for a closed assessment in the same Council' USING ERRCODE = '55000';
  END IF;
  SELECT count(*), count(DISTINCT "schoolIdSnapshot")
    INTO active_candidates, distinct_schools
  FROM "AssessmentCandidate"
  WHERE "assessmentId" = NEW."assessmentId" AND "status" = 'ACTIVE';
  IF active_candidates = 0 OR active_candidates <> NEW."candidateCount" OR distinct_schools <> NEW."schoolCount" THEN
    RAISE EXCEPTION 'Result publication counts must match the active assessment roster' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentResultPublication_validate"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentResultPublication"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_assessment_result_publication();

CREATE FUNCTION sentinel_validate_assessment_result_snapshot() RETURNS trigger AS $function$
DECLARE
  assessment_status "AssessmentStatus";
  publication_status "AssessmentResultPublicationStatus";
  candidate_status "AssessmentCandidateStatus";
  candidate_school_id UUID;
  candidate_school_name TEXT;
  candidate_number TEXT;
  candidate_name TEXT;
  candidate_grade "SchoolGrade";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Published assessment result snapshots are immutable' USING ERRCODE = '55000';
  END IF;
  SELECT a."status", p."status", c."status", c."schoolIdSnapshot", c."schoolNameSnapshot",
         c."learnerNumberSnapshot", c."learnerNameSnapshot", c."classGradeSnapshot"
    INTO assessment_status, publication_status, candidate_status, candidate_school_id,
         candidate_school_name, candidate_number, candidate_name, candidate_grade
  FROM "Assessment" a
  JOIN "AssessmentResultPublication" p ON p."assessmentId" = a."id"
  JOIN "AssessmentCandidate" c ON c."assessmentId" = a."id"
  WHERE a."id" = NEW."assessmentId" AND p."id" = NEW."publicationId" AND c."id" = NEW."candidateId";
  IF assessment_status <> 'CLOSED' OR publication_status <> 'PUBLISHED' OR candidate_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Result snapshots require a closed assessment and active published candidate' USING ERRCODE = '55000';
  END IF;
  IF NEW."schoolIdSnapshot" <> candidate_school_id
    OR NEW."schoolNameSnapshot" <> candidate_school_name
    OR NEW."learnerNumberSnapshot" <> candidate_number
    OR NEW."learnerNameSnapshot" <> candidate_name
    OR NEW."gradeSnapshot" <> candidate_grade THEN
    RAISE EXCEPTION 'Result identity snapshots must match the scheduled candidate roster' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentResult_validate"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentResult"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_assessment_result_snapshot();

CREATE FUNCTION sentinel_validate_assessment_result_learning_area() RETURNS trigger AS $function$
DECLARE
  source_marks DECIMAL(10,4);
  source_maximum DECIMAL(8,2);
  source_status "AssessmentMarkStatus";
  source_code TEXT;
  source_name TEXT;
  source_label TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Published assessment learning-area results are immutable' USING ERRCODE = '55000';
  END IF;
  SELECT m."marks", m."status", a."maxMarks", a."learningAreaCode", a."canonicalName",
         coalesce(a."displayLabel", a."sourceLabel")
    INTO source_marks, source_status, source_maximum, source_code, source_name, source_label
  FROM "AssessmentResult" r
  JOIN "AssessmentMark" m ON m."assessmentId" = r."assessmentId"
    AND m."candidateId" = r."candidateId"
    AND m."assessmentLearningAreaId" = NEW."assessmentLearningAreaId"
  JOIN "AssessmentLearningArea" a ON a."assessmentId" = r."assessmentId"
    AND a."id" = NEW."assessmentLearningAreaId"
  WHERE r."id" = NEW."resultId" AND r."assessmentId" = NEW."assessmentId";
  IF source_status <> 'SUBMITTED' OR source_marks IS NULL
    OR source_marks <> NEW."marks" OR source_maximum <> NEW."maximumMarks"
    OR source_code <> NEW."learningAreaCode" OR source_name <> NEW."learningAreaName"
    OR source_label <> NEW."displayLabel" THEN
    RAISE EXCEPTION 'Result learning-area snapshots must match submitted marks and assessment snapshots' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentResultLearningArea_validate"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentResultLearningArea"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_assessment_result_learning_area();

CREATE OR REPLACE FUNCTION sentinel_validate_assessment_transition() RETURNS trigger AS $function$
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
    OR (OLD."status" = 'CLOSED' AND (
      NEW."status" = 'RELEASED'
      OR (NEW."status" = 'OPEN' AND EXISTS (
        SELECT 1 FROM "AssessmentMark" m
        WHERE m."assessmentId" = NEW."id"
          AND m."status" = 'RETURNED'
          AND length(trim(coalesce(m."returnedReason", ''))) >= 10
      ))
    ))
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

  IF NEW."status" = 'RELEASED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "AssessmentResultPublication" p
      WHERE p."assessmentId" = NEW."id" AND p."status" = 'PUBLISHED'
    ) THEN
      RAISE EXCEPTION 'Assessment results must be published before release' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
