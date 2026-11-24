# Assessment configuration and rubric governance

## Scope

Assessment configuration is Council-scoped. It is separate from learner enrollment, marks entry, result computation and report publication. This milestone establishes the governed configuration foundation and the Council-facing setup screens.

## Curriculum source and snapshots

- A Council must have one active selection of a published curriculum version before creating an assessment.
- The assessment grade is selected explicitly.
- Only learning areas mapped to that grade, enabled by the Council, marked assessment-eligible, source-reviewed and assigned a resolved optionality can be selected.
- The assessment stores a snapshot of the selected curriculum version and copies each chosen learning area's code, canonical name, source label, Council display label, maximum marks, decimal precision and ordering.
- Later changes to the Council's active curriculum configuration do not rewrite an existing assessment's snapshot.
- Snapshot rows and assessment configuration are database-locked once the assessment leaves DRAFT.

## Rubric governance

A Council rubric has independently versioned definitions. Supported scale types are:

- `NUMERIC_BANDS`: numeric score range with lower-inclusive, upper-exclusive bands. Bands may not overlap.
- `PERFORMANCE_LEVELS`: ordered descriptors without numeric thresholds.
- `DESCRIPTIVE`: ordered descriptors without numeric thresholds.

Rubric versions follow `DRAFT -> IN_REVIEW -> PUBLISHED -> RETIRED`, with a return-to-draft path from independent review when changes are required. Publication requires a reviewer different from the author. Published and retired versions, including their bands, are immutable.

Sentinel does not infer or invent official CBE grade boundaries. Rubric criteria must be supplied and approved by the Council's governance process.

## Assessment lifecycle

The database enforces:

- `DRAFT -> SCHEDULED -> OPEN -> CLOSED -> RELEASED`
- `DRAFT -> CANCELLED` and `SCHEDULED -> CANCELLED`

Scheduling requires a future opening time and a later closing time. An assessment can be opened only within its scheduled window. Scheduling requires at least one learning-area snapshot and one rubric-band snapshot. Configuration and snapshots are locked after the assessment leaves DRAFT.

## API surface

All routes are nested under `/api/councils/:councilId` and require an authenticated Council-scoped actor.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/rubrics` | List Council rubrics and versions |
| GET | `/rubrics/review-queue` | List rubric versions awaiting independent approval (Governance Approver) |
| POST | `/rubrics` | Create a rubric and its initial draft version |
| POST | `/rubrics/:rubricId/versions` | Create a later draft version |
| POST | `/rubrics/versions/:versionId/bands` | Add a band to a draft version |
| POST | `/rubrics/versions/:versionId/submit-review` | Submit a version for independent review |
| POST | `/rubrics/versions/:versionId/return-for-changes` | Return a submitted version to its author with a required reason |
| POST | `/rubrics/versions/:versionId/publish` | Publish after governance approval |
| GET | `/assessments` | List Council assessments and snapshots |
| POST | `/assessments` | Create an assessment draft and freeze its source selections |
| POST | `/assessments/:assessmentId/schedule` | Schedule a draft |
| POST | `/assessments/:assessmentId/open` | Open within the scheduled window |
| POST | `/assessments/:assessmentId/close` | Close an open assessment |

Council Administrator membership is required for routine configuration and assessment operations. Publishing a rubric requires an active Council Governance Approver membership and an account different from the rubric author.

## Current UI

- `/council/:councilId/curriculum`: select and configure the Council curriculum.
- `/council/:councilId/rubrics`: author rubric versions and submit them for independent review.
- `/council/:councilId/rubric-review`: independent Governance Approver review queue and publication action.
- `/council/:councilId/assessments`: create grade-specific assessment snapshots, schedule them, open them and close them.

## Deliberate boundaries

This milestone does not yet implement learner assignment to assessments, marks capture, score validation at entry, moderation, results aggregation, result release, exports or report generation. Those features must consume the immutable assessment snapshots rather than live curriculum or rubric configuration.
