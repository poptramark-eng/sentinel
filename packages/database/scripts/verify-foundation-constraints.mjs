import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const id = () => randomUUID();
const ids = {
  councilA: id(), councilB: id(), person: id(), personB: id(), school: id(),
  accountA: id(), accountB: id(), identifierA: id(), identifierB: id(), verificationA: id(),
  regionA: id(), regionB: id(), countyA: id(), countyB: id(),
  subcountyA: id(), subcountyB: id(), zoneA: id(), zoneB: id(),
  clusterA: id(), clusterB: id(),
  registrationA: id(), registrationDuplicate: id(), registrationHistory: id(),
  membershipA: id(), membershipB: id(), membershipC: id(), classA: id(), classB: id(), classDuplicate: id(), assignmentA: id(), assignmentB: id(),
  learnerA: id(), enrollmentA: id(), candidateA: id(), markA: id(),
};

async function expectSqlStateFailure(sqlState, operation) {
  await client.query("SAVEPOINT expected_sqlstate_failure");
  try {
    await operation();
    assert.fail(`Expected SQLSTATE ${sqlState}.`);
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") throw error;
    assert.equal(error?.code, sqlState, `Unexpected database failure: ${error?.message}`);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_sqlstate_failure");
    await client.query("RELEASE SAVEPOINT expected_sqlstate_failure");
  }
}

async function expectConstraintFailure(constraint, operation) {
  await client.query("SAVEPOINT expected_constraint_failure");
  try {
    await operation();
    assert.fail(`Expected database constraint ${constraint} to reject the operation.`);
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") throw error;
    assert.equal(error?.constraint, constraint, `Unexpected database failure: ${error?.message}`);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_constraint_failure");
    await client.query("RELEASE SAVEPOINT expected_constraint_failure");
  }
}

