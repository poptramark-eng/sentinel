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
