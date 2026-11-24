import { test } from "node:test";
import assert from "node:assert/strict";
import { SchoolClassService } from "../dist/school-classes/school-class.service.js";

const actor = { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const registrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const councilId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const classId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const teacherMembershipId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function adminScope() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    registrationId,
    councilId,
    registration: {
      school: { id: "22222222-2222-4222-8222-222222222222", name: "Example School" },
      council: { id: councilId, name: "Western Council" },
    },
  };
}

function createFixture({ admin = true, teacher = true, existingAssignment = null } = {}) {
  const queries = {};
  const records = {};
  const tx = {
    schoolMembership: {
      findFirst: async ({ where }) => {
        if (where.role === "SCHOOL_ADMINISTRATOR") return admin ? adminScope() : null;
        if (where.role === "TEACHER") {
          queries.teacher = where;
          return teacher ? { id: teacherMembershipId, person: { givenName: "Amina", familyName: "Teacher", displayName: null } } : null;
        }
        return null;
      },
    },
    schoolClass: {
      create: async ({ data }) => { records.schoolClass = data; return { id: classId, ...data, createdAt: new Date() }; },
      findFirst: async ({ where }) => { queries.class = where; return { id: classId, grade: "GRADE_4", academicYear: 2026, streamCode: "A" }; },
      findMany: async ({ where }) => { queries.list = where; return []; },
    },
    staffAssignment: {
      findFirst: async ({ where }) => { queries.assignment = where; return existingAssignment; },
      create: async ({ data }) => { records.assignment = data; return { id: "33333333-3333-4333-8333-333333333333", membershipId: data.membershipId, startsAt: data.startsAt }; },
      update: async ({ where, data }) => { records.ended = { where, data }; return { id: where.id }; },
    },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...tx, $transaction: async (callback, options) => { assert.equal(options.isolationLevel, "Serializable"); return callback(tx); } };
  return { service: new SchoolClassService({ client }), queries, records };
}

test("school class directory is scoped to the administrator's approved registration", async () => {
  const fixture = createFixture();
  const result = await fixture.service.list(actor, registrationId);
  assert.deepEqual(fixture.queries.list, { registrationId, councilId });
  assert.equal(result.school.name, "Example School");
  assert.deepEqual(result.classes, []);
});

test("class creation derives Council and registration from the administrator membership", async () => {
  const fixture = createFixture();
  await fixture.service.create(actor, registrationId, { grade: "GRADE_4", academicYear: 2026, streamCode: " a ", displayName: " Grade 4 East " });
  assert.equal(fixture.records.schoolClass.registrationId, registrationId);
  assert.equal(fixture.records.schoolClass.councilId, councilId);
  assert.equal(fixture.records.schoolClass.grade, "GRADE_4");
  assert.equal(fixture.records.schoolClass.streamCode, "A");
  assert.equal(fixture.records.schoolClass.displayName, "Grade 4 East");
  assert.equal(fixture.records.audit.action, "SCHOOL_CLASS_CREATED");
});

test("only an active teacher membership in the same school can be assigned as Class Teacher", async () => {
  const fixture = createFixture();
  const result = await fixture.service.assignClassTeacher(actor, registrationId, classId, { membershipId: teacherMembershipId });
  assert.equal(fixture.queries.class.registrationId, registrationId);
  assert.equal(fixture.queries.teacher.id, teacherMembershipId);
  assert.equal(fixture.queries.teacher.registrationId, registrationId);
  assert.equal(fixture.queries.teacher.role, "TEACHER");
  assert.equal(fixture.records.assignment.membershipId, teacherMembershipId);
  assert.equal(fixture.records.assignment.type, "CLASS_TEACHER");
  assert.equal(fixture.records.audit.action, "SCHOOL_CLASS_TEACHER_ASSIGNED");
  assert.equal(result.teacherName, "Amina Teacher");
});

test("a class cannot have a second active Class Teacher", async () => {
  const fixture = createFixture({ existingAssignment: { id: "44444444-4444-4444-8444-444444444444" } });
  await assert.rejects(
    fixture.service.assignClassTeacher(actor, registrationId, classId, { membershipId: teacherMembershipId }),
    (error) => error.getStatus() === 409,
  );
  assert.equal(fixture.records.assignment, undefined);
});

test("a teacher from another school cannot be assigned", async () => {
  const fixture = createFixture({ teacher: false });
  await assert.rejects(
    fixture.service.assignClassTeacher(actor, registrationId, classId, { membershipId: teacherMembershipId }),
    (error) => error.getStatus() === 404,
  );
});

test("ending a Class Teacher assignment retains history and records an audit event", async () => {
  const fixture = createFixture({ existingAssignment: { id: "55555555-5555-4555-8555-555555555555" } });
  const result = await fixture.service.endClassTeacher(actor, registrationId, classId);
  assert.deepEqual(fixture.records.ended.data.status, "ENDED");
  assert.ok(fixture.records.ended.data.endsAt instanceof Date);
  assert.equal(fixture.records.audit.action, "SCHOOL_CLASS_TEACHER_ENDED");
  assert.deepEqual(result, { success: true });
});
