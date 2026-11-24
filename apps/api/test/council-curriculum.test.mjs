import { test } from "node:test";
import assert from "node:assert/strict";
import { CouncilCurriculumService } from "../dist/council-curricula/council-curriculum.service.js";

const councilId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const versionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actor = { accountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
const mappingId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function serviceFor(tx) {
  return new CouncilCurriculumService({
    client: { $transaction: async (callback) => callback(tx) },
  });
}

test("Council cannot select a curriculum version that is not published", async () => {
  const tx = {
    council: { findUnique: async () => ({ id: councilId, status: "ACTIVE" }) },
    curriculumVersion: {
      findUnique: async () => ({
        id: versionId,
        status: "IN_REVIEW",
        curriculum: { code: "KE_CBE", name: "Kenya CBE" },
        gradeLearningAreas: [{ id: mappingId, sortOrder: 0 }],
      }),
    },
  };

  await assert.rejects(
    serviceFor(tx).selectVersion(actor, councilId, { curriculumVersionId: versionId }),
    (error) => error.getStatus() === 409 && /only a published/.test(error.message),
  );
});

test("Council cannot enable assessment eligibility for an unreviewed source mapping", async () => {
  let updateCalled = false;
  const tx = {
    councilCurriculum: {
      findFirst: async () => ({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", curriculumVersionId: versionId }),
    },
    councilGradeLearningArea: {
      findFirst: async () => ({
        id: mappingId,
        enabled: true,
        assessmentEligible: false,
        displayLabel: null,
        sortOrder: 0,
        gradeLearningArea: {
          grade: "GRADE_1",
          sourceLabel: "Mathematical Activities",
          optionality: "UNKNOWN",
          reviewStatus: "REVIEW_REQUIRED",
        },
      }),
      update: async () => {
        updateCalled = true;
        return {};
      },
    },
  };

  await assert.rejects(
    serviceFor(tx).updateGradeArea(actor, councilId, mappingId, {
      enabled: true,
      assessmentEligible: true,
      sortOrder: 0,
      reason: "Council assessment configuration decision.",
    }),
    (error) => error.getStatus() === 409 && /source-reviewed learning areas/.test(error.message),
  );
  assert.equal(updateCalled, false);
});

test("Council cannot mark a disabled learning area as assessment-eligible", async () => {
  let updateCalled = false;
  const tx = {
    councilCurriculum: {
      findFirst: async () => ({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", curriculumVersionId: versionId }),
    },
    councilGradeLearningArea: {
      findFirst: async () => ({
        id: mappingId,
        enabled: true,
        assessmentEligible: false,
        displayLabel: null,
        sortOrder: 0,
        gradeLearningArea: {
          grade: "GRADE_1",
          sourceLabel: "English",
          optionality: "CORE",
          reviewStatus: "REVIEWED",
        },
      }),
      update: async () => {
        updateCalled = true;
        return {};
      },
    },
  };

  await assert.rejects(
    serviceFor(tx).updateGradeArea(actor, councilId, mappingId, {
      enabled: false,
      assessmentEligible: true,
      sortOrder: 0,
      reason: "Council assessment configuration decision.",
    }),
    (error) => error.getStatus() === 400 && /disabled learning area/.test(error.message),
  );
  assert.equal(updateCalled, false);
});


test("Council selection supersedes history and starts all grade areas disabled", async () => {
  const superseded = [];
  let createdRows = [];
  let auditEvent;
  const selectionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const tx = {
    council: { findUnique: async () => ({ id: councilId, name: "Test Council", status: "ACTIVE" }) },
    curriculumVersion: {
      findUnique: async () => ({
        id: versionId,
        status: "PUBLISHED",
        curriculum: { code: "KE_CBE", name: "Kenya CBE" },
        gradeLearningAreas: [
          { id: mappingId, sortOrder: 0 },
          { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", sortOrder: 1 },
        ],
      }),
    },
    councilCurriculum: {
      findFirst: async () => ({ id: "99999999-9999-4999-8999-999999999999", curriculumVersionId: "88888888-8888-4888-8888-888888888888" }),
      updateMany: async (args) => { superseded.push(args); return { count: 1 }; },
      create: async ({ data }) => ({ id: selectionId, ...data }),
    },
    councilGradeLearningArea: {
      createMany: async ({ data }) => { createdRows = data; return { count: data.length }; },
    },
    auditEvent: {
      create: async ({ data }) => { auditEvent = data; return data; },
    },
  };

  const result = await serviceFor(tx).selectVersion(actor, councilId, { curriculumVersionId: versionId });
  assert.equal(result.id, selectionId);
  assert.equal(superseded.length, 1);
  assert.equal(superseded[0].data.status, "SUPERSEDED");
  assert.equal(createdRows.length, 2);
  assert.ok(createdRows.every((row) => row.enabled === false && row.assessmentEligible === false));
  assert.equal(auditEvent.action, "COUNCIL_CURRICULUM_SELECTED");
});
