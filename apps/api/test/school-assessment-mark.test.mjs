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
const mappingId = "66666666-6666-4666-8666-666666666666";

function classAccess() {
  return {
    id: classId, registrationId, councilId, grade: "GRADE_4", academicYear: 2026,
  };
}

function teacherMembership() {
  return { id: "44444444-4444-4444-8444-444444444444" };
}

test("only the assigned Subject Teacher can save a mark within the assessment limits", async () => {
  const records = {};
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" && where.staffAssignments?.some?.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === mappingId ? teacherMembership() : null },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
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
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" && where.staffAssignments?.some?.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === mappingId ? teacherMembership() : null },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
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
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentLearningArea: { findFirst: async () => null },
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
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" && where.staffAssignments?.some?.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === mappingId ? teacherMembership() : null },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
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
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" && where.staffAssignments?.some?.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === mappingId ? teacherMembership() : null },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, canonicalName: "Mathematics" }) },
    assessmentCandidate: {
      findMany: async () => [
        { id: candidateId, marks: [{ id: markId, marks: 70, status: "DRAFT" }] },
      ],
    },
    assessmentMark: { updateMany: async ({ where, data }) => { records.update = { where, data }; return { count: 2 }; } },
    assessmentMarkRevision: { createMany: async ({ data }) => { records.revisions = data; return { count: data.length }; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...base, $transaction: async (callback, options) => { assert.equal(options.isolationLevel, "Serializable"); return callback(tx); } };
  const result = await new SchoolAssessmentMarkService({ client }).submitLearningAreaMarks(actor, registrationId, classId, assessmentId, areaId);
  assert.deepEqual(records.update.where.id.in, [markId]);
  assert.equal(records.update.data.status, "SUBMITTED");
  assert.ok(records.update.data.submittedAt instanceof Date);
  assert.equal(records.revisions.length, 1);
  assert.equal(records.revisions[0].action, "SUBMITTED");
  assert.equal(records.audit.action, "ASSESSMENT_LEARNING_AREA_MARKS_SUBMITTED");
  assert.deepEqual(result, { success: true, candidateCount: 1, markCount: 1, learningAreaId: areaId });
});

test("class mark submission rejects incomplete mark cells", async () => {
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" && where.staffAssignments?.some?.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === mappingId ? teacherMembership() : null },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, canonicalName: "Mathematics" }) },
    assessmentCandidate: {
      findMany: async () => [{ id: candidateId, marks: [{ id: markId, marks: null, status: "DRAFT" }] }],
    },
    assessmentMark: { updateMany: async () => { throw new Error("must not update incomplete class"); } },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  await assert.rejects(
    new SchoolAssessmentMarkService({ client }).submitLearningAreaMarks(actor, registrationId, classId, assessmentId, areaId),
    (error) => error instanceof ConflictException && /missing or already submitted/.test(error.message),
  );
});


test("a returned mark can be corrected while the assessment is reopened", async () => {
  const records = {};
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" && where.staffAssignments?.some?.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === mappingId ? teacherMembership() : null },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
    assessmentMark: {
      findFirst: async () => ({ id: markId, marks: 72, status: "RETURNED" }),
      update: async ({ data }) => { records.updated = data; return { id: markId, marks: data.marks, status: "RETURNED", updatedAt: new Date() }; },
    },
    assessmentMarkRevision: { create: async ({ data }) => { records.revision = data; return data; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  const result = await new SchoolAssessmentMarkService({ client }).saveMark(
    actor, registrationId, classId, assessmentId,
    { candidateId, assessmentLearningAreaId: areaId, marks: 74.5 },
  );
  assert.equal(records.updated.marks, "74.5");
  assert.equal(records.updated.returnedReason, null);
  assert.equal(records.revision.action, "UPDATED");
  assert.equal(records.revision.previousMarks, 72);
  assert.equal(records.revision.newMarks, "74.5");
  assert.equal(records.audit.action, "ASSESSMENT_MARK_SAVED");
  assert.equal(result.marks, 74.5);
});

test("class resubmission accepts complete returned marks and records a new submission revision", async () => {
  const records = {};
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => where.role === "TEACHER" && where.staffAssignments?.some?.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === mappingId ? teacherMembership() : null },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, canonicalName: "Mathematics" }) },
    assessmentCandidate: {
      findMany: async () => [{ id: candidateId, marks: [{ id: markId, marks: 74.5, status: "RETURNED" }] }],
    },
    assessmentMark: {
      updateMany: async ({ where, data }) => { records.update = { where, data }; return { count: 1 }; },
    },
    assessmentMarkRevision: { createMany: async ({ data }) => { records.revisions = data; return { count: data.length }; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  const result = await new SchoolAssessmentMarkService({ client }).submitLearningAreaMarks(
    actor, registrationId, classId, assessmentId, areaId,
  );
  assert.deepEqual(records.update.where.status.in, ["DRAFT", "RETURNED"]);
  assert.equal(records.update.data.status, "SUBMITTED");
  assert.equal(records.revisions[0].action, "SUBMITTED");
  assert.deepEqual(result, { success: true, candidateCount: 1, markCount: 1, learningAreaId: areaId });
});


test("Subject Teacher can save marks only for the assigned curriculum learning area", async () => {
  const records = {};
  const mappingId = "77777777-7777-4777-8777-777777777777";
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => {
      const allowed = where.staffAssignments.some.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === mappingId;
      return allowed ? teacherMembership() : null;
    } },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
    assessmentMark: {
      findFirst: async () => ({ id: markId, marks: null, status: "DRAFT" }),
      update: async ({ data }) => { records.updated = data; return { id: markId, marks: data.marks, status: "DRAFT", updatedAt: new Date() }; },
    },
    assessmentMarkRevision: { create: async ({ data }) => data },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  await new SchoolAssessmentMarkService({ client }).saveMark(actor, registrationId, classId, assessmentId, {
    candidateId, assessmentLearningAreaId: areaId, marks: 74,
  });
  assert.equal(records.updated.marks, "74");
});

