import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { SchoolAssessmentSubmissionService } from "../dist/school-classes/school-assessment-submission.service.js";

const actor = { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const registrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const councilId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const assessmentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const candidateId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const areaId = "11111111-1111-4111-8111-111111111111";
const classId = "22222222-2222-4222-8222-222222222222";
const markId = "33333333-3333-4333-8333-333333333333";

function membership() {
  return { id: "44444444-4444-4444-8444-444444444444", registrationId, councilId, registration: { school: { name: "Example School" }, council: { name: "Example Council" } } };
}
function candidate(markOverrides = {}) {
  return {
    id: candidateId, schoolClassId: classId,
    schoolClass: { grade: "GRADE_4", academicYear: 2026, streamCode: "MAIN", displayName: null },
    marks: [{ id: markId, assessmentLearningAreaId: areaId, marks: 72, status: "SUBMITTED", updatedAt: new Date("2026-11-24T08:00:00Z"), ...markOverrides }],
  };
}
function clientFor({ candidates = [candidate()], existing = null, records = {} } = {}) {
  const client = {
    schoolMembership: { findFirst: async ({ where }) => where.role === "SCHOOL_ADMINISTRATOR" ? membership() : null },
    assessment: { findFirst: async () => ({ id: assessmentId, councilId, name: "Term 2", code: "T2", grade: "GRADE_4", academicYear: 2026, status: "OPEN", opensAt: null, closesAt: null }) },
    assessmentLearningArea: { findMany: async () => [{ id: areaId, learningAreaCode: "MATH", canonicalName: "Mathematics", displayLabel: null, maxMarks: 100, sortOrder: 1 }] },
    assessmentCandidate: { findMany: async () => candidates },
    assessmentSchoolSubmission: {
      findUnique: async () => existing,
      create: async ({ data }) => { records.created = data; return { id: "55555555-5555-4555-8555-555555555555", version: data.version, status: data.status, submittedAt: data.submittedAt }; },
      update: async ({ data }) => { records.updated = data; return { id: existing.id, version: data.version, status: data.status, submittedAt: data.submittedAt }; },
    },
    assessmentSchoolSubmissionVersion: { create: async ({ data }) => { records.version = data; return data; } },
    auditEvent: { create: async ({ data }) => { records.audit = data; return data; } },
  };
  client.$transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    return callback(client);
  };
  return { client, records };
}

test("School Administrator final submission snapshots every submitted mark and is auditable", async () => {
  const { client, records } = clientFor();
  const result = await new SchoolAssessmentSubmissionService({ client }).submitSchoolAssessment(actor, registrationId, assessmentId);
  assert.equal(result.success, true);
  assert.equal(result.version, 1);
  assert.equal(records.created.status, "SUBMITTED");
  assert.equal(records.created.candidateCount, 1);
  assert.equal(records.created.markCount, 1);
  assert.equal(records.version.snapshot[0].candidateId, candidateId);
  assert.equal(records.version.snapshot[0].marks, "72");
  assert.equal(records.audit.action, "SCHOOL_ASSESSMENT_SUBMITTED");
});

test("School submission rejects incomplete learning-area marks", async () => {
  const { client } = clientFor({ candidates: [candidate({ marks: null, status: "DRAFT" })] });
  await assert.rejects(
    new SchoolAssessmentSubmissionService({ client }).submitSchoolAssessment(actor, registrationId, assessmentId),
    (error) => error instanceof ConflictException && /submission is blocked/.test(error.message),
  );
});

test("School submission retries are idempotent", async () => {
  const { client, records } = clientFor({ existing: { id: "66666666-6666-4666-8666-666666666666", status: "SUBMITTED", version: 1 } });
  const result = await new SchoolAssessmentSubmissionService({ client }).submitSchoolAssessment(actor, registrationId, assessmentId);
  assert.equal(result.idempotent, true);
  assert.equal(result.version, 1);
  assert.equal(records.version, undefined);
});

test("a returned school submission creates a new immutable submission version", async () => {
  const existing = { id: "66666666-6666-4666-8666-666666666666", status: "RETURNED", version: 1 };
  const { client, records } = clientFor({ existing });
  const result = await new SchoolAssessmentSubmissionService({ client }).submitSchoolAssessment(actor, registrationId, assessmentId);
  assert.equal(result.version, 2);
  assert.equal(records.updated.version, 2);
  assert.equal(records.updated.returnedReason, null);
  assert.equal(records.version.version, 2);
  assert.equal(records.audit.action, "SCHOOL_ASSESSMENT_RESUBMITTED");
});

test("teachers cannot perform final school submission", async () => {
  const { client } = clientFor();
  client.schoolMembership.findFirst = async () => null;
  await assert.rejects(
    new SchoolAssessmentSubmissionService({ client }).submitSchoolAssessment(actor, registrationId, assessmentId),
    (error) => error instanceof ForbiddenException,
  );
});
