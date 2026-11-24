-- Permit one narrowly-scoped, audited publication lifecycle transition while keeping
-- every result row and every historical publication snapshot immutable.
CREATE OR REPLACE FUNCTION sentinel_validate_assessment_result_publication() RETURNS trigger AS $function$
DECLARE
  assessment_status "AssessmentStatus";
  assessment_council_id UUID;
  active_candidates INTEGER;
  distinct_schools INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Assessment result publications cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT "status", "councilId" INTO assessment_status, assessment_council_id
    FROM "Assessment" WHERE "id" = OLD."assessmentId";
    IF OLD."status" = 'PUBLISHED' AND NEW."status" = 'SUPERSEDED'
      AND assessment_status = 'RELEASED'
      AND assessment_council_id = OLD."councilId"
      AND (to_jsonb(NEW) - 'status') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A result publication may only transition from PUBLISHED to SUPERSEDED for a released assessment; its snapshot is immutable' USING ERRCODE = '55000';
  END IF;

  SELECT "status", "councilId" INTO assessment_status, assessment_council_id
  FROM "Assessment" WHERE "id" = NEW."assessmentId";
  IF assessment_status IS DISTINCT FROM 'CLOSED' OR assessment_council_id IS DISTINCT FROM NEW."councilId" OR NEW."status" <> 'PUBLISHED' THEN
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

-- A released assessment can be reopened only after its current publication has
-- been superseded and governance has returned at least one submitted mark.
CREATE OR REPLACE FUNCTION sentinel_validate_assessment_transition() RETURNS trigger AS $function$
DECLARE
  publication_id UUID;
  publication_candidate_count INTEGER;
  actual_result_count INTEGER;
  learning_area_count INTEGER;
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
        WHERE m."assessmentId" = NEW."id" AND m."status" = 'RETURNED'
          AND length(trim(coalesce(m."returnedReason", ''))) >= 10
      ))
    ))
    OR (OLD."status" = 'RELEASED' AND NEW."status" = 'OPEN'
      AND NOT EXISTS (
        SELECT 1 FROM "AssessmentResultPublication" p
        WHERE p."assessmentId" = NEW."id" AND p."status" = 'PUBLISHED'
      )
      AND EXISTS (
        SELECT 1 FROM "AssessmentMark" m
        WHERE m."assessmentId" = NEW."id" AND m."status" = 'RETURNED'
          AND length(trim(coalesce(m."returnedReason", ''))) >= 10
      )
    )
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
    SELECT p."id", p."candidateCount" INTO publication_id, publication_candidate_count
    FROM "AssessmentResultPublication" p
    WHERE p."assessmentId" = NEW."id" AND p."status" = 'PUBLISHED'
    ORDER BY p."version" DESC LIMIT 1;
    IF publication_id IS NULL THEN
      RAISE EXCEPTION 'Assessment results must be published before release' USING ERRCODE = '55000';
    END IF;
    SELECT count(*) INTO actual_result_count
    FROM "AssessmentResult" r WHERE r."publicationId" = publication_id;
    SELECT count(*) INTO learning_area_count
    FROM "AssessmentLearningArea" a WHERE a."assessmentId" = NEW."id";
    IF actual_result_count <> publication_candidate_count
      OR EXISTS (
        SELECT 1 FROM "AssessmentCandidate" c
        WHERE c."assessmentId" = NEW."id" AND c."status" = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM "AssessmentResult" r
            WHERE r."publicationId" = publication_id AND r."candidateId" = c."id"
          )
      )
      OR learning_area_count = 0
      OR EXISTS (
        SELECT 1 FROM "AssessmentResult" r
        WHERE r."publicationId" = publication_id
          AND (SELECT count(*) FROM "AssessmentResultLearningArea" l WHERE l."resultId" = r."id") <> learning_area_count
      ) THEN
      RAISE EXCEPTION 'Result publication is incomplete for the active candidate and learning-area roster' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Submitted mark rows can be returned while RELEASED only after the active
