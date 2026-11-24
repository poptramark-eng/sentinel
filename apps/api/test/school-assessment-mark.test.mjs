import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { SchoolAssessmentMarkService } from "../dist/school-classes/school-assessment-mark.service.js";

const actor = { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const registrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const councilId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const classId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const assessmentId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const candidateId = "11111111-1111-4111-8111-111111111111";
const areaId = "22222222-2222-4222-8222-222222222222";
const markId = "33333333-3333-4333-8333-333333333333";

function classAccess() {
  return {
    id: classId, registrationId, councilId, grade: "GRADE_4", academicYear: 2026,
  };
}

function teacherMembership() {
  return { id: "44444444-4444-4444-8444-444444444444" };
}

test("only the active assigned Class Teacher can save a mark within the assessment limits", async () => {
  const records = {};
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" ? teacherMembership() : null },
  };
  const tx = {
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
    assessmentMark: {
      findFirst: async () => ({ id: markId, marks: null, status: "DRAFT" }),
      update: async ({ data }) => { records.updated = data; return { id: markId, marks: data.marks, status: "DRAFT", updatedAt: new Date() }; },
    },
    assessmentMarkRevision: { create: async ({ data }) => { records.revision = data; return data; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...base, $transaction: async (callback, options) => { assert.equal(options.isolationLevel, "Serializable"); return callback(tx); } };
  const result = await new SchoolAssessmentMarkService({ client }).saveMark(
    actor, registrationId, classId, assessmentId,
    { candidateId, assessmentLearningAreaId: areaId, marks: 72.5 },
  );
  assert.equal(records.updated.marks, "72.5");
  assert.equal(records.updated.enteredByAccountId, actor.accountId);
  assert.equal(records.revision.action, "CREATED");
  assert.equal(records.revision.newMarks, "72.5");
  assert.equal(records.audit.action, "ASSESSMENT_MARK_SAVED");
  assert.equal(result.marks, 72.5);
});

test("mark entry rejects a score above the learning area maximum", async () => {
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" ? teacherMembership() : null },
  };
  const tx = {
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  await assert.rejects(
    new SchoolAssessmentMarkService({ client }).saveMark(actor, registrationId, classId, assessmentId, {
      candidateId, assessmentLearningAreaId: areaId, marks: 81,
    }),
    (error) => error instanceof BadRequestException && /maximum of 80/.test(error.message),
  );
});

test("unassigned teachers cannot access another class mark sheet", async () => {
  const client = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async () => null },
  };
  await assert.rejects(
    new SchoolAssessmentMarkService({ client }).getMarkSheet(actor, registrationId, classId, assessmentId),
    (error) => error instanceof ForbiddenException,
  );
});

test("submitted marks cannot be overwritten", async () => {
  const records = {};
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" ? teacherMembership() : null },
  };
  const tx = {
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
    assessmentMark: { findFirst: async () => ({ id: markId, marks: 72, status: "SUBMITTED" }), update: async () => { records.updated = true; } },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  await assert.rejects(
    new SchoolAssessmentMarkService({ client }).saveMark(actor, registrationId, classId, assessmentId, {
      candidateId, assessmentLearningAreaId: areaId, marks: 73,
    }),
    (error) => error instanceof ConflictException && /locked/.test(error.message),
  );
  assert.equal(records.updated, undefined);
});


test("class mark submission requires every mark cell and locks the complete class sheet", async () => {
  const records = {};
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" ? teacherMembership() : null },
  };
  const tx = {
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: {
      findMany: async () => [
        { id: candidateId, marks: [{ id: markId, marks: 70, status: "DRAFT" }, { id: "55555555-5555-4555-8555-555555555555", marks: 65, status: "DRAFT" }] },
      ],
    },
    assessmentMark: { updateMany: async ({ where, data }) => { records.update = { where, data }; return { count: 2 }; } },
    assessmentMarkRevision: { createMany: async ({ data }) => { records.revisions = data; return { count: data.length }; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...base, $transaction: async (callback, options) => { assert.equal(options.isolationLevel, "Serializable"); return callback(tx); } };
  const result = await new SchoolAssessmentMarkService({ client }).submitClassMarks(actor, registrationId, classId, assessmentId);
  assert.deepEqual(records.update.where.id.in, [markId, "55555555-5555-4555-8555-555555555555"]);
  assert.equal(records.update.data.status, "SUBMITTED");
  assert.ok(records.update.data.submittedAt instanceof Date);
  assert.equal(records.revisions.length, 2);
  assert.equal(records.revisions[0].action, "SUBMITTED");
  assert.equal(records.audit.action, "ASSESSMENT_CLASS_MARKS_SUBMITTED");
  assert.deepEqual(result, { success: true, candidateCount: 1, markCount: 2 });
});

test("class mark submission rejects incomplete mark cells", async () => {
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" ? teacherMembership() : null },
  };
  const tx = {
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: {
      findMany: async () => [{ id: candidateId, marks: [{ id: markId, marks: null, status: "DRAFT" }] }],
    },
    assessmentMark: { updateMany: async () => { throw new Error("must not update incomplete class"); } },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  await assert.rejects(
    new SchoolAssessmentMarkService({ client }).submitClassMarks(actor, registrationId, classId, assessmentId),
    (error) => error instanceof ConflictException && /missing or already submitted/.test(error.message),
  );
});
