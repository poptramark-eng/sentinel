import { test } from "node:test";
import assert from "node:assert/strict";
import { PlatformCurriculumService } from "../dist/platform-curricula/platform-curriculum.service.js";

const actor = { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const curriculumId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const versionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function draftInput(overrides = {}) {
  return {
    curriculumCode: "KE_KICD_REGULAR_CBE",
    curriculumName: "Kenya Regular CBE",
    track: "REGULAR",
    versionLabel: "review-import-01",
    sourceTitle: "KICD source review extract",
    sourceUrl: "https://kicd.ac.ke/cbc-materials/",
    sourceRetrievedAt: "2026-11-24T00:00:00.000Z",
    sourceSha256: "a".repeat(64),
    rows: [
      {
        grade: "GRADE_1",
        learningAreaCode: "MATHEMATICAL_ACTIVITIES",
        canonicalName: "Mathematical Activities",
        sourceLabel: "Mathematical Activities",
        sourceUrl: "https://kicd.ac.ke/cbc-materials/lower-primary/",
        optionality: "UNKNOWN",
        sortOrder: 0,
      },
      {
        grade: "GRADE_2",
        learningAreaCode: "MATHEMATICAL_ACTIVITIES",
        canonicalName: "Mathematical Activities",
        sourceLabel: "Mathematical Activities",
        sourceUrl: "https://kicd.ac.ke/cbc-materials/lower-primary/",
        optionality: "UNKNOWN",
        sortOrder: 1,
      },
      {
        grade: "GRADE_1",
        learningAreaCode: "ENGLISH",
        canonicalName: "English",
        sourceLabel: "English",
        sourceUrl: "https://kicd.ac.ke/cbc-materials/lower-primary/",
        optionality: "UNKNOWN",
        sortOrder: 2,
      },
    ],
    ...overrides,
  };
}

test("curriculum import preview reports coverage and preserves unknown optionality", () => {
  const service = new PlatformCurriculumService({});
  const preview = service.previewImport(draftInput());

  assert.equal(preview.valid, true);
  assert.equal(preview.rowsReceived, 3);
  assert.equal(preview.uniqueLearningAreas, 2);
  assert.deepEqual(preview.gradesCovered, ["GRADE_1", "GRADE_2"]);
  assert.equal(preview.unresolvedOptionality, 3);
});

test("curriculum import preview rejects duplicate grade-to-learning-area mappings", () => {
  const service = new PlatformCurriculumService({});
  const input = draftInput();
  input.rows.push({ ...input.rows[0] });
  const preview = service.previewImport(input);

  assert.equal(preview.valid, false);
  assert.equal(preview.errors.length, 1);
  assert.match(preview.errors[0].message, /Duplicate learning area code/);
});

test("draft import stores provenance and keeps every imported mapping review-required", async () => {
  const mappings = [];
  const createdLearningAreas = [];
  const audit = [];
  const tx = {
    curriculum: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: curriculumId, ...data }),
    },
    curriculumVersion: {
      create: async ({ data }) => ({ id: versionId, versionLabel: data.versionLabel, status: data.status, ...data }),
    },
    learningArea: {
      findUnique: async () => null,
      create: async ({ data }) => {
        const result = { id: `learning-area-${createdLearningAreas.length + 1}`, ...data };
        createdLearningAreas.push(result);
        return result;
      },
    },
    gradeLearningArea: {
      create: async ({ data }) => { mappings.push(data); return data; },
    },
    auditEvent: {
      create: async ({ data }) => { audit.push(data); return data; },
    },
  };
  const service = new PlatformCurriculumService({
    client: { $transaction: async (callback) => callback(tx) },
  });

  const input = draftInput();
  const result = await service.createDraft(actor, input);

  assert.equal(result.version.status, "DRAFT");
  assert.equal(result.version.sourceSha256, input.sourceSha256);
  assert.equal(result.version.createdByAccountId, actor.accountId);
  assert.equal(result.rowsImported, 3);
  assert.equal(createdLearningAreas.length, 2);
  assert.equal(mappings.length, 3);
  assert.ok(mappings.every((mapping) => mapping.reviewStatus === "REVIEW_REQUIRED"));
  assert.ok(mappings.every((mapping) => mapping.optionality === "UNKNOWN"));
  assert.equal(audit[0].action, "PLATFORM_CURRICULUM_DRAFT_IMPORTED");
  assert.equal(audit[0].metadata.sourceSha256, input.sourceSha256);
});

test("curriculum author cannot publish their own version", async () => {
  const tx = {
    curriculumVersion: {
      findUnique: async () => ({
        id: versionId,
        status: "IN_REVIEW",
        createdByAccountId: actor.accountId,
        _count: { gradeLearningAreas: 1 },
      }),
    },
  };
  const service = new PlatformCurriculumService({
    client: { $transaction: async (callback) => callback(tx) },
  });

  await assert.rejects(
    service.publish(actor, versionId),
    (error) => error.getStatus() === 409 && /cannot publish their own/.test(error.message),
  );
});
