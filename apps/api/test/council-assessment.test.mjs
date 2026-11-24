import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { CouncilAssessmentService } from "../dist/council-assessments/council-assessment.service.js";

const councilId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const assessmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const curriculumVersionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const rubricVersionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const areaId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function serviceFor(tx) {
  return new CouncilAssessmentService({
    client: { $transaction: async (callback) => callback(tx) },
  });
}

function createInput(overrides = {}) {
  return {
    name: "Term 2 assessment",
    code: "T2-2026",
    academicYear: 2026,
    grade: "GRADE_4",
    type: "SUMMATIVE",
    rubricVersionId,
    learningAreas: [{ councilGradeLearningAreaId: areaId, maxMarks: 100, decimalPlaces: 0 }],
    ...overrides,
  };
}

test("assessment creation rejects duplicate learning-area selections before opening a transaction", async () => {
  let transactionCalled = false;
  const service = serviceFor({});
  service.prisma.client.$transaction = async () => { transactionCalled = true; };
  await assert.rejects(
    service.createAssessment({ accountId }, councilId, createInput({
      learningAreas: [
        { councilGradeLearningAreaId: areaId, maxMarks: 100, decimalPlaces: 0 },
        { councilGradeLearningAreaId: areaId, maxMarks: 50, decimalPlaces: 0 },
      ],
    })),
    (error) => error instanceof BadRequestException && /only once/.test(error.message),
  );
  assert.equal(transactionCalled, false);
});

test("assessment maximum marks must respect the selected decimal precision", async () => {
  let transactionCalled = false;
  const service = serviceFor({});
  service.prisma.client.$transaction = async () => { transactionCalled = true; };
  await assert.rejects(
    service.createAssessment({ accountId }, councilId, createInput({
      learningAreas: [{ councilGradeLearningAreaId: areaId, maxMarks: 87.5, decimalPlaces: 0 }],
    })),
    (error) => error instanceof BadRequestException && /decimal precision/.test(error.message),
  );
  assert.equal(transactionCalled, false);
});

test("assessment schedule window must close after it opens", async () => {
  let transactionCalled = false;
  const service = serviceFor({});
  service.prisma.client.$transaction = async () => { transactionCalled = true; };
  await assert.rejects(
    service.createAssessment({ accountId }, councilId, createInput({
      opensAt: "2026-11-25T12:00:00.000Z",
      closesAt: "2026-11-25T11:00:00.000Z",
    })),
    (error) => error instanceof BadRequestException && /closing time/.test(error.message),
  );
  assert.equal(transactionCalled, false);
});

