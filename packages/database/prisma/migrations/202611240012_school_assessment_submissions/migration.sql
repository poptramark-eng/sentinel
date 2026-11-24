CREATE TYPE "AssessmentSchoolSubmissionStatus" AS ENUM ('SUBMITTED', 'RETURNED');

CREATE TABLE "AssessmentSchoolSubmission" (
  "id" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "AssessmentSchoolSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "candidateCount" INTEGER NOT NULL,
  "markCount" INTEGER NOT NULL,
  "submittedByAccountId" UUID NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedByAccountId" UUID,
  "returnedAt" TIMESTAMP(3),
  "returnedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentSchoolSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentSchoolSubmission_candidateCount_check" CHECK ("candidateCount" > 0),
  CONSTRAINT "AssessmentSchoolSubmission_markCount_check" CHECK ("markCount" > 0),
  CONSTRAINT "AssessmentSchoolSubmission_return_state_check" CHECK (
    ("status" = 'SUBMITTED' AND "returnedByAccountId" IS NULL AND "returnedAt" IS NULL AND "returnedReason" IS NULL)
    OR
    ("status" = 'RETURNED' AND "returnedByAccountId" IS NOT NULL AND "returnedAt" IS NOT NULL AND length(trim(coalesce("returnedReason", ''))) >= 10)
  )
);

CREATE TABLE "AssessmentSchoolSubmissionVersion" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "submittedByAccountId" UUID NOT NULL,
  "candidateCount" INTEGER NOT NULL,
  "markCount" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentSchoolSubmissionVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentSchoolSubmissionVersion_counts_check" CHECK ("candidateCount" > 0 AND "markCount" > 0),
  CONSTRAINT "AssessmentSchoolSubmissionVersion_snapshot_check" CHECK (CASE WHEN jsonb_typeof("snapshot") = 'array' THEN jsonb_array_length("snapshot") = "markCount" ELSE FALSE END)
);

CREATE UNIQUE INDEX "AssessmentSchoolSubmission_id_assessmentId_key" ON "AssessmentSchoolSubmission"("id", "assessmentId");
CREATE UNIQUE INDEX "AssessmentSchoolSubmission_assessmentId_registrationId_key" ON "AssessmentSchoolSubmission"("assessmentId", "registrationId");
CREATE INDEX "AssessmentSchoolSubmission_councilId_status_submittedAt_idx" ON "AssessmentSchoolSubmission"("councilId", "status", "submittedAt");
CREATE INDEX "AssessmentSchoolSubmission_registrationId_status_submittedAt_idx" ON "AssessmentSchoolSubmission"("registrationId", "status", "submittedAt");
CREATE UNIQUE INDEX "AssessmentSchoolSubmissionVersion_submissionId_version_key" ON "AssessmentSchoolSubmissionVersion"("submissionId", "version");
CREATE INDEX "AssessmentSchoolSubmissionVersion_submittedByAccountId_createdAt_idx" ON "AssessmentSchoolSubmissionVersion"("submittedByAccountId", "createdAt");

