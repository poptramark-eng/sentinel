# Assessment mark moderation

## Purpose

Submitted school mark sheets are immutable by default. A Council Governance Approver may return either a complete class sheet or one learning area within a class for correction after the assessment has been closed. The workflow records the reason, the affected class/learning area, the actor, the original mark values and every subsequent revision.

## Lifecycle

1. Each assigned Subject Teacher enters marks only for their assigned learning area while the assessment is open. Each saved value is revisioned.
2. A Subject Teacher submits their learning area for the class. Submission is rejected if any active candidate is missing a mark for that area. Submitted cells are locked.
3. The School Administrator reviews school-wide readiness and performs the final registration-scoped submission. Sentinel records an immutable submission snapshot and version.
4. The Council can close the assessment only after every participating school has submitted and every active candidate has a complete submitted mark set.
5. A Council Governance Approver may return one complete class sheet or one learning area within a class with a substantive reason. A class-level return changes all submitted cells for that class to `RETURNED`; a learning-area return changes only that area's cells. Both operations record one `RETURNED` revision per affected cell and reopen the assessment for correction.
6. For either return type, each assigned Subject Teacher sees the return reason beside their affected learning-area cells, corrects those values and resubmits only their assigned learning area. A class-level return therefore requires the affected Subject Teachers to complete their own learning-area corrections; Class Teacher coordination does not grant mark-editing permissions.
7. Unaffected subject marks and other classes' submitted cells remain locked during a learning-area correction window. After all affected marks are corrected and resubmitted, the School Administrator submits the next immutable school version. The Council can close the assessment again only after every school is submitted.
8. If governance returns marks after results have already been released, the same serializable transaction first transitions the current publication from `PUBLISHED` to `SUPERSEDED`, then returns the selected marks and school submission, and reopens the assessment. The result rows and learning-area rows of the superseded publication are never updated or deleted. The assessment cannot be reopened from `RELEASED` unless the active publication has been superseded and at least one mark has been returned.

## Authorization

- Class Teachers coordinate class readiness and may read the assigned learner roster; this assignment does not grant marks entry.
- Only a Council Governance Approver can return marks for correction.
- A return is scoped to a class in the assessment's Council, grade and academic year. A learning-area return must reference an area snapshotted on that assessment.
- One correction window may contain multiple class/learning-area returns across participating schools. A school submission remains `RETURNED` until its School Administrator submits the next complete version.
- The return reason is mandatory (10–2,000 characters). A school submission is returned in the same transaction as the affected mark rows.
- Council Administrators manage assessment lifecycle and configuration; they do not gain the governance-return permission merely by being administrators.

## Database enforcement

The PostgreSQL mark trigger rejects edits to submitted marks. The only exception is the controlled `SUBMITTED → RETURNED` transition while the assessment is `CLOSED`, during an active `OPEN` correction window, or while `RELEASED` after its active publication has been superseded. Every return requires a substantive reason, an unchanged mark value and a cleared submission timestamp. Returned values can be edited only after the assessment has been reopened. Returned rows require a non-null mark and reason. Mark revisions remain append-only. The publication trigger permits only `PUBLISHED → SUPERSEDED` for a released assessment and rejects changes to every other publication field; result snapshots remain immutable.

## Result preview and publication

A closed assessment can be previewed only when every active candidate has a submitted mark for every snapshotted learning area. The result engine uses the frozen candidate, school, learning-area and rubric snapshots attached to the assessment. Withdrawn candidates are excluded; later changes to live learner, school or curriculum records do not alter the result inputs.

The preview calculates learning-area percentages, candidate totals, overall percentages, competition ranks (equal totals share a rank), school averages, and highest/lowest/average performance. Numeric classification is applied only when the published rubric explicitly declares a numeric scale whose score unit and range match either the assessment percentage scale or the total raw-mark scale. Otherwise the result remains unclassified; no thresholds or descriptors are inferred. The configured maximum is included in the final rubric band.

Routes:
- GET /councils/:councilId/assessments/:assessmentId/results/preview — Council rubric readers can inspect a closed assessment preview.
- POST /councils/:councilId/assessments/:assessmentId/classes/:classId/return-marks — Council Governance Approver only; returns all submitted marks for one class.
- POST /councils/:councilId/assessments/:assessmentId/classes/:classId/learning-areas/:learningAreaId/return-marks — Council Governance Approver only; returns only one learning area for one class.
- POST /councils/:councilId/assessments/:assessmentId/results/publish — Council Governance Approver only; publishes and releases the assessment in one serializable transaction.
- GET /councils/:councilId/assessments/:assessmentId/results — Council rubric readers can retrieve the current immutable published snapshot.
- GET /councils/:councilId/assessments/:assessmentId/results/history — Council rubric readers can inspect publication versions and lifecycle status.
- GET /councils/:councilId/assessments/:assessmentId/results/versions/:version — Council rubric readers can retrieve a specific immutable historical snapshot, including superseded versions.

Publication stores a versioned result publication, one immutable result per active candidate, and the learning-area result rows. It records an audit event and transitions the assessment to RELEASED. Database constraints reject incomplete publication snapshots and protect published result records. A published snapshot is read as stored, never recomputed from current live records. A governance return after release supersedes the current publication without deleting or rewriting its result records. After corrected marks and school submissions are complete, the Council closes the assessment and publishes the next monotonically increasing version. Only one publication per assessment may be `PUBLISHED`; older versions remain `SUPERSEDED` and retrievable through the history/version endpoints. No in-place editing of published result data is supported.
