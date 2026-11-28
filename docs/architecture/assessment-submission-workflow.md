# Assessment submission, approval and publication

**Status:** Implemented in the Supabase schema and Next.js workspace; end-to-end verification still requires a non-production Supabase project with synthetic fixtures and the child-data gate enabled.

## State machine

```text
open
  └─ assigned class teacher or School Administrator submits complete class
       ↓
    submitted
       ├─ School Administrator reviews → reviewed
       └─ School Administrator returns with reason → open
             (new submission creates a new version)
reviewed
  ├─ School Administrator approves → approved
  └─ School Administrator returns with reason → open
approved
  ├─ School Administrator publishes → published
  └─ School Administrator returns with reason → open
published
  └─ terminal; published report snapshot is immutable
```

## Invariants

- Submission is scoped to the assessment's school, class and academic year.
- Only the assigned class teacher or a School Administrator can submit the class.
- Submission requires at least one active learner, at least one learning area, and one score for every active learner × assessment learning-area pair.
- Submission captures an immutable JSON snapshot of assessment metadata, class, learning areas, learner identifiers/names and marks.
- Each re-submission after a return increments the version. Older returned snapshots remain retained for audit.
- Mark and assessment-learning-area writes are blocked once an assessment leaves `open`. Returning an assessment for correction reopens it; score corrections still require a reason and create revision history.
- Only a School Administrator can review, approve, return or publish.
- Reports show only published versions and read from the stored snapshot, not mutable live enrolments or marks.
- Authenticated clients have read-only table privileges for assessments, assessment-learning-area links, submissions, scores, score revisions and audit events. Writes go through scoped database functions.
- Public RPC wrappers for the lifecycle are SECURITY INVOKER; the privileged implementations live in the unexposed `private` schema and enforce actor, role, school and state checks.
- All child-data reads and writes remain behind both the Next.js environment gate and the database gate. The hosted database gate remains disabled.

## Reports and exports

- School Administrators can view the published reports register.
- A report displays the frozen learner/learning-area score matrix, per-learner average and class average.
- CSV export includes a UTF-8 BOM and quoted cells for Excel compatibility.
- The browser print stylesheet supports printing or saving the report as PDF.
- No rubric boundaries or performance levels are inferred; the report displays numeric marks and averages only.

## Verification boundary

The active hosted Supabase project has no Auth users, schools, learners or assessments. The workflow schema and functions were applied and catalog/privilege checks passed, but a complete transition test cannot be run against the production project without creating synthetic user/school/learner data. Do that only in a separate non-production Supabase environment with synthetic fixtures and the database gate enabled.

- The submission snapshot also freezes the learner's recorded gender value. Reports show the recorded categories and a separate not-recorded count; the CSV includes gender. No categories are inferred or silently recoded.
- In production, the Next.js proxy redirects the legacy council, platform, school-registration, school-teaching, invitation and prototype routes to the single-school Supabase workspace/login. Those routes remain available only in non-production for reference.
- Initial school bootstrap is restricted to the earliest account provisioned in Supabase Auth. The first School Administrator must be created and verified before teacher accounts; public registration remains disabled.

## RPC security boundary

- Six existing tenant-scoped privileged operations were moved from the exposed `public` schema into the unexposed `private` schema: teacher assignment, initial school bootstrap, academic-year setup, assessment creation, learner enrolment and mark entry.
- The corresponding `public` PostgREST RPC names remain as thin `SECURITY INVOKER` wrappers to preserve the existing application contract.
- Authenticated users can execute the wrappers and the private implementations only; anonymous users cannot execute either. The `private` schema remains unavailable as an exposed PostgREST schema.
- The Supabase Security Advisor returned zero security lints after this change. The privileged implementations still enforce actor identity, school scope, role and operation-specific validation.

- Authenticated clients have read-only access to `audit_events` and `assessment_score_revisions`. Direct INSERT policies and grants were removed so users cannot forge audit events or score-correction history; scoped SECURITY DEFINER functions remain the only write path.