test("assessment creation snapshots the selected curriculum, eligible learning areas and published rubric bands", async () => {
  const areaSnapshotRows = [];
  const rubricSnapshotRows = [];
  let createdAssessment;
  let audit;
  const tx = {
    council: { findUnique: async () => ({ id: councilId, status: "ACTIVE" }) },
    councilCurriculum: {
      findFirst: async () => ({
        id: "99999999-9999-4999-8999-999999999999",
        curriculumVersionId,
        curriculumVersion: { status: "PUBLISHED" },
      }),
    },
    gradingRubricVersion: {
      findFirst: async () => ({
        id: rubricVersionId,
        rubric: { id: "12121212-1212-4212-8212-121212121212", code: "CBE-PL", name: "Performance levels" },
        bands: [{
          id: "13131313-1313-4313-8313-131313131313",
          code: "PL3",
          label: "Meets expectation",
          description: "Source-governed descriptor",
          lowerBound: null,
          upperBound: null,
          sortOrder: 2,
        }],
      }),
    },
    councilGradeLearningArea: {
      findMany: async () => [{
        id: areaId,
        sortOrder: 3,
        displayLabel: "Mathematics",
        sourceLabel: "Mathematical Activities",
        gradeLearningArea: {
          sourceLabel: "Mathematical Activities",
          learningArea: { code: "MAT", canonicalName: "Mathematics" },
        },
      }],
    },
    assessment: {
      create: async ({ data }) => {
        createdAssessment = { id: assessmentId, ...data };
        return createdAssessment;
      },
      findUnique: async () => ({
        ...createdAssessment,
        learningAreas: areaSnapshotRows,
        rubricBands: rubricSnapshotRows,
      }),
    },
    assessmentLearningArea: {
      createMany: async ({ data }) => { areaSnapshotRows.push(...data); return { count: data.length }; },
    },
    assessmentRubricBand: {
      createMany: async ({ data }) => { rubricSnapshotRows.push(...data); return { count: data.length }; },
    },
    auditEvent: {
      create: async ({ data }) => { audit = data; return data; },
    },
  };

  const result = await serviceFor(tx).createAssessment({ accountId }, councilId, createInput({
    learningAreas: [{ councilGradeLearningAreaId: areaId, maxMarks: 80.5, decimalPlaces: 1 }],
  }));

  assert.equal(result.id, assessmentId);
  assert.equal(createdAssessment.curriculumVersionId, curriculumVersionId);
  assert.equal(createdAssessment.rubricVersionId, rubricVersionId);
  assert.equal(areaSnapshotRows.length, 1);
  assert.equal(areaSnapshotRows[0].grade, "GRADE_4");
  assert.equal(areaSnapshotRows[0].learningAreaCode, "MAT");
  assert.equal(areaSnapshotRows[0].sourceLabel, "Mathematical Activities");
  assert.equal(areaSnapshotRows[0].maxMarks, "80.5");
  assert.equal(areaSnapshotRows[0].decimalPlaces, 1);
  assert.equal(rubricSnapshotRows.length, 1);
  assert.equal(rubricSnapshotRows[0].code, "PL3");
  assert.equal(rubricSnapshotRows[0].label, "Meets expectation");
  assert.equal(audit.action, "ASSESSMENT_DRAFT_CREATED");
  assert.equal(audit.metadata.curriculumVersionId, curriculumVersionId);
  assert.equal(audit.metadata.rubricVersionId, rubricVersionId);
});

test("assessment creation rejects a learning area outside the Council's eligible grade configuration", async () => {
  const tx = {
    council: { findUnique: async () => ({ id: councilId, status: "ACTIVE" }) },
    councilCurriculum: {
      findFirst: async () => ({
        id: "99999999-9999-4999-8999-999999999999",
        curriculumVersionId,
        curriculumVersion: { status: "PUBLISHED" },
      }),
    },
    gradingRubricVersion: {
      findFirst: async () => ({
        id: rubricVersionId,
        rubric: { code: "CBE", name: "CBE rubric" },
        bands: [{ id: "13131313-1313-4313-8313-131313131313", code: "PL1", label: "Emerging", sortOrder: 0 }],
      }),
    },
    councilGradeLearningArea: { findMany: async () => [] },
  };

  await assert.rejects(
    serviceFor(tx).createAssessment({ accountId }, councilId, createInput()),
    (error) => error instanceof ConflictException && /not enabled and assessment-eligible/.test(error.message),
  );
});


test("rubric read access is available to active Council administrators and governance approvers", async () => {
  const { CouncilRubricReaderGuard } = await import("../dist/auth/council-rubric-reader.guard.js");
  let membershipWhere;
  const guard = new CouncilRubricReaderGuard({
    client: {
      userAccount: { findUnique: async () => ({ personId: "77777777-7777-4777-8777-777777777777" }) },
      councilMembership: {
        findFirst: async ({ where }) => {
          membershipWhere = where;
          return { id: "66666666-6666-4666-8666-666666666666" };
        },
      },
    },
  });
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ auth: { accountId }, params: { councilId } }),
    }),
  };

  assert.equal(await guard.canActivate(context), true);
  assert.equal(membershipWhere.councilId, councilId);
  assert.deepEqual(membershipWhere.role.in, ["COUNCIL_ADMINISTRATOR", "COUNCIL_GOVERNANCE_APPROVER"]);
  assert.equal(membershipWhere.status, "ACTIVE");
});

