import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictException } from "@nestjs/common";
import { LearnerEnrollmentService } from "../dist/school-classes/learner-enrollment.service.js";

const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const personId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const registrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const councilId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const classId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const learnerId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function adminScope() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    registrationId,
    councilId,
    registration: { school: { id: "22222222-2222-4222-8222-222222222222", name: "Example School" }, council: { id: councilId, name: "Example Council" } },
  };
}

test("school administrator creates a global learner identity and enrolls it in the selected class", async () => {
  const records = {};
  const tx = {
    schoolMembership: { findFirst: async () => adminScope() },
    schoolClass: { findFirst: async ({ where }) => { records.classWhere = where; return { id: classId, grade: "GRADE_4", academicYear: 2026 }; } },
    learner: {
      create: async ({ data }) => {
        records.learner = data;
        return { id: learnerId, ...data, displayName: null };
      },
    },
    schoolLearnerEnrollment: {
      findFirst: async ({ where }) => { records.activeWhere = where; return null; },
      create: async ({ data }) => { records.enrollment = data; return { id: "12121212-1212-4212-8212-121212121212", admissionNumber: data.admissionNumber, enrolledAt: new Date(), status: "ACTIVE" }; },
    },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...tx, $transaction: async (callback, options) => { assert.equal(options.isolationLevel, "Serializable"); return callback(tx); } };
  const result = await new LearnerEnrollmentService({ client }).enroll(
    { accountId, personId }, registrationId, classId,
    { givenName: " Amina ", familyName: " Otieno ", otherNames: " Wanjiku ", admissionNumber: " ab-2026 " },
  );

  assert.match(records.learner.learnerNumber, /^LRN-[A-F0-9]{32}$/);
  assert.equal(records.learner.givenName, "Amina");
  assert.equal(records.learner.familyName, "Otieno");
  assert.equal(records.learner.otherNames, "Wanjiku");
  assert.equal(records.enrollment.registrationId, registrationId);
  assert.equal(records.enrollment.councilId, councilId);
  assert.equal(records.enrollment.schoolClassId, classId);
  assert.equal(records.enrollment.admissionNumber, "AB-2026");
  assert.equal(result.learner.name, "Amina Wanjiku Otieno");
  assert.equal(records.audit.action, "LEARNER_ENROLLED");
});

test("a learner with an active enrollment cannot be enrolled at a second school", async () => {
  const tx = {
    schoolMembership: { findFirst: async () => adminScope() },
    schoolClass: { findFirst: async () => ({ id: classId, grade: "GRADE_4", academicYear: 2026 }) },
    learner: { findUnique: async () => ({ id: learnerId, learnerNumber: "LRN-EXISTING", givenName: "Amina", otherNames: null, familyName: "Otieno", displayName: null }) },
    schoolLearnerEnrollment: { findFirst: async () => ({ id: "13131313-1313-4313-8313-131313131313", registrationId: "14141414-1414-4414-8414-141414141414" }) },
  };
  const client = { ...tx, $transaction: async (callback) => callback(tx) };
  await assert.rejects(
    new LearnerEnrollmentService({ client }).enroll(
      { accountId, personId }, registrationId, classId, { learnerId },
    ),
    (error) => error instanceof ConflictException && /another school/.test(error.message),
  );
});

test("assigned class teacher can read only their class learner roster", async () => {
  const tx = {
    schoolClass: {
      findFirst: async () => ({
        id: classId, registrationId, councilId, grade: "GRADE_4", academicYear: 2026, streamCode: "A", displayName: "Grade 4 A",
        registration: { school: { id: "22222222-2222-4222-8222-222222222222", name: "Example School" } },
      }),
    },
    schoolMembership: {
      findFirst: async ({ where }) => where.role === "TEACHER" ? { id: "15151515-1515-4515-8515-151515151515" } : null,
    },
    schoolLearnerEnrollment: {
      findMany: async ({ where }) => {
        assert.equal(where.registrationId, registrationId);
        assert.equal(where.schoolClassId, classId);
        return [{
          id: "16161616-1616-4616-8616-161616161616",
          admissionNumber: "A-01",
          enrolledAt: new Date(),
          learner: { id: learnerId, learnerNumber: "LRN-001", givenName: "Amina", otherNames: null, familyName: "Otieno", displayName: null },
        }];
      },
    },
  };
  const result = await new LearnerEnrollmentService({ client: tx }).listClassLearners(
    { accountId, personId }, registrationId, classId,
  );
  assert.equal(result.accessRole, "TEACHER");
  assert.equal(result.learners[0].learnerNumber, "LRN-001");
  assert.equal(result.learners[0].name, "Amina Otieno");
});
