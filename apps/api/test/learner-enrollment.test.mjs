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

test("Class Teacher assignment alone cannot read learner rosters", async () => {
  const membershipQueries = [];
  let rosterRead = false;
  const tx = {
    schoolClass: {
      findFirst: async () => ({
        id: classId, registrationId, councilId, grade: "GRADE_4", academicYear: 2026, streamCode: "A", displayName: "Grade 4 A",
        registration: { school: { id: "22222222-2222-4222-8222-222222222222", name: "Example School" } },
      }),
    },
    schoolMembership: {
      findFirst: async ({ where }) => {
        membershipQueries.push(where);
        return where.role === "TEACHER" ? { id: "15151515-1515-4515-8515-151515151515" } : null;
      },
    },
    schoolLearnerEnrollment: {
      findMany: async () => { rosterRead = true; return []; },
    },
  };
  await assert.rejects(
    new LearnerEnrollmentService({ client: tx }).listClassLearners(
      { accountId, personId }, registrationId, classId,
    ),
    (error) => error.status === 403,
  );
  assert.equal(membershipQueries.length, 1);
  assert.equal(membershipQueries[0].role, "SCHOOL_ADMINISTRATOR");
  assert.equal(rosterRead, false);
});


test("ending a learner enrollment preserves the row and records a transfer reason", async () => {
  const records = {};
  const tx = {
    schoolMembership: { findFirst: async () => adminScope() },
    schoolLearnerEnrollment: {
      findFirst: async () => ({
        id: "20202020-2020-4020-8020-202020202020",
        learnerId,
        schoolClassId: classId,
        learner: { learnerNumber: "LRN-TRANSFER-001" },
      }),
      update: async ({ data }) => { records.updated = data; return { id: "20202020-2020-4020-8020-202020202020", ...data }; },
    },
    assessmentCandidate: { updateMany: async ({ where, data }) => { records.withdrawal = { where, data }; return { count: 2 }; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  const client = { ...tx, $transaction: async (callback) => callback(tx) };
  const result = await new LearnerEnrollmentService({ client }).endEnrollment(
    { accountId, personId }, registrationId,
    "20202020-2020-4020-8020-202020202020", "TRANSFERRED",
    "Learner has moved to another registered school.",
  );
  assert.equal(records.updated.status, "TRANSFERRED");
  assert.ok(records.updated.endedAt instanceof Date);
  assert.equal(records.audit.action, "LEARNER_ENROLLMENT_ENDED");
  assert.equal(records.audit.reason, "Learner has moved to another registered school.");
  assert.equal(records.withdrawal.data.status, "WITHDRAWN");
  assert.deepEqual(records.withdrawal.where.assessment.is.status.in, ["SCHEDULED", "OPEN", "CLOSED"]);
  assert.equal(records.audit.metadata.withdrawnAssessmentCandidates, 2);
  assert.equal(result.status, "TRANSFERRED");
});

test("CSV learner import previews without writes and commits all rows atomically", async () => {
  const records = { learners: [], enrollments: [], audits: [] };
  let nextId = 0;
  const tx = {
    schoolMembership: { findFirst: async () => adminScope() },
    schoolClass: { findFirst: async () => ({ id: classId, grade: "GRADE_4", academicYear: 2026 }) },
    learner: {
      findFirst: async () => null,
      create: async ({ data }) => { const value = { id: `learner-${++nextId}`, ...data }; records.learners.push(value); return value; },
    },
    schoolLearnerEnrollment: {
      findFirst: async () => null,
      create: async ({ data }) => { const value = { id: `enrollment-${++nextId}`, ...data }; records.enrollments.push(value); return value; },
    },
    auditEvent: { create: async ({ data }) => { records.audits.push(data); return data; } },
  };
  const client = { ...tx, $transaction: async (callback, options) => { assert.equal(options.isolationLevel, "Serializable"); return callback(tx); } };
  const service = new LearnerEnrollmentService({ client });
  const csv = "learnerNumber,givenName,otherNames,familyName,admissionNumber\nKCBE-001,Amina,Wanjiku,Otieno,A-001\nKCBE-002,Peter,,Mwangi,A-002";
  const preview = await service.importLearners({ accountId, personId }, registrationId, classId, csv, true);
  assert.equal(preview.totalRows, 2);
  assert.equal(preview.validRows, 2);
  assert.equal(preview.created, 2);
  assert.equal(records.learners.length, 0);
  assert.equal(records.enrollments.length, 0);

  const result = await service.importLearners({ accountId, personId }, registrationId, classId, csv, false);
  assert.equal(result.enrolled, 2);
  assert.equal(result.created, 2);
  assert.equal(records.learners.length, 2);
  assert.equal(records.enrollments.length, 2);
  assert.equal(records.audits.length, 2);
  assert.equal(records.enrollments[0].schoolClassId, classId);
  assert.equal(records.audits[0].metadata.source, "CSV_IMPORT");
});

test("CSV learner import rejects duplicate identifiers and malformed rows before writes", async () => {
  const client = { schoolMembership: { findFirst: async () => adminScope() } };
  const service = new LearnerEnrollmentService({ client });
  const result = await service.importLearners(
    { accountId, personId }, registrationId, classId,
    "learnerNumber,givenName,familyName\nKCBE-001,Amina,Otieno\nKCBE-001,Peter,Mwangi",
    true,
  );
  assert.equal(result.validRows, 1);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].message, /Duplicate learner number/);
});