-- publication has been superseded in the same serializable transaction.
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
      IF target_status NOT IN ('CLOSED', 'OPEN', 'RELEASED')
        OR (target_status = 'OPEN' AND NOT EXISTS (
          SELECT 1 FROM "AssessmentMark" m
          WHERE m."assessmentId" = NEW."assessmentId" AND m."status" = 'RETURNED'
        ))
        OR (target_status = 'RELEASED' AND EXISTS (
          SELECT 1 FROM "AssessmentResultPublication" p
          WHERE p."assessmentId" = NEW."assessmentId" AND p."status" = 'PUBLISHED'
        ))
        OR NEW."status" <> 'RETURNED'
        OR length(trim(coalesce(NEW."returnedReason", ''))) < 10
        OR NEW."marks" IS DISTINCT FROM OLD."marks"
        OR NEW."submittedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Submitted marks are immutable except for a reasoned governance return after publication has been superseded or during a correction window' USING ERRCODE = '55000';
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

-- Return the school's final submission only when one of its own marks has
-- been returned and the published result version has already been superseded.
CREATE OR REPLACE FUNCTION sentinel_validate_school_assessment_submission() RETURNS trigger AS $function$
DECLARE
  target_status "AssessmentStatus";
BEGIN
  SELECT "status" INTO target_status FROM "Assessment"
  WHERE "id" = NEW."assessmentId" AND "councilId" = NEW."councilId";
  IF target_status IS NULL THEN
    RAISE EXCEPTION 'School submission assessment scope is invalid' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF target_status <> 'OPEN' OR NEW."status" <> 'SUBMITTED' OR NEW."version" <> 1
      OR NEW."returnedByAccountId" IS NOT NULL OR NEW."returnedAt" IS NOT NULL OR NEW."returnedReason" IS NOT NULL THEN
      RAISE EXCEPTION 'Initial school submission requires an open assessment and version one' USING ERRCODE = '55000';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - 'status' - 'version' - 'candidateCount' - 'markCount' - 'submittedByAccountId' - 'submittedAt' - 'returnedByAccountId' - 'returnedAt' - 'returnedReason' - 'updatedAt')
      IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'version' - 'candidateCount' - 'markCount' - 'submittedByAccountId' - 'submittedAt' - 'returnedByAccountId' - 'returnedAt' - 'returnedReason' - 'updatedAt') THEN
      RAISE EXCEPTION 'School submission scope and counts are immutable' USING ERRCODE = '55000';
    END IF;
    IF OLD."status" = 'SUBMITTED' AND NEW."status" = 'RETURNED' THEN
      IF target_status NOT IN ('CLOSED', 'OPEN', 'RELEASED')
        OR length(trim(coalesce(NEW."returnedReason", ''))) < 10
        OR (target_status = 'OPEN' AND NOT EXISTS (
          SELECT 1 FROM "AssessmentMark" m
          JOIN "AssessmentCandidate" c ON c."id" = m."candidateId" AND c."assessmentId" = m."assessmentId"
          WHERE m."assessmentId" = NEW."assessmentId" AND c."registrationId" = NEW."registrationId" AND m."status" = 'RETURNED'
        ))
        OR (target_status = 'RELEASED' AND (
          EXISTS (SELECT 1 FROM "AssessmentResultPublication" p WHERE p."assessmentId" = NEW."assessmentId" AND p."status" = 'PUBLISHED')
          OR NOT EXISTS (
            SELECT 1 FROM "AssessmentMark" m
            JOIN "AssessmentCandidate" c ON c."id" = m."candidateId" AND c."assessmentId" = m."assessmentId"
            WHERE m."assessmentId" = NEW."assessmentId" AND c."registrationId" = NEW."registrationId" AND m."status" = 'RETURNED'
          )
        ))
        OR NEW."returnedByAccountId" IS NULL OR NEW."returnedAt" IS NULL
        OR NEW."version" <> OLD."version" OR NEW."submittedByAccountId" <> OLD."submittedByAccountId"
        OR NEW."submittedAt" <> OLD."submittedAt"
        OR NEW."candidateCount" <> OLD."candidateCount" OR NEW."markCount" <> OLD."markCount" THEN
        RAISE EXCEPTION 'Only a reasoned governance return may return a submitted school submission' USING ERRCODE = '55000';
      END IF;
    ELSIF OLD."status" = 'RETURNED' AND NEW."status" = 'SUBMITTED' THEN
      IF target_status <> 'OPEN' OR NEW."version" <> OLD."version" + 1
        OR NEW."submittedAt" <= OLD."returnedAt"
        OR NEW."returnedByAccountId" IS NOT NULL OR NEW."returnedAt" IS NOT NULL OR NEW."returnedReason" IS NOT NULL THEN
        RAISE EXCEPTION 'A returned school submission may be resubmitted only as the next version on an open assessment' USING ERRCODE = '55000';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid school submission state transition' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