test("rubric read access denies accounts without an active Council governance membership", async () => {
  const { CouncilRubricReaderGuard } = await import("../dist/auth/council-rubric-reader.guard.js");
  const guard = new CouncilRubricReaderGuard({
    client: {
      userAccount: { findUnique: async () => ({ personId: "77777777-7777-4777-8777-777777777777" }) },
      councilMembership: { findFirst: async () => null },
    },
  });
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ auth: { accountId }, params: { councilId } }),
    }),
  };

  await assert.rejects(guard.canActivate(context), (error) => error.getStatus() === 403);
});


test("independent reviewer can return a rubric for changes with an auditable reason", async () => {
  let updated;
  let audit;
  const service = serviceFor({
    gradingRubricVersion: {
      findFirst: async () => ({
        id: rubricVersionId,
        createdByAccountId: "99999999-9999-4999-8999-999999999999",
        versionLabel: "v2",
      }),
      update: async ({ data }) => { updated = data; return { id: rubricVersionId, status: data.status, versionLabel: "v2" }; },
    },
    auditEvent: { create: async ({ data }) => { audit = data; return data; } },
  });

  const result = await service.returnRubricForChanges(
    { accountId },
    councilId,
    rubricVersionId,
    "Clarify the evidence required for this descriptor.",
  );
  assert.equal(result.status, "DRAFT");
  assert.deepEqual(updated, { status: "DRAFT" });
  assert.equal(audit.action, "GRADING_RUBRIC_RETURNED_FOR_CHANGES");
  assert.equal(audit.reason, "Clarify the evidence required for this descriptor.");
});

test("rubric author cannot return their own version for changes", async () => {
  let updateCalled = false;
  const service = serviceFor({
    gradingRubricVersion: {
      findFirst: async () => ({
        id: rubricVersionId,
        createdByAccountId: accountId,
        versionLabel: "v2",
      }),
      update: async () => { updateCalled = true; },
    },
  });
  await assert.rejects(
    service.returnRubricForChanges({ accountId }, councilId, rubricVersionId, "Review reason is long enough."),
    (error) => error instanceof ConflictException && /cannot return their own/.test(error.message),
  );
  assert.equal(updateCalled, false);
});


test("only a rubric author may add bands to their own draft version", async () => {
  let createCalled = false;
  const service = serviceFor({
    gradingRubricVersion: {
      findFirst: async () => ({
        id: rubricVersionId,
        createdByAccountId: "99999999-9999-4999-8999-999999999999",
        scaleType: "PERFORMANCE_LEVELS",
        minScore: null,
        maxScore: null,
        bands: [],
      }),
    },
    rubricBand: { create: async () => { createCalled = true; } },
  });
  await assert.rejects(
    service.addRubricBand({ accountId }, councilId, rubricVersionId, {
      code: "PL1",
      label: "Council-approved descriptor",
      sortOrder: 0,
    }),
    (error) => error instanceof ConflictException && /Only the rubric author/.test(error.message),
  );
  assert.equal(createCalled, false);
});