ALTER TABLE "AssessmentSchoolSubmission" ADD CONSTRAINT "AssessmentSchoolSubmission_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchoolSubmission" ADD CONSTRAINT "AssessmentSchoolSubmission_registrationId_councilId_fkey"
  FOREIGN KEY ("registrationId", "councilId") REFERENCES "CouncilSchoolRegistration"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchoolSubmission" ADD CONSTRAINT "AssessmentSchoolSubmission_submittedByAccountId_fkey"
  FOREIGN KEY ("submittedByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchoolSubmission" ADD CONSTRAINT "AssessmentSchoolSubmission_returnedByAccountId_fkey"
  FOREIGN KEY ("returnedByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchoolSubmissionVersion" ADD CONSTRAINT "AssessmentSchoolSubmissionVersion_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "AssessmentSchoolSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchoolSubmissionVersion" ADD CONSTRAINT "AssessmentSchoolSubmissionVersion_submittedByAccountId_fkey"
  FOREIGN KEY ("submittedByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION sentinel_validate_school_assessment_submission() RETURNS trigger AS $function$
DECLARE
  target_status "AssessmentStatus";
BEGIN
  SELECT "status" INTO target_status FROM "Assessment" WHERE "id" = NEW."assessmentId" AND "councilId" = NEW."councilId";
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
      IF target_status NOT IN ('CLOSED', 'OPEN') OR length(trim(coalesce(NEW."returnedReason", ''))) < 10
        OR (target_status = 'OPEN' AND NOT EXISTS (
          SELECT 1 FROM "AssessmentMark" m
          JOIN "AssessmentCandidate" c ON c."id" = m."candidateId" AND c."assessmentId" = m."assessmentId"
          WHERE m."assessmentId" = NEW."assessmentId" AND m."status" = 'RETURNED'
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

CREATE TRIGGER "AssessmentSchoolSubmission_validate"
BEFORE INSERT OR UPDATE ON "AssessmentSchoolSubmission"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_school_assessment_submission();

CREATE FUNCTION sentinel_require_school_submission_version() RETURNS trigger AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AssessmentSchoolSubmissionVersion" v
    WHERE v."submissionId" = NEW."id" AND v."version" = NEW."version"
      AND v."candidateCount" = NEW."candidateCount" AND v."markCount" = NEW."markCount"
  ) THEN
    RAISE EXCEPTION 'Every current school submission state must reference an immutable version snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "AssessmentSchoolSubmission_requires_version"
AFTER INSERT OR UPDATE ON "AssessmentSchoolSubmission"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sentinel_require_school_submission_version();

CREATE FUNCTION sentinel_validate_school_submission_version() RETURNS trigger AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AssessmentSchoolSubmission" s
    WHERE s."id" = NEW."submissionId" AND s."version" = NEW."version"
      AND s."status" = 'SUBMITTED' AND s."submittedByAccountId" = NEW."submittedByAccountId"
      AND s."candidateCount" = NEW."candidateCount" AND s."markCount" = NEW."markCount"
  ) THEN
    RAISE EXCEPTION 'Submission version must match the current submitted school record' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentSchoolSubmissionVersion_validate"
BEFORE INSERT ON "AssessmentSchoolSubmissionVersion"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_school_submission_version();

CREATE FUNCTION sentinel_immutable_school_submission() RETURNS trigger AS $function$
BEGIN
  RAISE EXCEPTION 'School submission records cannot be deleted; retain their correction and version history' USING ERRCODE = '55000';
END;
$function$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentSchoolSubmission_no_delete"
BEFORE DELETE ON "AssessmentSchoolSubmission"
FOR EACH ROW EXECUTE FUNCTION sentinel_immutable_school_submission();

CREATE FUNCTION sentinel_immutable_school_submission_version() RETURNS trigger AS $function$
BEGIN
  RAISE EXCEPTION 'School submission versions are immutable and append-only' USING ERRCODE = '55000';
END;
$function$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentSchoolSubmissionVersion_immutable"
BEFORE UPDATE OR DELETE ON "AssessmentSchoolSubmissionVersion"
FOR EACH ROW EXECUTE FUNCTION sentinel_immutable_school_submission_version();


-- Once the first governance return reopens an assessment, additional classes/learning areas
-- can be returned in the same correction round without repeatedly closing the whole assessment.
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
      IF target_status NOT IN ('CLOSED', 'OPEN')
        OR (target_status = 'OPEN' AND NOT EXISTS (
          SELECT 1 FROM "AssessmentMark" m
          JOIN "AssessmentCandidate" c ON c."id" = m."candidateId" AND c."assessmentId" = m."assessmentId"
          WHERE m."assessmentId" = NEW."assessmentId" AND m."status" = 'RETURNED'
        ))
        OR NEW."status" <> 'RETURNED'
        OR length(trim(coalesce(NEW."returnedReason", ''))) < 10
        OR NEW."marks" IS DISTINCT FROM OLD."marks"
        OR NEW."submittedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Submitted marks are immutable except for a reasoned governance return during a closed assessment or active correction window' USING ERRCODE = '55000';
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
