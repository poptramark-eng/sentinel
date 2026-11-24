# Assessment mark moderation

## Purpose

Submitted school mark sheets are immutable by default. A Council Governance Approver may return a complete class sheet for correction after the assessment has been closed. The workflow records the reason, the affected class, the actor, the original mark values and every subsequent revision.

## Lifecycle

1. A Class Teacher enters marks while the assessment is open. Each saved value is revisioned.
2. The Class Teacher submits the entire class sheet. Submission is rejected if any active candidate is missing a mark. Submitted cells are locked.
3. The Council closes the assessment after collecting school submissions.
4. A Council Governance Approver may return one complete class sheet with a substantive reason. The operation changes only that class's submitted cells to `RETURNED`, records one `RETURNED` revision per cell, and reopens the assessment for correction.
5. The assigned Class Teacher sees the return reason beside each affected cell, corrects the values and resubmits the complete class sheet.
6. Other classes' submitted cells remain locked during the correction window. The Council can close the assessment again after review.

## Authorization

- Class Teachers may save and submit marks only for classes to which they have an active Class Teacher assignment.
- Only a Council Governance Approver can return marks for correction.
- A return is scoped to a class in the assessment's Council, grade and academic year.
- The return reason is mandatory (10–2,000 characters).
- Council Administrators manage assessment lifecycle and configuration; they do not gain the governance-return permission merely by being administrators.

## Database enforcement

The PostgreSQL mark trigger rejects edits to submitted marks. The only exception is the controlled `SUBMITTED → RETURNED` transition while the assessment is `CLOSED`, with a substantive reason, unchanged mark value and cleared submission timestamp. Returned values can be edited only after the assessment has been reopened. Returned rows require a non-null mark and reason. Mark revisions remain append-only.

## Result publication boundary

This workflow does not calculate or publish results. Results must not be computed from a closed assessment until all active candidates have a submitted mark for every snapshotted learning area. Publication will use the assessment's frozen curriculum, rubric, candidate and mark-revision history. No grading thresholds or performance descriptors are inferred from unreviewed curriculum source material.
