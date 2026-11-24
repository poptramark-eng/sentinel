CREATE TYPE "LearnerEnrollmentStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED');
CREATE TYPE "AssessmentCandidateStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');
CREATE TYPE "AssessmentMarkStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED');
CREATE TYPE "AssessmentMarkRevisionAction" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'RETURNED');

CREATE TABLE "Learner" (
  "id" UUID NOT NULL,
  "learnerNumber" TEXT NOT NULL,
  "givenName" TEXT NOT NULL,
  "familyName" TEXT NOT NULL,
  "otherNames" TEXT,
  "displayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Learner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolLearnerEnrollment" (
  "id" UUID NOT NULL,
  "learnerId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "schoolClassId" UUID NOT NULL,
  "admissionNumber" TEXT,
  "status" "LearnerEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolLearnerEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentCandidate" (
  "id" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "councilId" UUID NOT NULL,
  "curriculumVersionId" UUID NOT NULL,
  "learnerId" UUID NOT NULL,
  "enrollmentId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "schoolClassId" UUID NOT NULL,
  "learnerNumberSnapshot" TEXT NOT NULL,
  "learnerNameSnapshot" TEXT NOT NULL,
  "classGradeSnapshot" "SchoolGrade" NOT NULL,
  "classStreamSnapshot" TEXT NOT NULL,
  "status" "AssessmentCandidateStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentMark" (
  "id" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "assessmentLearningAreaId" UUID NOT NULL,
  "marks" DECIMAL(10,4),
  "status" "AssessmentMarkStatus" NOT NULL DEFAULT 'DRAFT',
  "enteredByAccountId" UUID,
  "submittedAt" TIMESTAMP(3),
  "returnedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentMark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentMarkRevision" (
  "id" UUID NOT NULL,
  "markId" UUID NOT NULL,
  "actorAccountId" UUID NOT NULL,
  "action" "AssessmentMarkRevisionAction" NOT NULL,
  "previousMarks" DECIMAL(10,4),
  "newMarks" DECIMAL(10,4),
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentMarkRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Learner_learnerNumber_key" ON "Learner"("learnerNumber");
CREATE INDEX "Learner_familyName_givenName_idx" ON "Learner"("familyName", "givenName");
CREATE UNIQUE INDEX "SchoolLearnerEnrollment_id_learnerId_registrationId_councilId_key" ON "SchoolLearnerEnrollment"("id", "learnerId", "registrationId", "councilId");
CREATE INDEX "SchoolLearnerEnrollment_registrationId_schoolClassId_status_idx" ON "SchoolLearnerEnrollment"("registrationId", "schoolClassId", "status");
CREATE INDEX "SchoolLearnerEnrollment_learnerId_status_enrolledAt_idx" ON "SchoolLearnerEnrollment"("learnerId", "status", "enrolledAt");
CREATE UNIQUE INDEX "SchoolLearnerEnrollment_registrationId_admissionNumber_key" ON "SchoolLearnerEnrollment"("registrationId", "admissionNumber");
CREATE UNIQUE INDEX "AssessmentCandidate_id_assessmentId_key" ON "AssessmentCandidate"("id", "assessmentId");
CREATE UNIQUE INDEX "AssessmentCandidate_assessmentId_learnerId_key" ON "AssessmentCandidate"("assessmentId", "learnerId");
CREATE INDEX "AssessmentCandidate_assessmentId_status_learnerNameSnapshot_idx" ON "AssessmentCandidate"("assessmentId", "status", "learnerNameSnapshot");
CREATE INDEX "AssessmentCandidate_registrationId_schoolClassId_status_idx" ON "AssessmentCandidate"("registrationId", "schoolClassId", "status");
CREATE UNIQUE INDEX "AssessmentMark_candidateId_assessmentLearningAreaId_key" ON "AssessmentMark"("candidateId", "assessmentLearningAreaId");
CREATE INDEX "AssessmentMark_assessmentId_status_idx" ON "AssessmentMark"("assessmentId", "status");
CREATE INDEX "AssessmentMark_enteredByAccountId_updatedAt_idx" ON "AssessmentMark"("enteredByAccountId", "updatedAt");
CREATE INDEX "AssessmentMarkRevision_markId_createdAt_idx" ON "AssessmentMarkRevision"("markId", "createdAt");
CREATE INDEX "AssessmentMarkRevision_actorAccountId_createdAt_idx" ON "AssessmentMarkRevision"("actorAccountId", "createdAt");

CREATE UNIQUE INDEX "AssessmentLearningArea_id_assessmentId_key" ON "AssessmentLearningArea"("id", "assessmentId");

ALTER TABLE "SchoolLearnerEnrollment" ADD CONSTRAINT "SchoolLearnerEnrollment_learnerId_fkey"
  FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolLearnerEnrollment" ADD CONSTRAINT "SchoolLearnerEnrollment_registrationId_councilId_fkey"
  FOREIGN KEY ("registrationId", "councilId") REFERENCES "CouncilSchoolRegistration"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolLearnerEnrollment" ADD CONSTRAINT "SchoolLearnerEnrollment_schoolClassId_registrationId_councilId_fkey"
  FOREIGN KEY ("schoolClassId", "registrationId", "councilId") REFERENCES "SchoolClass"("id", "registrationId", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentCandidate" ADD CONSTRAINT "AssessmentCandidate_assessmentId_councilId_curriculumVersionId_fkey"
  FOREIGN KEY ("assessmentId", "councilId", "curriculumVersionId") REFERENCES "Assessment"("id", "councilId", "curriculumVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentCandidate" ADD CONSTRAINT "AssessmentCandidate_learnerId_fkey"
  FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentCandidate" ADD CONSTRAINT "AssessmentCandidate_enrollmentId_learnerId_registrationId_councilId_fkey"
  FOREIGN KEY ("enrollmentId", "learnerId", "registrationId", "councilId") REFERENCES "SchoolLearnerEnrollment"("id", "learnerId", "registrationId", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentCandidate" ADD CONSTRAINT "AssessmentCandidate_registrationId_councilId_fkey"
  FOREIGN KEY ("registrationId", "councilId") REFERENCES "CouncilSchoolRegistration"("id", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentCandidate" ADD CONSTRAINT "AssessmentCandidate_schoolClassId_registrationId_councilId_fkey"
  FOREIGN KEY ("schoolClassId", "registrationId", "councilId") REFERENCES "SchoolClass"("id", "registrationId", "councilId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentMark" ADD CONSTRAINT "AssessmentMark_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentMark" ADD CONSTRAINT "AssessmentMark_candidateId_assessmentId_fkey"
  FOREIGN KEY ("candidateId", "assessmentId") REFERENCES "AssessmentCandidate"("id", "assessmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentMark" ADD CONSTRAINT "AssessmentMark_assessmentLearningAreaId_assessmentId_fkey"
  FOREIGN KEY ("assessmentLearningAreaId", "assessmentId") REFERENCES "AssessmentLearningArea"("id", "assessmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentMark" ADD CONSTRAINT "AssessmentMark_enteredByAccountId_fkey"
  FOREIGN KEY ("enteredByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentMarkRevision" ADD CONSTRAINT "AssessmentMarkRevision_markId_fkey"
  FOREIGN KEY ("markId") REFERENCES "AssessmentMark"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentMarkRevision" ADD CONSTRAINT "AssessmentMarkRevision_actorAccountId_fkey"
  FOREIGN KEY ("actorAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SchoolLearnerEnrollment" ADD CONSTRAINT "SchoolLearnerEnrollment_dates_check"
  CHECK (("status" = 'ACTIVE' AND "endedAt" IS NULL) OR ("status" <> 'ACTIVE' AND "endedAt" IS NOT NULL));
ALTER TABLE "SchoolLearnerEnrollment" ADD CONSTRAINT "SchoolLearnerEnrollment_admissionNumber_normalized_check"
  CHECK ("admissionNumber" IS NULL OR ("admissionNumber" = upper(btrim("admissionNumber")) AND length("admissionNumber") BETWEEN 1 AND 40));

-- A learner may have only one active class enrollment within a school registration.
CREATE UNIQUE INDEX "SchoolLearnerEnrollment_one_active_learner"
ON "SchoolLearnerEnrollment" ("learnerId")
WHERE "status" = 'ACTIVE' AND "endedAt" IS NULL;

CREATE FUNCTION sentinel_lock_assessment_candidates() RETURNS trigger AS $function$
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

  IF TG_OP = 'UPDATE'
    AND OLD."status" = 'ACTIVE'
    AND NEW."status" = 'WITHDRAWN'
    AND target_status IN ('SCHEDULED', 'OPEN', 'CLOSED')
    AND (to_jsonb(NEW) - 'status') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RETURN NEW;
  END IF;

  IF target_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Assessment candidate snapshots are immutable after scheduling; only an active candidate may be withdrawn' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."assessmentId" <> OLD."assessmentId" THEN
    SELECT "status" INTO target_status FROM "Assessment" WHERE "id" = NEW."assessmentId";
    IF target_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Assessment candidates cannot be moved into a scheduled assessment' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentCandidate_lock_roster"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentCandidate"
FOR EACH ROW EXECUTE FUNCTION sentinel_lock_assessment_candidates();

CREATE FUNCTION sentinel_require_assessment_roster() RETURNS trigger AS $function$
BEGIN
  IF NEW."status" = 'SCHEDULED' AND OLD."status" = 'DRAFT'
    AND NOT EXISTS (SELECT 1 FROM "AssessmentCandidate" c WHERE c."assessmentId" = NEW."id" AND c."status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'At least one active learner must be assigned before scheduling' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "Assessment_require_roster"
BEFORE UPDATE OF "status" ON "Assessment"
FOR EACH ROW EXECUTE FUNCTION sentinel_require_assessment_roster();

CREATE FUNCTION sentinel_validate_assessment_mark() RETURNS trigger AS $function$
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
    IF NEW."marks" IS NOT NULL OR NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Mark rows must be initialized empty in draft state' USING ERRCODE = '55000';
    END IF;
  ELSE
    IF target_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Marks may be changed only while the assessment is open' USING ERRCODE = '55000';
    END IF;
    IF OLD."status" = 'SUBMITTED' THEN
      RAISE EXCEPTION 'Submitted marks are locked; use the formal correction workflow' USING ERRCODE = '55000';
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
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentMark_validate"
BEFORE INSERT OR UPDATE ON "AssessmentMark"
FOR EACH ROW EXECUTE FUNCTION sentinel_validate_assessment_mark();

CREATE FUNCTION sentinel_immutable_assessment_mark_revision() RETURNS trigger AS $function$
BEGIN
  RAISE EXCEPTION 'Assessment mark revision history is append-only' USING ERRCODE = '55000';
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentMarkRevision_immutable"
BEFORE UPDATE OR DELETE ON "AssessmentMarkRevision"
FOR EACH ROW EXECUTE FUNCTION sentinel_immutable_assessment_mark_revision();