try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "Council" ("id", "name", "slug", "updatedAt") VALUES
      ($1, 'Constraint Test Council A', $3, NOW()),
      ($2, 'Constraint Test Council B', $4, NOW())`,
    [ids.councilA, ids.councilB, `test-${ids.councilA}`, `test-${ids.councilB}`],
  );
  await client.query(
    `INSERT INTO "Person" ("id", "givenName", "familyName", "updatedAt") VALUES ($1, 'Test', 'Registrant', NOW())`,
    [ids.person],
  );
  await client.query(
    `INSERT INTO "Person" ("id", "givenName", "familyName", "updatedAt") VALUES ($1, 'Second', 'Registrant', NOW())`,
    [ids.personB],
  );
  await client.query(
    `INSERT INTO "School" ("id", "name", "updatedAt") VALUES ($1, 'Synthetic Constraint School', NOW())`,
    [ids.school],
  );
  await client.query(
    `INSERT INTO "Region" ("id", "councilId", "name") VALUES ($1, $2, 'Region A'), ($3, $4, 'Region B')`,
    [ids.regionA, ids.councilA, ids.regionB, ids.councilB],
  );
  await client.query(
    `INSERT INTO "County" ("id", "councilId", "regionId", "name") VALUES ($1, $2, $3, 'County A')`,
    [ids.countyA, ids.councilA, ids.regionA],
  );
  await expectConstraintFailure("County_regionId_councilId_fkey", () =>
    client.query(
      `INSERT INTO "County" ("id", "councilId", "regionId", "name") VALUES ($1, $2, $3, 'Cross Tenant County')`,
      [ids.countyB, ids.councilB, ids.regionA],
    ),
  );
  await client.query(
    `INSERT INTO "Subcounty" ("id", "councilId", "countyId", "name") VALUES ($1, $2, $3, 'Subcounty A')`,
    [ids.subcountyA, ids.councilA, ids.countyA],
  );
  await client.query(
    `INSERT INTO "Zone" ("id", "councilId", "subcountyId", "name") VALUES ($1, $2, $3, 'Zone A')`,
    [ids.zoneA, ids.councilA, ids.subcountyA],
  );
  await client.query(
    `INSERT INTO "County" ("id", "councilId", "regionId", "name") VALUES ($1, $2, $3, 'County B')`,
    [ids.countyB, ids.councilB, ids.regionB],
  );
  await client.query(
    `INSERT INTO "Subcounty" ("id", "councilId", "countyId", "name") VALUES ($1, $2, $3, 'Subcounty B')`,
    [ids.subcountyB, ids.councilB, ids.countyB],
  );
  await client.query(
    `INSERT INTO "Zone" ("id", "councilId", "subcountyId", "name") VALUES ($1, $2, $3, 'Zone B')`,
    [ids.zoneB, ids.councilB, ids.subcountyB],
  );
  await client.query(
    `INSERT INTO "Cluster" ("id", "councilId", "zoneId", "name") VALUES ($1, $2, $3, 'Cluster A'), ($4, $5, $6, 'Cluster B')`,
    [ids.clusterA, ids.councilA, ids.zoneA, ids.clusterB, ids.councilB, ids.zoneB],
  );

  await client.query(
    `INSERT INTO "CouncilSchoolRegistration"
      ("id", "councilId", "schoolId", "clusterId", "submittedSchoolName", "initialRegistrantPersonId", "status", "updatedAt")
      VALUES ($1, $2, $3, $4, 'Synthetic Constraint School', $5, 'PENDING_REVIEW', NOW())`,
    [ids.registrationA, ids.councilA, ids.school, ids.clusterA, ids.person],
  );
  await expectConstraintFailure("CouncilSchoolRegistration_one_active", () =>
    client.query(
      `INSERT INTO "CouncilSchoolRegistration"
        ("id", "councilId", "schoolId", "clusterId", "submittedSchoolName", "initialRegistrantPersonId", "status", "updatedAt")
        VALUES ($1, $2, $3, $4, 'Duplicate Active Episode', $5, 'PENDING_REVIEW', NOW())`,
      [ids.registrationDuplicate, ids.councilA, ids.school, ids.clusterA, ids.person],
    ),
  );
  await client.query(
    `INSERT INTO "CouncilSchoolRegistration"
      ("id", "councilId", "schoolId", "clusterId", "submittedSchoolName", "initialRegistrantPersonId", "status", "updatedAt")
      VALUES ($1, $2, $3, $4, 'Historical Rejected Episode', $5, 'REJECTED', NOW())`,
    [ids.registrationHistory, ids.councilA, ids.school, ids.clusterA, ids.person],
  );
  await expectConstraintFailure("CouncilSchoolRegistration_clusterId_councilId_fkey", () =>
    client.query(
      `INSERT INTO "CouncilSchoolRegistration"
        ("id", "councilId", "schoolId", "clusterId", "submittedSchoolName", "initialRegistrantPersonId", "status", "updatedAt")
        VALUES ($1, $2, $3, $4, 'Cross Tenant Registration', $5, 'PENDING_REVIEW', NOW())`,
      [id(), ids.councilB, ids.school, ids.clusterA, ids.person],
    ),
  );
  await expectConstraintFailure("SchoolMembership_registrationId_councilId_fkey", () =>
    client.query(
      `INSERT INTO "SchoolMembership" ("id", "registrationId", "councilId", "personId", "role", "status", "updatedAt")
       VALUES ($1, $2, $3, $4, 'SCHOOL_ADMINISTRATOR', 'PENDING', NOW())`,
      [id(), ids.registrationA, ids.councilB, ids.person],
    ),
  );

  await client.query(
    `INSERT INTO "UserAccount" ("id", "personId", "status", "updatedAt") VALUES
      ($1, $2, 'PENDING_VERIFICATION', NOW()),
      ($3, $4, 'PENDING_VERIFICATION', NOW())`,
    [ids.accountA, ids.person, ids.accountB, ids.personB],
  );
  await client.query(
    `INSERT INTO "LoginIdentifier" ("id", "accountId", "type", "normalizedValue") VALUES
      ($1, $2, 'EMAIL', 'constraint-a@example.test'),
      ($3, $4, 'EMAIL', 'constraint-b@example.test')`,
    [ids.identifierA, ids.accountA, ids.identifierB, ids.accountB],
  );
  await client.query(
    `INSERT INTO "EmailVerificationToken"
      ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
      VALUES ($1, $2, $3, 'synthetic-token-hash-a', NOW() + INTERVAL '1 day')`,
    [ids.verificationA, ids.accountA, ids.identifierA],
  );
  await expectConstraintFailure("EmailVerificationToken_one_unconsumed_per_identifier", () =>
    client.query(
      `INSERT INTO "EmailVerificationToken"
        ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
        VALUES ($1, $2, $3, 'synthetic-second-active-token', NOW() + INTERVAL '1 day')`,
      [id(), ids.accountA, ids.identifierA],
    ),
  );
  await expectConstraintFailure("EmailVerificationToken_loginIdentifierId_accountId_fkey", () =>
    client.query(
      `INSERT INTO "EmailVerificationToken"
        ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
        VALUES ($1, $2, $3, 'synthetic-token-hash-cross-account', NOW() + INTERVAL '1 day')`,
      [id(), ids.accountA, ids.identifierB],
    ),
  );
  await expectConstraintFailure("EmailVerificationToken_tokenHash_key", () =>
    client.query(
      `INSERT INTO "EmailVerificationToken"
        ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
        VALUES ($1, $2, $3, 'synthetic-token-hash-a', NOW() + INTERVAL '1 day')`,
      [id(), ids.accountB, ids.identifierB],
    ),
  );

  await client.query(
    `INSERT INTO "SchoolMembership" ("id", "registrationId", "councilId", "personId", "role", "status", "startsAt", "updatedAt") VALUES
      ($1, $2, $3, $4, 'TEACHER', 'ACTIVE', NOW(), NOW()),
      ($5, $2, $3, $6, 'TEACHER', 'ACTIVE', NOW(), NOW()),
      ($7, $8, $9, $6, 'TEACHER', 'ACTIVE', NOW(), NOW())`,
    [ids.membershipA, ids.registrationA, ids.councilA, ids.person, ids.membershipB, ids.personB, ids.membershipC, ids.registrationHistory, ids.councilA],
  );
  await client.query(
    `INSERT INTO "SchoolClass" ("id", "registrationId", "councilId", "grade", "academicYear", "streamCode", "updatedAt")
     VALUES ($1, $2, $3, 'GRADE_4', 2026, 'MAIN', NOW())`,
    [ids.classA, ids.registrationA, ids.councilA],
  );
  await expectConstraintFailure("SchoolClass_registrationId_academicYear_grade_streamCode_key", () =>
    client.query(
      `INSERT INTO "SchoolClass" ("id", "registrationId", "councilId", "grade", "academicYear", "streamCode", "updatedAt")
       VALUES ($1, $2, $3, 'GRADE_4', 2026, 'MAIN', NOW())`,
      [ids.classDuplicate, ids.registrationA, ids.councilA],
    ),
  );
  await client.query(
    `INSERT INTO "SchoolClass" ("id", "registrationId", "councilId", "grade", "academicYear", "streamCode", "updatedAt")
     VALUES ($1, $2, $3, 'GRADE_5', 2026, 'MAIN', NOW())`,
    [ids.classB, ids.registrationA, ids.councilA],
  );
  await expectConstraintFailure("SchoolClass_streamCode_normalized_check", () =>
    client.query(
      `INSERT INTO "SchoolClass" ("id", "registrationId", "councilId", "grade", "academicYear", "streamCode", "updatedAt")
       VALUES ($1, $2, $3, 'GRADE_5', 2026, 'east', NOW())`,
      [id(), ids.registrationA, ids.councilA],
    ),
  );
  await client.query(
    `INSERT INTO "StaffAssignment" ("id", "registrationId", "councilId", "schoolClassId", "membershipId", "type", "status", "startsAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'CLASS_TEACHER', 'ACTIVE', NOW(), NOW())`,
    [ids.assignmentA, ids.registrationA, ids.councilA, ids.classA, ids.membershipA],
  );
  await expectConstraintFailure("StaffAssignment_one_active_class_teacher", () =>
    client.query(
      `INSERT INTO "StaffAssignment" ("id", "registrationId", "councilId", "schoolClassId", "membershipId", "type", "status", "startsAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'CLASS_TEACHER', 'ACTIVE', NOW(), NOW())`,
      [ids.assignmentB, ids.registrationA, ids.councilA, ids.classA, ids.membershipB],
    ),
  );
  await expectConstraintFailure("StaffAssignment_membershipId_registrationId_councilId_fkey", () =>
    client.query(
      `INSERT INTO "StaffAssignment" ("id", "registrationId", "councilId", "schoolClassId", "membershipId", "type", "status", "startsAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'CLASS_TEACHER', 'ACTIVE', NOW(), NOW())`,
      [id(), ids.registrationA, ids.councilA, ids.classB, ids.membershipC],
    ),
  );

  const curriculumId = id();
  const curriculumVersionId = id();
  const learningAreaId = id();
  const gradeLearningAreaId = id();
  const councilCurriculumId = id();
  const councilGradeLearningAreaId = id();
  const draftVersionId = id();
  const draftGradeLearningAreaId = id();
  await client.query(
    `INSERT INTO "Curriculum" ("id", "code", "name", "track", "updatedAt")
     VALUES ($1, 'KE_KICD_REGULAR_CBE_TEST', 'Kenya Regular CBE', 'REGULAR', NOW())`,
    [curriculumId],
  );
  await client.query(
    `INSERT INTO "CurriculumVersion"
      ("id", "curriculumId", "versionLabel", "sourceTitle", "sourceUrl", "sourceRetrievedAt", "sourceSha256", "createdByAccountId", "updatedAt")
     VALUES ($1, $2, 'review-2026', 'Synthetic source', 'https://example.test/source', NOW(), $3, $4, NOW())`,
    [curriculumVersionId, curriculumId, "a".repeat(64), ids.accountA],
  );
  await client.query(
    `INSERT INTO "LearningArea" ("id", "code", "canonicalName", "updatedAt")
     VALUES ($1, 'TEST_MATHEMATICS', 'Mathematics', NOW())`,
    [learningAreaId],
  );
  await client.query(
    `INSERT INTO "GradeLearningArea"
      ("id", "curriculumVersionId", "learningAreaId", "grade", "sourceLabel", "sourceUrl", "updatedAt")
     VALUES ($1, $2, $3, 'GRADE_4', 'Mathematics', 'https://example.test/grade-4', NOW())`,
    [gradeLearningAreaId, curriculumVersionId, learningAreaId],
  );
  await client.query(
    `INSERT INTO "CurriculumVersion"
      ("id", "curriculumId", "versionLabel", "sourceTitle", "sourceUrl", "sourceRetrievedAt", "sourceSha256", "createdByAccountId", "updatedAt")
     VALUES ($1, $2, 'draft-2', 'Synthetic source', 'https://example.test/source', NOW(), $3, $4, NOW())`,
    [draftVersionId, curriculumId, "b".repeat(64), ids.accountA],
  );
  await client.query(
    `INSERT INTO "GradeLearningArea"
      ("id", "curriculumVersionId", "learningAreaId", "grade", "sourceLabel", "sourceUrl", "updatedAt")
     VALUES ($1, $2, $3, 'GRADE_4', 'Mathematics', 'https://example.test/grade-4', NOW())`,
    [draftGradeLearningAreaId, draftVersionId, learningAreaId],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `INSERT INTO "CouncilCurriculum" ("id", "councilId", "curriculumVersionId", "updatedAt")
       VALUES ($1, $2, $3, NOW())`,
      [id(), ids.councilB, draftVersionId],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "CurriculumVersion"
       SET "status" = 'PUBLISHED', "reviewedByAccountId" = $2, "publishedAt" = NOW(), "updatedAt" = NOW()
       WHERE "id" = $1`,
      [curriculumVersionId, ids.accountB],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "CurriculumVersion" SET "status" = 'PUBLISHED' WHERE "id" = $1`,
      [curriculumVersionId],
    ),
  );
  await client.query(
    `UPDATE "CurriculumVersion" SET "status" = 'IN_REVIEW', "updatedAt" = NOW() WHERE "id" = $1`,
    [curriculumVersionId],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "CurriculumVersion"
       SET "status" = 'PUBLISHED', "reviewedByAccountId" = $2, "publishedAt" = NOW(), "updatedAt" = NOW()
       WHERE "id" = $1`,
      [curriculumVersionId, ids.accountB],
    ),
  );
  await client.query(
    `UPDATE "GradeLearningArea"
     SET "optionality" = 'CORE', "reviewStatus" = 'REVIEWED', "reviewNote" = 'Synthetic independent review',
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    [gradeLearningAreaId],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "CurriculumVersion"
       SET "status" = 'PUBLISHED', "reviewedByAccountId" = $2, "publishedAt" = NOW(), "updatedAt" = NOW()
       WHERE "id" = $1`,
      [curriculumVersionId, ids.accountA],
    ),
  );
  await client.query(
    `UPDATE "CurriculumVersion"
     SET "status" = 'PUBLISHED', "reviewedByAccountId" = $2, "publishedAt" = NOW(), "updatedAt" = NOW()
     WHERE "id" = $1`,
    [curriculumVersionId, ids.accountB],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `INSERT INTO "GradeLearningArea"
        ("id", "curriculumVersionId", "learningAreaId", "grade", "sourceLabel", "sourceUrl", "updatedAt")
       VALUES ($1, $2, $3, 'GRADE_5', 'Mathematics', 'https://example.test/grade-5', NOW())`,
      [id(), curriculumVersionId, learningAreaId],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "CurriculumVersion" SET "sourceTitle" = 'Tampered' WHERE "id" = $1`,
      [curriculumVersionId],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(`DELETE FROM "CurriculumVersion" WHERE "id" = $1`, [curriculumVersionId]),
  );
  await client.query(
    `INSERT INTO "CouncilCurriculum" ("id", "councilId", "curriculumVersionId", "updatedAt")
     VALUES ($1, $2, $3, NOW())`,
    [councilCurriculumId, ids.councilA, curriculumVersionId],
  );
  await client.query(
    `INSERT INTO "CouncilGradeLearningArea"
      ("id", "councilCurriculumId", "councilId", "curriculumVersionId", "gradeLearningAreaId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [councilGradeLearningAreaId, councilCurriculumId, ids.councilA, curriculumVersionId, gradeLearningAreaId],
  );
  await expectSqlStateFailure("23514", () =>
    client.query(
      `UPDATE "CouncilGradeLearningArea"
       SET "enabled" = FALSE, "assessmentEligible" = TRUE WHERE "id" = $1`,
      [councilGradeLearningAreaId],
    ),
  );
  await expectConstraintFailure("CouncilGradeLearningArea_gradeLearningAreaId_curriculumVersionI", () =>
    client.query(
      `INSERT INTO "CouncilGradeLearningArea"
        ("id", "councilCurriculumId", "councilId", "curriculumVersionId", "gradeLearningAreaId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id(), councilCurriculumId, ids.councilA, curriculumVersionId, draftGradeLearningAreaId],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "CurriculumVersion" SET "status" = 'RETIRED', "updatedAt" = NOW() WHERE "id" = $1`,
      [curriculumVersionId],
    ),
  );
  // Rubric publication, Council isolation and assessment snapshot immutability.
  const rubricId = id();
  const rubricVersionId = id();
  const rubricBandA = id();
  const rubricBandB = id();
  const assessmentId = id();
  const assessmentLearningAreaId = id();
  const assessmentRubricBandA = id();
  const assessmentRubricBandB = id();

  await client.query(
    `UPDATE "CouncilGradeLearningArea"
     SET "enabled" = TRUE, "assessmentEligible" = TRUE, "updatedAt" = NOW()
     WHERE "id" = $1`,
    [councilGradeLearningAreaId],
  );
  await client.query(
    `INSERT INTO "GradingRubric" ("id", "councilId", "code", "name", "updatedAt")
     VALUES ($1, $2, 'TEST_NUMERIC', 'Synthetic Numeric Rubric', NOW())`,
    [rubricId, ids.councilA],
  );
  await client.query(
    `INSERT INTO "GradingRubricVersion"
      ("id", "rubricId", "councilId", "versionLabel", "scaleType", "minScore", "maxScore", "createdByAccountId", "updatedAt")
     VALUES ($1, $2, $3, 'v1', 'NUMERIC_BANDS', 0, 100, $4, NOW())`,
    [rubricVersionId, rubricId, ids.councilA, ids.accountA],
  );
  await client.query(
    `INSERT INTO "RubricBand"
      ("id", "rubricVersionId", "code", "label", "lowerBound", "upperBound", "sortOrder", "updatedAt")
     VALUES ($1, $3, 'BAND_1', 'Beginning', 0, 50, 0, NOW()),
            ($2, $3, 'BAND_2', 'Developing', 50, 100, 1, NOW())`,
    [rubricBandA, rubricBandB, rubricVersionId],
  );
  await client.query(
    `UPDATE "GradingRubricVersion" SET "status" = 'IN_REVIEW', "updatedAt" = NOW() WHERE "id" = $1`,
    [rubricVersionId],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "GradingRubricVersion"
       SET "status" = 'PUBLISHED', "reviewedByAccountId" = $1, "publishedAt" = NOW(), "updatedAt" = NOW()
       WHERE "id" = $2`,
      [ids.accountA, rubricVersionId],
    ),
  );
  await client.query(
    `UPDATE "GradingRubricVersion"
     SET "status" = 'PUBLISHED', "reviewedByAccountId" = $1, "publishedAt" = NOW(), "updatedAt" = NOW()
     WHERE "id" = $2`,
    [ids.accountB, rubricVersionId],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "RubricBand" SET "label" = 'Tampered' WHERE "id" = $1`,
      [rubricBandA],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `INSERT INTO "RubricBand"
        ("id", "rubricVersionId", "code", "label", "sortOrder", "updatedAt")
       VALUES ($1, $2, 'LATE_BAND', 'Late band', 2, NOW())`,
      [id(), rubricVersionId],
    ),
  );

  await client.query(
    `INSERT INTO "Assessment"
      ("id", "councilId", "councilCurriculumId", "curriculumVersionId", "rubricVersionId",
       "name", "code", "academicYear", "grade", "type", "createdByAccountId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'Synthetic Grade 4 Assessment', 'SYNTH-2026', 2026,
       'GRADE_4', 'SUMMATIVE', $6, NOW())`,
    [assessmentId, ids.councilA, councilCurriculumId, curriculumVersionId, rubricVersionId, ids.accountA],
  );
  await expectConstraintFailure("Assessment_councilCurriculumId_councilId_curriculumVersionId_fk", () =>
    client.query(
      `INSERT INTO "Assessment"
        ("id", "councilId", "councilCurriculumId", "curriculumVersionId", "rubricVersionId",
         "name", "code", "academicYear", "grade", "type", "createdByAccountId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'Cross Council Assessment', 'CROSS-2026', 2026,
         'GRADE_4', 'SUMMATIVE', $6, NOW())`,
      [id(), ids.councilB, councilCurriculumId, curriculumVersionId, rubricVersionId, ids.accountA],
    ),
  );
  await client.query(
    `INSERT INTO "AssessmentLearningArea"
      ("id", "assessmentId", "councilId", "curriculumVersionId", "councilGradeLearningAreaId",
       "grade", "learningAreaCode", "canonicalName", "sourceLabel", "maxMarks", "decimalPlaces", "sortOrder")
     VALUES ($1, $2, $3, $4, $5, 'GRADE_4', 'TEST_MATHEMATICS', 'Mathematics',
       'Mathematics', 100, 2, 0)`,
    [assessmentLearningAreaId, assessmentId, ids.councilA, curriculumVersionId, councilGradeLearningAreaId],
  );
  await expectConstraintFailure("AssessmentLearningArea_councilGradeLearningAreaId_councilId_cur", () =>
    client.query(
      `INSERT INTO "AssessmentLearningArea"
        ("id", "assessmentId", "councilId", "curriculumVersionId", "councilGradeLearningAreaId",
         "grade", "learningAreaCode", "canonicalName", "sourceLabel", "maxMarks")
       VALUES ($1, $2, $3, $4, $5, 'GRADE_4', 'TEST_MATHEMATICS', 'Mathematics',
         'Mathematics', 100)`,
      [id(), assessmentId, ids.councilA, curriculumVersionId, id()],
    ),
  );
  await client.query(
    `INSERT INTO "AssessmentRubricBand"
      ("id", "assessmentId", "rubricVersionId", "sourceRubricBandId", "code", "label",
       "lowerBound", "upperBound", "sortOrder")
     VALUES ($1, $2, $3, $4, 'BAND_1', 'Beginning', 0, 50, 0),
            ($5, $2, $3, $6, 'BAND_2', 'Developing', 50, 100, 1)`,
    [assessmentRubricBandA, assessmentId, rubricVersionId, rubricBandA, assessmentRubricBandB, rubricBandB],
  );
  await client.query(
    `INSERT INTO "Learner" ("id", "learnerNumber", "givenName", "familyName", "updatedAt")
     VALUES ($1, 'SENTINEL-TEST-LEARNER', 'Test', 'Learner', NOW())`,
    [ids.learnerA],
  );
  await client.query(
    `INSERT INTO "SchoolLearnerEnrollment"
      ("id", "learnerId", "registrationId", "councilId", "schoolClassId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [ids.enrollmentA, ids.learnerA, ids.registrationA, ids.councilA, ids.classA],
  );
  await client.query(
    `INSERT INTO "AssessmentCandidate"
      ("id", "assessmentId", "councilId", "curriculumVersionId", "learnerId", "enrollmentId",
       "registrationId", "schoolClassId", "schoolIdSnapshot", "schoolNameSnapshot",
       "learnerNumberSnapshot", "learnerNameSnapshot", "classGradeSnapshot", "classStreamSnapshot")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Synthetic Constraint School',
       'SENTINEL-TEST-LEARNER', 'Test Learner', 'GRADE_4', 'MAIN')`,
    [ids.candidateA, assessmentId, ids.councilA, curriculumVersionId, ids.learnerA,
      ids.enrollmentA, ids.registrationA, ids.classA, ids.school],
  );
  await client.query(
    `INSERT INTO "AssessmentMark"
      ("id", "assessmentId", "candidateId", "assessmentLearningAreaId", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW())`,
    [ids.markA, assessmentId, ids.candidateA, assessmentLearningAreaId],
  );
  await expectConstraintFailure("SchoolLearnerEnrollment_one_active_learner", () =>
    client.query(
      `INSERT INTO "SchoolLearnerEnrollment"
        ("id", "learnerId", "registrationId", "councilId", "schoolClassId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id(), ids.learnerA, ids.registrationA, ids.councilA, ids.classA],
    ),
  );
  await client.query(
    `UPDATE "Assessment" SET "opensAt" = NOW() + INTERVAL '1 day',
       "closesAt" = NOW() + INTERVAL '2 days', "status" = 'SCHEDULED', "updatedAt" = NOW()
     WHERE "id" = $1`,
    [assessmentId],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `INSERT INTO "AssessmentMark"
        ("id", "assessmentId", "candidateId", "assessmentLearningAreaId", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      [id(), assessmentId, ids.candidateA, assessmentLearningAreaId],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(`DELETE FROM "AssessmentMark" WHERE "id" = $1`, [ids.markA]),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "AssessmentCandidate" SET "learnerNameSnapshot" = 'Tampered' WHERE "id" = $1`,
      [ids.candidateA],
    ),
  );
  await client.query(
    `UPDATE "Assessment" SET "status" = 'OPEN', "updatedAt" = NOW() WHERE "id" = $1`,
    [assessmentId],
  );
  await expectSqlStateFailure("23514", () =>
    client.query(`UPDATE "AssessmentMark" SET "marks" = 101 WHERE "id" = $1`, [ids.markA]),
  );
  await expectSqlStateFailure("23514", () =>
    client.query(`UPDATE "AssessmentMark" SET "marks" = 75.123 WHERE "id" = $1`, [ids.markA]),
  );
  await client.query(
    `UPDATE "AssessmentMark" SET "marks" = 75.25, "enteredByAccountId" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
    [ids.accountA, ids.markA],
  );
  await client.query(
    `UPDATE "AssessmentMark" SET "status" = 'SUBMITTED', "submittedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
    [ids.markA],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(`UPDATE "AssessmentMark" SET "marks" = 70 WHERE "id" = $1`, [ids.markA]),
  );
  await client.query(
    `UPDATE "Assessment" SET "status" = 'CLOSED', "updatedAt" = NOW() WHERE "id" = $1`,
    [assessmentId],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "AssessmentMark" SET "status" = 'RETURNED', "returnedReason" = 'short', "submittedAt" = NULL WHERE "id" = $1`,
      [ids.markA],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "Assessment" SET "status" = 'OPEN', "updatedAt" = NOW() WHERE "id" = $1`,
      [assessmentId],
    ),
  );
  await client.query(
    `UPDATE "AssessmentMark"
       SET "status" = 'RETURNED', "returnedReason" = 'Please verify this mark against the source record.',
           "submittedAt" = NULL, "updatedAt" = NOW()
     WHERE "id" = $1`,
    [ids.markA],
  );
  await client.query(
    `UPDATE "Assessment" SET "status" = 'OPEN', "updatedAt" = NOW() WHERE "id" = $1`,
    [assessmentId],
  );
  await client.query(
    `UPDATE "AssessmentMark" SET "status" = 'DRAFT', "marks" = 76.25, "returnedReason" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
    [ids.markA],
  );
  await client.query(
    `UPDATE "AssessmentMark" SET "status" = 'SUBMITTED', "submittedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
    [ids.markA],
  );
  await client.query(
    `UPDATE "AssessmentCandidate" SET "status" = 'WITHDRAWN' WHERE "id" = $1`,
    [ids.candidateA],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(`UPDATE "AssessmentMark" SET "marks" = 70 WHERE "id" = $1`, [ids.markA]),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "Assessment" SET "name" = 'Tampered Assessment' WHERE "id" = $1`,
      [assessmentId],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "AssessmentLearningArea" SET "sourceLabel" = 'Tampered Learning Area' WHERE "id" = $1`,
      [assessmentLearningAreaId],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `DELETE FROM "AssessmentRubricBand" WHERE "id" = $1`,
      [assessmentRubricBandA],
    ),
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "Assessment" SET "status" = 'RELEASED', "updatedAt" = NOW() WHERE "id" = $1`,
      [assessmentId],
    ),
  );

  const overlappingRubricId = id();
  const overlappingVersionId = id();
  await client.query(
    `INSERT INTO "GradingRubric" ("id", "councilId", "code", "name", "updatedAt")
     VALUES ($1, $2, 'TEST_OVERLAP', 'Synthetic Overlap Rubric', NOW())`,
    [overlappingRubricId, ids.councilA],
  );
  await client.query(
    `INSERT INTO "GradingRubricVersion"
      ("id", "rubricId", "councilId", "versionLabel", "scaleType", "minScore", "maxScore", "createdByAccountId", "updatedAt")
     VALUES ($1, $2, $3, 'v1', 'NUMERIC_BANDS', 0, 100, $4, NOW())`,
    [overlappingVersionId, overlappingRubricId, ids.councilA, ids.accountA],
  );
  await client.query(
    `INSERT INTO "RubricBand"
      ("id", "rubricVersionId", "code", "label", "lowerBound", "upperBound", "sortOrder", "updatedAt")
     VALUES ($1, $3, 'OVERLAP_A', 'Overlap A', 0, 60, 0, NOW()),
            ($2, $3, 'OVERLAP_B', 'Overlap B', 50, 100, 1, NOW())`,
    [id(), id(), overlappingVersionId],
  );
  await client.query(
    `UPDATE "GradingRubricVersion" SET "status" = 'IN_REVIEW', "updatedAt" = NOW() WHERE "id" = $1`,
    [overlappingVersionId],
  );
  await expectSqlStateFailure("55000", () =>
    client.query(
      `UPDATE "GradingRubricVersion"
       SET "status" = 'PUBLISHED', "reviewedByAccountId" = $1, "publishedAt" = NOW(), "updatedAt" = NOW()
       WHERE "id" = $2`,
      [ids.accountB, overlappingVersionId],
    ),
  );

  await client.query(
    `UPDATE "CouncilCurriculum" SET "status" = 'SUPERSEDED', "effectiveTo" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
    [councilCurriculumId],
  );
  await client.query(
    `UPDATE "CurriculumVersion" SET "status" = 'RETIRED', "updatedAt" = NOW() WHERE "id" = $1`,
    [curriculumVersionId],
  );

  await client.query("ROLLBACK");
  console.log("Foundation PostgreSQL constraints passed: tenant boundaries, registration lifecycle, email-token ownership, class assignments, learner enrollment, immutable assessment rosters, mark validation and submission locks, curriculum publication immutability, Council selection and version-scoped learning areas.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
