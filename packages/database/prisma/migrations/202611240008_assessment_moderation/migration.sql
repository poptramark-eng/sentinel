-- Reopening a closed assessment is reserved for the audited governance correction workflow.
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

  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Controlled class-level moderation return. Submitted marks remain immutable
-- except for a governance-authorized transition from CLOSED to RETURNED.
CREATE OR REPLACE FUNCTION sentinel_validate_assessment_mark() RETURNS trigger AS $function$
DECLARE
  target_status "AssessmentStatus";
  target_candidate_status "AssessmentCandidateStatus";
  target_max_marks DECIMAL(8,2);
  target_decimal_places INTEGER;
BEGIN
  SELECT a."status", c."status", la."maxMarks", la."decimalPlaces"
    INTO target_status, target_candidate_status, target_max_marks, target_decimal_places
  FROM "Assessment" a
  JOIN "AssessmentCandidate" c ON c."assessmentId" = a."id" AND c."id" = NEW."candidateId"
  JOIN "AssessmentLearningArea" la ON la."assessmentId" = a."id"
  WHERE a."id" = NEW."assessmentId" AND la."id" = NEW."assessmentLearningAreaId";

  IF target_status IS NULL THEN
    RAISE EXCEPTION 'Assessment mark references an invalid assessment learning area' USING ERRCODE = '23503';
  END IF;
  IF target_candidate_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Marks cannot be entered for a withdrawn assessment candidate' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF target_status <> 'DRAFT' OR NEW."marks" IS NOT NULL OR NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Mark rows must be initialized empty while the assessment is in draft' USING ERRCODE = '55000';
    END IF;
  ELSE
    IF OLD."status" = 'SUBMITTED' THEN
      IF target_status <> 'CLOSED'
        OR NEW."status" <> 'RETURNED'
        OR length(trim(coalesce(NEW."returnedReason", ''))) < 10
        OR NEW."marks" IS DISTINCT FROM OLD."marks"
        OR NEW."submittedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Submitted marks are immutable except for a reasoned governance return on a closed assessment' USING ERRCODE = '55000';
      END IF;
    ELSIF target_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Marks may be changed only while the assessment is open' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW."marks" IS NOT NULL THEN
    IF NEW."marks" < 0 OR NEW."marks" > target_max_marks THEN
      RAISE EXCEPTION 'Marks must be between zero and the learning area maximum' USING ERRCODE = '23514';
    END IF;
    IF round(NEW."marks", target_decimal_places) <> NEW."marks" THEN
      RAISE EXCEPTION 'Marks exceed the configured decimal precision' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."status" = 'SUBMITTED' AND (NEW."marks" IS NULL OR NEW."submittedAt" IS NULL) THEN
    RAISE EXCEPTION 'Submitted marks require a value and submission timestamp' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'RETURNED'
    AND (NEW."marks" IS NULL OR length(trim(coalesce(NEW."returnedReason", ''))) < 10) THEN
    RAISE EXCEPTION 'Returned marks require a value and a substantive correction reason' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
