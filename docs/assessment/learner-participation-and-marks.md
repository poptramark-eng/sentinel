# Learner participation and marks management

## Learner identity

A learner is a global education identity, not a login account. Sentinel creates a system-wide learner number when a new learner is registered. The identifier is for record linkage and must never be treated as a password, authentication token or proof of identity.

A learner can have historical school enrolments, but the database permits only one active school enrolment at a time. An enrolment is attached to a school registration, Council and class through composite foreign keys. Transfers, withdrawals and completion end an enrolment rather than deleting it. A later school can reuse the existing global learner identity after the previous active enrolment has ended.

The initial learner profile deliberately collects only names and system/school identifiers. Additional demographic fields require a documented reporting purpose, data-minimisation review and retention rules.

## School workflows

- An active School Administrator at an approved, active school can search for an existing learner identity, create a new identity and enrol the learner in an active class.
- Existing identities are reused by their internal learner ID; duplicate active enrolments are rejected.
- An active assigned Class Teacher can read the roster for the class they coordinate.
- Learners do not create accounts and cannot authenticate using the learner number.
- Enrolment end states are `TRANSFERRED`, `WITHDRAWN` and `COMPLETED`; the original enrolment row and its history remain.

## Assessment participation snapshot

When a Council Administrator schedules an assessment, Sentinel:

1. Selects active learner enrolments in approved, active Council schools.
2. Restricts the roster to the assessment's grade and academic year.
3. Rejects a duplicate active learner identity appearing in more than one participating school.
4. Copies learner number, learner name, grade, stream, enrolment, school registration and class references into immutable assessment candidates.
5. Creates an initially empty mark row for each candidate and each assessment learning-area snapshot.
6. Locks the candidate roster when the assessment leaves DRAFT.

Late enrolments or class changes do not silently alter a scheduled assessment roster. A later, explicit roster-amendment workflow would need its own authorization, audit and snapshot rules.

## Mark entry and submission

- Only the active Class Teacher assigned to a candidate's class can access that class's open assessment mark sheet.
- Marks are validated against the assessment's snapshotted maximum and decimal precision.
- Marks may be saved only while the assessment is OPEN.
- A class submission requires every candidate/learning-area cell to contain a mark.
- Submission records the submitting account and timestamp, creates append-only revision records and locks submitted marks.
- Submitted marks cannot be overwritten through the normal entry endpoint. A formal correction/reopening workflow is a separate future milestone.

## API routes

| Method | Route | Access and purpose |
| --- | --- | --- |
| GET | `/school/registrations/:registrationId/learners/search?q=` | School Administrator; search existing global learner identities |
| GET | `/school/registrations/:registrationId/classes/:classId/learners` | School Administrator or assigned Class Teacher; read class roster |
| POST | `/school/registrations/:registrationId/classes/:classId/learners` | School Administrator; create/reuse learner identity and enrol |
| PATCH | `/school/registrations/:registrationId/learners/:enrollmentId/end` | School Administrator; end an enrolment with a reasoned lifecycle state |
| GET | `/school/teaching/classes` | Teacher; list active assigned classes and their open assessments |
| GET | `/school/registrations/:registrationId/classes/:classId/assessments/:assessmentId/marks` | Assigned Class Teacher; read open class mark sheet |
| PUT | `/school/registrations/:registrationId/classes/:classId/assessments/:assessmentId/marks` | Assigned Class Teacher; save one mark |
| POST | `/school/registrations/:registrationId/classes/:classId/assessments/:assessmentId/marks/submit` | Assigned Class Teacher; submit all class marks |

## Not yet implemented

This milestone does not yet provide bulk Excel import, learner transfer wizard, subject-teacher assignment, mark moderation/return/correction, assessment reopening, result aggregation, ranking, result publication, or report exports. Result computation must use the immutable assessment candidate and learning-area snapshots, not the current live class roster.
