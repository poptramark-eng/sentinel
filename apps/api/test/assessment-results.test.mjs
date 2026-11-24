import { test } from "node:test";
import assert from "node:assert/strict";
import { AssessmentResultsService } from "../dist/council-assessments/assessment-results.service.js";

const councilId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assessmentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

test("a historical publication version returns its stored snapshot and status without recomputation", async () => {
  const records = {};
  const snapshot = [{ id: "result-1", rank: 1, totalMarks: "90", learningAreas: [{ id: "area-result-1", marks: "90" }] }];
  const client = {
    assessmentResultPublication: {
      findFirst: async ({ where, include }) => {
        records.query = { where, include };
        return { id: "publication-v1", version: 1, status: "SUPERSEDED", publishedAt: new Date("2026-11-23T15:00:00Z"), candidateCount: 1, schoolCount: 1, results: snapshot };
      },
    },
  };
  const result = await new AssessmentResultsService({ client }).version(councilId, assessmentId, 1);
  assert.deepEqual(records.query.where, { assessmentId, councilId, version: 1 });
  assert.deepEqual(result.results, snapshot);
  assert.equal(result.publication.status, "SUPERSEDED");
});