test("scheduling freezes active matching learner enrollments and initializes every mark cell", async () => {
  const candidateRows = [];
  const markRows = [];
  let audit;
  const enrollmentId = "12121212-1212-4212-8212-121212121212";
  const learnerId = "13131313-1313-4313-8313-131313131313";
  const classId = "14141414-1414-4414-8414-141414141414";
  const tx = {
    assessment: {
      findFirst: async () => ({
        id: assessmentId, status: "DRAFT", grade: "GRADE_4", academicYear: 2026, curriculumVersionId,
      }),
      update: async ({ data }) => ({ id: assessmentId, name: "Term 2 assessment", code: "T2-2026", status: data.status, opensAt: data.opensAt, closesAt: data.closesAt }),
    },
    schoolLearnerEnrollment: {
      findMany: async ({ where }) => {
        assert.equal(where.councilId, councilId);
        assert.equal(where.status, "ACTIVE");
        assert.equal(where.schoolClass.is.grade, "GRADE_4");
        return [{
          id: enrollmentId, learnerId, registrationId: "15151515-1515-4515-8515-151515151515",
          councilId, schoolClassId: classId,
          learner: { id: learnerId, learnerNumber: "LRN-TEST-001", givenName: "Amina", otherNames: "Wanjiku", familyName: "Otieno", displayName: null },
          registration: { school: { id: "17171717-1717-4717-8717-171717171717", name: "Test Primary School" } },
          schoolClass: { grade: "GRADE_4", streamCode: "EAST" },
        }];
      },
    },
    assessmentCandidate: {
      createMany: async ({ data }) => { candidateRows.push(...data); return { count: data.length }; },
      findMany: async () => [{ id: "16161616-1616-4616-8616-161616161616" }],
    },
    assessmentLearningArea: { findMany: async () => [{ id: areaId }] },
    assessmentMark: { createMany: async ({ data }) => { markRows.push(...data); return { count: data.length }; } },
    auditEvent: { create: async ({ data }) => { audit = data; return data; } },
  };
  const opensAt = new Date(Date.now() + 60 * 60 * 1000);
  const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const result = await serviceFor(tx).scheduleAssessment(
    { accountId }, councilId, assessmentId,
    { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() },
  );
  assert.equal(result.status, "SCHEDULED");
  assert.equal(candidateRows.length, 1);
  assert.equal(candidateRows[0].learnerNumberSnapshot, "LRN-TEST-001");
  assert.equal(candidateRows[0].learnerNameSnapshot, "Amina Wanjiku Otieno");
  assert.equal(candidateRows[0].schoolNameSnapshot, "Test Primary School");
  assert.equal(candidateRows[0].schoolIdSnapshot, "17171717-1717-4717-8717-171717171717");
  assert.equal(candidateRows[0].classStreamSnapshot, "EAST");
  assert.equal(markRows.length, 1);
  assert.equal(markRows[0].assessmentLearningAreaId, areaId);
  assert.equal(audit.metadata.candidateCount, 1);
  assert.equal(audit.metadata.participatingSchoolCount, 1);
});

