# Assessment mark moderation

## Purpose

Submitted school mark sheets are immutable by default. A Council Governance Approver may return either a complete class sheet or one learning area within a class for correction after the assessment has been closed. The workflow records the reason, the affected class/learning area, the actor, the original mark values and every subsequent revision.

## Lifecycle

1. A Class Teacher enters marks while the assessment is open. Each saved value is revisioned.
2. The Class Teacher submits the entire class sheet. Submission is rejected if any active candidate is missing a mark. Submitted cells are locked.
3. The Council closes the assessment after collecting school submissions.
4. A Council Governance Approver may return one complete class sheet or one learning area within a class with a substantive reason. A class-level return changes all submitted cells for that class to `RETURNED`; a learning-area return changes only that area's cells. Both operations record one `RETURNED` revision per affected cell and reopen the assessment for correction.
5. For a learning-area return, the assigned Subject Teacher sees the return reason beside the affected cells, corrects those values and resubmits only that learning area. For a class-level return, the current class mark-sheet workflow supports correction and resubmission of the complete class sheet.
6. Unaffected subject marks and other classes' submitted cells remain locked during a learning-area correction window. The Council can close the assessment again after review.

## Authorization

- Class Teachers may save and submit marks only for classes to which they have an active Class Teacher assignment.
- Only a Council Governance Approver can return marks for correction.
- A return is scoped to a class in the assessment's Council, grade and academic year. A learning-area return must reference an area snapshotted on that assessment.
- The return reason is mandatory (10–2,000 characters).
- Council Administrators manage assessment lifecycle and configuration; they do not gain the governance-return permission merely by being administrators.

## Database enforcement

The PostgreSQL mark trigger rejects edits to submitted marks. The only exception is the controlled `SUBMITTED → RETURNED` transition while the assessment is `CLOSED`, with a substantive reason, unchanged mark value and cleared submission timestamp. Returned values can be edited only after the assessment has been reopened. Returned rows require a non-null mark and reason. Mark revisions remain append-only.

## Result preview and publication

A closed assessment can be previewed only when every active candidate has a submitted mark for every snapshotted learning area. The result engine uses the frozen candidate, school, learning-area and rubric snapshots attached to the assessment. Withdrawn candidates are excluded; later changes to live learner, school or curriculum records do not alter the result inputs.

The preview calculates learning-area percentages, candidate totals, overall percentages, competition ranks (equal totals share a rank), school averages, and highest/lowest/average performance. Numeric classification is applied only when the published rubric explicitly declares a numeric scale whose score unit and range match either the assessment percentage scale or the total raw-mark scale. Otherwise the result remains unclassified; no thresholds or descriptors are inferred. The configured maximum is included in the final rubric band.

Routes:
- GET /councils/:councilId/assessments/:assessmentId/results/preview — Council rubric readers can inspect a closed assessment preview.
- POST /councils/:councilId/assessments/:assessmentId/classes/:classId/return-marks — Council Governance Approver only; returns all submitted marks for one class.
- POST /councils/:councilId/assessments/:assessmentId/classes/:classId/learning-areas/:learningAreaId/return-marks — Council Governance Approver only; returns only one learning area for one class.
- POST /councils/:councilId/assessments/:assessmentId/results/publish — Council Governance Approver only; publishes and releases the assessment in one serializable transaction.
- GET /councils/:councilId/assessments/:assessmentId/results — Council rubric readers can retrieve the immutable published snapshot.

Publication stores a versioned result publication, one immutable result per active candidate, and the learning-area result rows. It records an audit event and transitions the assessment to RELEASED. Database constraints reject incomplete publication snapshots and protect published result records. A published snapshot is read as stored, never recomputed from current live records. Corrections after publication require a separately controlled supersession and republication process; no in-place editing is supported.
