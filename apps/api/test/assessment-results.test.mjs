import { test } from "node:test";
import assert from "node:assert/strict";
import { AssessmentResultsService } from "../dist/council-assessments/assessment-results.service.js";

const councilId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assessmentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const registrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const areaId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function publicationRow(overrides = {}) {
  return {
    id: "private-result-id",
    candidateId: "private-candidate-id",
    registrationId,
    schoolIdSnapshot: "school-id",
    schoolNameSnapshot: "Example School",
    schoolClassId: "class-id",
    schoolClassNameSnapshot: "Grade 4 · A",
    learnerNumberSnapshot: "LRN-PRIVATE-001",
    learnerNameSnapshot: "Private Learner Name",
    totalMarks: "80",
    maximumMarks: "100",
    percentage: "80",
    rank: 1,
    learningAreas: [{
      id: "private-area-result-id",
      assessmentLearningAreaId: areaId,
      learningAreaCode: "MATH",
      displayLabel: "Mathematics",
      marks: "80",
      maximumMarks: "100",
      percentage: "80",
      sortOrder: 1,
    }],
    ...overrides,
  };
}

test("publication history is Council-scoped, version-ordered and exposes superseded versions", async () => {
  const records = {};
  const client = {
    assessment: { findFirst: async ({ where }) => { records.assessmentWhere = where; return { id: assessmentId }; } },
    assessmentResultPublication: {
      findMany: async ({ where, orderBy, select }) => {
        records.publicationQuery = { where, orderBy, select };
        return [
          { id: "publication-v2", version: 2, status: "PUBLISHED", candidateCount: 4, schoolCount: 2, publishedAt: new Date("2026-11-24T15:00:00Z"), publishedByAccountId: "actor-2", _count: { results: 4 } },
          { id: "publication-v1", version: 1, status: "SUPERSEDED", candidateCount: 4, schoolCount: 2, publishedAt: new Date("2026-11-23T15:00:00Z"), publishedByAccountId: "actor-1", _count: { results: 4 } },
        ];
      },
    },
  };
  const result = await new AssessmentResultsService({ client }).history(councilId, assessmentId);
  assert.deepEqual(records.assessmentWhere, { id: assessmentId, councilId });
  assert.deepEqual(records.publicationQuery.where, { assessmentId, councilId });
  assert.deepEqual(records.publicationQuery.orderBy, { version: "desc" });
  assert.deepEqual(result.publications.map((item) => item.version), [2, 1]);
  assert.equal(result.publications[1].status, "SUPERSEDED");
  assert.equal(result.publications[0].resultCount, 4);
});

test("a historical publication version returns aggregate oversight only, never candidate rows", async () => {
  const records = {};
  const row = publicationRow();
  const client = {
    assessmentResultPublication: {
      findFirst: async ({ where, select }) => {
        records.query = { where, select };
        return {
          id: "publication-v1", version: 1, status: "SUPERSEDED",
          publishedAt: new Date("2026-11-23T15:00:00Z"),
          candidateCount: 1, schoolCount: 1, results: [row],
        };
      },
    },
  };
  const result = await new AssessmentResultsService({ client }).version(councilId, assessmentId, 1);
  assert.deepEqual(records.query.where, { assessmentId, councilId, version: 1 });
  assert.equal(records.query.select.results.select.learnerNameSnapshot, undefined);
  assert.equal(records.query.select.results.select.learnerNumberSnapshot, undefined);
  assert.equal(records.query.select.results.select.candidateId, undefined);
  assert.equal(result.publication.status, "SUPERSEDED");
  assert.equal(result.summary.candidateCount, 1);
  assert.equal(result.schools[0].averagePercentage, 80);
  assert.equal(result.learningAreas[0].averageMarks, 80);
  assert.equal("results" in result, false);
  assert.equal(JSON.stringify(result).includes("Private Learner Name"), false);
  assert.equal(JSON.stringify(result).includes("LRN-PRIVATE-001"), false);
});

test("current published Council result view returns only school, class and learning-area aggregates", async () => {
  const records = {};
  const client = {
    assessmentResultPublication: {
      findFirst: async ({ where, select }) => {
        records.query = { where, select };
        return {
          id: "publication-v2", version: 2, status: "PUBLISHED",
          publishedAt: new Date("2026-11-24T15:00:00Z"),
          candidateCount: 2, schoolCount: 1,
          results: [
            publicationRow({ totalMarks: "80", percentage: "80", rank: 1 }),
            publicationRow({ id: "private-result-id-2", candidateId: "private-candidate-id-2", learnerNumberSnapshot: "LRN-PRIVATE-002", learnerNameSnapshot: "Another Private Learner", totalMarks: "60", percentage: "60", rank: 2, learningAreas: [{
              id: "private-area-result-id-2", assessmentLearningAreaId: areaId,
              learningAreaCode: "MATH", displayLabel: "Mathematics",
              marks: "60", maximumMarks: "100", percentage: "60", sortOrder: 1,
            }] }),
          ],
        };
      },
    },
  };
  const result = await new AssessmentResultsService({ client }).published(councilId, assessmentId);
  assert.deepEqual(records.query.where, { assessmentId, councilId, status: "PUBLISHED" });
  assert.equal(records.query.select.results.select.learnerNameSnapshot, undefined);
  assert.equal(result.summary.candidateCount, 2);
  assert.equal(result.summary.averagePercentage, 70);
  assert.equal(result.schools[0].candidateCount, 2);
  assert.equal(result.classes[0].candidateCount, 2);
  assert.equal(result.learningAreas[0].averageMarks, 70);
  assert.equal("results" in result, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("Private Learner Name"), false);
  assert.equal(serialized.includes("Another Private Learner"), false);
  assert.equal(serialized.includes("LRN-PRIVATE-001"), false);
});

test("result preview exposes aggregates only and does not include candidate identifiers or names", async () => {
  const records = {};
  const client = {
    assessment: {
      findFirst: async ({ where }) => {
        records.where = where;
        return {
          id: assessmentId, name: "Term 2", code: "T2", academicYear: 2026, grade: "GRADE_4",
          learningAreas: [{
            id: areaId, learningAreaCode: "MATH", canonicalName: "Mathematics",
            displayLabel: "Mathematics", sourceLabel: "Mathematics",
            maxMarks: "100", sortOrder: 1,
          }],
          rubricBands: [],
          rubricVersion: {
            versionLabel: "v1", scaleType: "DESCRIPTIVE", scoreUnit: null,
            minScore: null, maxScore: null, rubric: { code: "CBE", name: "CBE rubric" },
          },
          candidates: [{
            id: "private-candidate-id", registrationId,
            schoolClassId: "class-id", schoolIdSnapshot: "school-id",
            schoolNameSnapshot: "Example School",
            learnerNumberSnapshot: "LRN-PRIVATE-003",
            learnerNameSnapshot: "Preview Private Learner",
            classGradeSnapshot: "GRADE_4", classStreamSnapshot: "A",
            marks: [{ assessmentLearningAreaId: areaId, marks: "75", status: "SUBMITTED" }],
          }],
        };
      },
    },
  };
  const result = await new AssessmentResultsService({ client }).preview(councilId, assessmentId);
  assert.deepEqual(records.where, { id: assessmentId, councilId, status: "CLOSED" });
  assert.equal(result.summary.candidateCount, 1);
  assert.equal(result.schools[0].averagePercentage, 75);
  assert.equal("candidates" in result, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("Preview Private Learner"), false);
  assert.equal(serialized.includes("LRN-PRIVATE-003"), false);
});
