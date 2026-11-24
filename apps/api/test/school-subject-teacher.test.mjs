import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { SchoolClassService } from "../dist/school-classes/school-class.service.js";

const actor = { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const registrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const councilId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const classId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const membershipId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const mappingId = "11111111-1111-4111-8111-111111111111";
const assignmentId = "22222222-2222-4222-8222-222222222222";

function adminScope() {
  return { id: "33333333-3333-4333-8333-333333333333", registrationId, councilId,
    registration: { school: { id: "44444444-4444-4444-8444-444444444444", name: "Example School" }, council: { id: councilId, name: "Western Council" } } };
}
function fixture({ teacher = true, mapping = true, existing = null } = {}) {
  const records = {};
  const queries = {};
  const tx = {
    schoolMembership: { findFirst: async ({ where }) => {
      if (where.role === "SCHOOL_ADMINISTRATOR") return adminScope();
      if (where.role === "TEACHER") { queries.teacher = where; return teacher ? { id: membershipId, person: { givenName: "Amina", familyName: "Teacher", displayName: null } } : null; }
      return null;
    } },
    schoolClass: { findFirst: async ({ where }) => { queries.class = where; return { id: classId, grade: "GRADE_4", academicYear: 2026 }; } },
    councilGradeLearningArea: { findFirst: async ({ where }) => { queries.mapping = where; return mapping ? { id: mappingId, curriculumVersionId: "55555555-5555-4555-8555-555555555555", displayLabel: null, gradeLearningArea: { sourceLabel: "Mathematics", learningArea: { canonicalName: "Mathematics" } } } : null; } },
    staffAssignment: {
      findFirst: async ({ where }) => { queries.assignment = where; return existing; },
      create: async ({ data }) => { records.assignment = data; return { id: assignmentId, membershipId: data.membershipId, councilGradeLearningAreaId: data.councilGradeLearningAreaId, startsAt: data.startsAt }; },
      update: async ({ where, data }) => { records.ended = { where, data }; return { id: where.id }; },
    },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...tx, $transaction: async (callback, options) => { assert.equal(options.isolationLevel, "Serializable"); return callback(tx); } };
  return { service: new SchoolClassService({ client }), records, queries };
}

test("School Administrator assigns an active teacher to an enabled published curriculum learning area", async () => {
  const f = fixture();
  const result = await f.service.assignSubjectTeacher(actor, registrationId, classId, { membershipId, councilGradeLearningAreaId: mappingId });
  assert.equal(f.queries.teacher.registrationId, registrationId);
  assert.equal(f.queries.teacher.role, "TEACHER");
  assert.equal(f.queries.mapping.councilId, councilId);
  assert.equal(f.queries.mapping.gradeLearningArea.is.grade, "GRADE_4");
  assert.equal(f.records.assignment.type, "SUBJECT_TEACHER");
  assert.equal(f.records.assignment.councilGradeLearningAreaId, mappingId);
  assert.equal(f.records.audit.action, "SCHOOL_SUBJECT_TEACHER_ASSIGNED");
  assert.equal(result.teacherName, "Amina Teacher");
  assert.equal(result.learningAreaName, "Mathematics");
});

test("a teacher from another school cannot receive a subject assignment", async () => {
  const f = fixture({ teacher: false });
  await assert.rejects(f.service.assignSubjectTeacher(actor, registrationId, classId, { membershipId, councilGradeLearningAreaId: mappingId }), (error) => error instanceof NotFoundException);
  assert.equal(f.records.assignment, undefined);
});

test("an unavailable or disabled curriculum mapping cannot be assigned", async () => {
  const f = fixture({ mapping: false });
  await assert.rejects(f.service.assignSubjectTeacher(actor, registrationId, classId, { membershipId, councilGradeLearningAreaId: mappingId }), (error) => error instanceof NotFoundException);
  assert.equal(f.records.assignment, undefined);
});

test("a class learning area cannot have two active Subject Teachers", async () => {
  const f = fixture({ existing: { id: "66666666-6666-4666-8666-666666666666" } });
  await assert.rejects(f.service.assignSubjectTeacher(actor, registrationId, classId, { membershipId, councilGradeLearningAreaId: mappingId }), (error) => error instanceof ConflictException);
  assert.equal(f.records.assignment, undefined);
});

test("ending a Subject Teacher assignment preserves its history and audits the change", async () => {
  const f = fixture({ existing: { id: assignmentId, councilGradeLearningAreaId: mappingId } });
  const result = await f.service.endSubjectTeacher(actor, registrationId, classId, assignmentId);
  assert.equal(f.records.ended.data.status, "ENDED");
  assert.ok(f.records.ended.data.endsAt instanceof Date);
  assert.equal(f.records.audit.action, "SCHOOL_SUBJECT_TEACHER_ENDED");
  assert.deepEqual(result, { success: true });
});