test("Subject Teacher cannot save marks for a different learning area", async () => {
  const assignedMappingId = "77777777-7777-4777-8777-777777777777";
  const requestedMappingId = "88888888-8888-4888-8888-888888888888";
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => {
      const allowed = where.staffAssignments.some.type === "SUBJECT_TEACHER" && where.staffAssignments.some.councilGradeLearningAreaId === assignedMappingId;
      return allowed ? teacherMembership() : null;
    } },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: requestedMappingId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Science" }) },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  await assert.rejects(
    new SchoolAssessmentMarkService({ client }).saveMark(actor, registrationId, classId, assessmentId, { candidateId, assessmentLearningAreaId: areaId, marks: 60 }),
    (error) => error instanceof ForbiddenException,
  );
});


test("Class Teacher coordination alone does not grant marks entry", async () => {
  let observedAssignmentFilter;
  const base = {
    schoolClass: { findFirst: async () => classAccess() },
    schoolMembership: { findFirst: async ({ where }) => {
      observedAssignmentFilter = where.staffAssignments.some;
      return null;
    } },
  };
  const tx = {
    schoolClass: base.schoolClass,
    schoolMembership: base.schoolMembership,
    assessment: { findFirst: async () => ({ id: assessmentId, status: "OPEN", grade: "GRADE_4", academicYear: 2026 }) },
    assessmentCandidate: { findFirst: async () => ({ id: candidateId }) },
    assessmentLearningArea: { findFirst: async () => ({ id: areaId, councilGradeLearningAreaId: mappingId, maxMarks: 80, decimalPlaces: 1, canonicalName: "Mathematics" }) },
  };
  const client = { ...base, $transaction: async (callback) => callback(tx) };
  await assert.rejects(
    new SchoolAssessmentMarkService({ client }).saveMark(actor, registrationId, classId, assessmentId, {
      candidateId, assessmentLearningAreaId: areaId, marks: 50,
    }),
    (error) => error instanceof ForbiddenException,
  );
  assert.equal(observedAssignmentFilter.type, "SUBJECT_TEACHER");
  assert.equal(observedAssignmentFilter.councilGradeLearningAreaId, mappingId);
});


test("teaching workspace resolves assigned curriculum mappings to assessment snapshot learning-area IDs", async () => {
  const snapshotAreaId = "77777777-7777-4777-8777-777777777777";
  const client = {
    schoolMembership: {
      findMany: async () => [{
        id: "88888888-8888-4888-8888-888888888888", registrationId, councilId,
        registration: { school: { name: "Example School" }, council: { name: "Example Council" } },
        staffAssignments: [{
          id: "99999999-9999-4999-8999-999999999999", type: "SUBJECT_TEACHER",
          schoolClass: { id: classId, grade: "GRADE_4", academicYear: 2026, streamCode: "MAIN", displayName: null },
          councilGradeLearningArea: { id: mappingId, displayLabel: null, gradeLearningArea: { sourceLabel: "Mathematics", learningArea: { code: "MATH", canonicalName: "Mathematics" } } },
        }],
      }],
    },
    assessment: { findMany: async () => [{
      id: assessmentId, name: "Term 2", code: "T2", opensAt: null, closesAt: null,
      learningAreas: [{ id: snapshotAreaId, councilGradeLearningAreaId: mappingId }],
    }] },
  };
  const result = await new SchoolAssessmentMarkService({ client }).listAssignedClasses(actor);
  assert.equal(result[0].learningAreas[0].id, mappingId);
  assert.equal(result[0].assessments[0].learningAreas[0].id, snapshotAreaId);
  assert.notEqual(result[0].assessments[0].learningAreas[0].id, mappingId);
});