test("assessment scheduling rejects duplicate active learner identities across participating schools", async () => {
  const learnerId = "13131313-1313-4313-8313-131313131313";
  const tx = {
    assessment: { findFirst: async () => ({ id: assessmentId, status: "DRAFT", grade: "GRADE_4", academicYear: 2026, curriculumVersionId }) },
    schoolLearnerEnrollment: {
      findMany: async () => [
        { id: "12121212-1212-4212-8212-121212121212", learnerId, registrationId: "15151515-1515-4515-8515-151515151515", councilId, schoolClassId: "14141414-1414-4414-8414-141414141414", learner: { learnerNumber: "LRN-001", givenName: "A", otherNames: null, familyName: "Learner", displayName: null }, schoolClass: { grade: "GRADE_4", streamCode: "A" } },
        { id: "17171717-1717-4717-8717-171717171717", learnerId, registrationId: "18181818-1818-4818-8818-181818181818", councilId, schoolClassId: "19191919-1919-4919-8919-191919191919", learner: { learnerNumber: "LRN-001", givenName: "A", otherNames: null, familyName: "Learner", displayName: null }, schoolClass: { grade: "GRADE_4", streamCode: "B" } },
      ],
    },
  };
  await assert.rejects(
    serviceFor(tx).scheduleAssessment({ accountId }, councilId, assessmentId, {
      opensAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
    (error) => error instanceof ConflictException && /more than one participating school/.test(error.message),
  );
});


test("governance moderation returns every submitted mark for one class and reopens correction entry", async () => {
  const classId = "21212121-2121-4121-8121-212121212121";
  const registrationId = "23232323-2323-4323-8323-232323232323";
  const candidateId = "24242424-2424-4424-8424-242424242424";
  const markIds = ["25252525-2525-4525-8525-252525252525", "26262626-2626-4626-8626-262626262626"];
  const reason = "Please verify the two entries against the signed class assessment record.";
  const records = {};
  const tx = {
    assessment: {
      findFirst: async () => ({ id: assessmentId, grade: "GRADE_4", academicYear: 2026 }),
      update: async ({ data }) => { records.assessment = data; return { id: assessmentId, ...data }; },
    },
    schoolClass: { findFirst: async () => ({ id: classId, registrationId }) },
    assessmentCandidate: { findMany: async () => [{ id: candidateId }] },
    assessmentLearningArea: { count: async () => 2 },
    assessmentMark: {
      findMany: async () => markIds.map((id) => ({ id, marks: 72, status: "SUBMITTED" })),
      updateMany: async ({ where, data }) => { records.markUpdate = { where, data }; return { count: 2 }; },
    },
    assessmentMarkRevision: { createMany: async ({ data }) => { records.revisions = data; return { count: data.length }; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    return callback(tx);
  } };
  const result = await new CouncilAssessmentService({ client }).returnClassMarksForCorrection(
    { accountId }, councilId, assessmentId, classId, reason,
  );
  assert.deepEqual(records.markUpdate.where.id.in, markIds);
  assert.equal(records.markUpdate.data.status, "RETURNED");
  assert.equal(records.markUpdate.data.returnedReason, reason);
  assert.equal(records.markUpdate.data.submittedAt, null);
  assert.equal(records.revisions.length, 2);
  assert.equal(records.revisions[0].action, "RETURNED");
  assert.equal(records.revisions[0].reason, reason);
  assert.equal(records.assessment.status, "OPEN");
  assert.equal(records.audit.action, "ASSESSMENT_CLASS_MARKS_RETURNED_FOR_CORRECTION");
  assert.equal(records.audit.reason, reason);
  assert.equal(result.markCount, 2);
});

test("moderation cannot return a class while any mark is missing or unsubmitted", async () => {
  const classId = "21212121-2121-4121-8121-212121212121";
  const tx = {
    assessment: {
      findFirst: async () => ({ id: assessmentId, grade: "GRADE_4", academicYear: 2026 }),
    },
    schoolClass: { findFirst: async () => ({ id: classId, registrationId: "23232323-2323-4323-8323-232323232323" }) },
    assessmentCandidate: { findMany: async () => [{ id: "24242424-2424-4424-8424-242424242424" }] },
    assessmentLearningArea: { count: async () => 1 },
    assessmentMark: { findMany: async () => [{ id: "25252525-2525-4525-8525-252525252525", marks: null, status: "DRAFT" }] },
  };
  await assert.rejects(
    new CouncilAssessmentService({ client: { $transaction: async (callback) => callback(tx) } })
      .returnClassMarksForCorrection(
        { accountId }, councilId, assessmentId, classId,
        "Please correct the missing assessment marks.",
      ),
    (error) => error instanceof ConflictException && /every mark has been submitted/.test(error.message),
  );
});

test("moderation requires a substantive reason before opening a transaction", async () => {
  let called = false;
  const service = new CouncilAssessmentService({ client: { $transaction: async () => { called = true; } } });
  await assert.rejects(
    service.returnClassMarksForCorrection({ accountId }, councilId, assessmentId,
      "21212121-2121-4121-8121-212121212121", "fix"),
    (error) => error instanceof BadRequestException && /10 and 2,000/.test(error.message),
  );
  assert.equal(called, false);
});


test("governance moderation can return one learning area without returning other subject marks", async () => {
  const classId = "21212121-2121-4121-8121-212121212121";
  const registrationId = "23232323-2323-4323-8323-232323232323";
  const candidateId = "24242424-2424-4424-8424-242424242424";
  const learningAreaId = "27272727-2727-4727-8727-272727272727";
  const mappingId = "28282828-2828-4828-8828-282828282828";
  const markIds = ["29292929-2929-4929-8929-292929292929"];
  const reason = "Please verify the Mathematics scores against the signed subject mark sheet.";
  const records = {};
  const tx = {
    assessment: {
      findFirst: async () => ({ id: assessmentId, grade: "GRADE_4", academicYear: 2026 }),
      update: async ({ data }) => { records.assessment = data; return { id: assessmentId, ...data }; },
    },
    schoolClass: { findFirst: async () => ({ id: classId, registrationId }) },
    assessmentLearningArea: { findFirst: async ({ where }) => { records.areaWhere = where; return { id: learningAreaId, councilGradeLearningAreaId: mappingId, canonicalName: "Mathematics" }; } },
    assessmentCandidate: { findMany: async () => [{ id: candidateId }] },
    assessmentMark: {
      findMany: async ({ where }) => { records.markWhere = where; return markIds.map((id) => ({ id, marks: 72, status: "SUBMITTED" })); },
      updateMany: async ({ where, data }) => { records.markUpdate = { where, data }; return { count: 1 }; },
    },
    assessmentMarkRevision: { createMany: async ({ data }) => { records.revisions = data; return { count: data.length }; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    return callback(tx);
  } };
  const result = await new CouncilAssessmentService({ client }).returnLearningAreaMarksForCorrection(
    { accountId }, councilId, assessmentId, classId, learningAreaId, reason,
  );
  assert.equal(records.areaWhere.id, learningAreaId);
  assert.equal(records.markWhere.assessmentLearningAreaId, learningAreaId);
  assert.deepEqual(records.markUpdate.where.id.in, markIds);
  assert.equal(records.markUpdate.data.status, "RETURNED");
  assert.equal(records.revisions[0].action, "RETURNED");
  assert.equal(records.audit.action, "ASSESSMENT_LEARNING_AREA_MARKS_RETURNED_FOR_CORRECTION");
  assert.equal(records.audit.metadata.councilGradeLearningAreaId, mappingId);
  assert.equal(records.assessment.status, "OPEN");
  assert.equal(result.learningAreaId, learningAreaId);
  assert.equal(result.markCount, 1);
});

test("learning-area moderation rejects incomplete or unsubmitted marks", async () => {
  const classId = "21212121-2121-4121-8121-212121212121";
  const learningAreaId = "27272727-2727-4727-8727-272727272727";
  const tx = {
    assessment: { findFirst: async () => ({ id: assessmentId, grade: "GRADE_4", academicYear: 2026 }) },
    schoolClass: { findFirst: async () => ({ id: classId, registrationId: "23232323-2323-4323-8323-232323232323" }) },
    assessmentLearningArea: { findFirst: async () => ({ id: learningAreaId, councilGradeLearningAreaId: "28282828-2828-4828-8828-282828282828", canonicalName: "Mathematics" }) },
    assessmentCandidate: { findMany: async () => [{ id: "24242424-2424-4424-8424-242424242424" }] },
    assessmentMark: { findMany: async () => [{ id: "29292929-2929-4929-8929-292929292929", marks: null, status: "DRAFT" }] },
  };
  await assert.rejects(
    new CouncilAssessmentService({ client: { $transaction: async (callback) => callback(tx) } })
      .returnLearningAreaMarksForCorrection({ accountId }, councilId, assessmentId, classId, learningAreaId,
        "Please correct the missing Mathematics mark."),
    (error) => error instanceof ConflictException && /every candidate mark has been submitted/.test(error.message),
  );
});
