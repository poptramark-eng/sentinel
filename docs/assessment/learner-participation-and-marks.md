# Learner participation and marks management

## Learner identity

A learner is a global education identity, not a login account. Sentinel creates a system-wide learner number when a new learner is registered. The identifier is for record linkage and must never be treated as a password, authentication token or proof of identity.

A learner can have historical school enrolments, but the database permits only one active school enrolment at a time. An enrolment is attached to a school registration, Council and class through composite foreign keys. Transfers, withdrawals and completion end an enrolment rather than deleting it. If the learner is already on a scheduled, open or closed assessment roster, ending the enrolment also withdraws that candidate from the affected assessment while retaining the candidate snapshot and audit history. A later school can reuse the existing global learner identity after the previous active enrolment has ended.

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

- An active Subject Teacher can access only the learning area assigned to them for that class. Class Teacher coordination does not bypass subject-level marks assignments; a teacher who holds both capabilities still receives marks access only for explicitly assigned learning areas.
- Marks are validated against the assessment's snapshotted maximum and decimal precision.
- Marks may be saved only while the assessment is OPEN.
- A Subject Teacher learning-area submission requires a mark for every active candidate in that class.
- Submission records the submitting account and timestamp, creates append-only revision records and locks submitted marks.
- Submitted marks cannot be overwritten through the normal entry endpoint. A Council Governance Approver can return a complete class or one learning area for reasoned correction; each Subject Teacher can then correct and resubmit only their assigned learning area.

## API routes

| Method | Route | Access and purpose |
| --- | --- | --- |
| GET | `/school/registrations/:registrationId/learners/search?q=` | School Administrator; search existing global learner identities |
| GET | `/school/registrations/:registrationId/classes/:classId/learners` | School Administrator or assigned Class Teacher; read class roster |
| POST | `/school/registrations/:registrationId/classes/:classId/learners` | School Administrator; create/reuse learner identity and enrol |
| PATCH | `/school/registrations/:registrationId/learners/:enrollmentId/end` | School Administrator; end an enrolment with a reasoned lifecycle state |
| GET | `/school/teaching/classes` | Teacher; list active assigned classes and their open assessments |
| GET | `/school/registrations/:registrationId/classes/:classId/assessments/:assessmentId/marks` | Assigned Subject Teacher with `?learningAreaId=`; read only the assigned learning area |
| PUT | `/school/registrations/:registrationId/classes/:classId/assessments/:assessmentId/marks` | Assigned Subject Teacher for the mark's learning area; save one mark |
| POST | `/school/registrations/:registrationId/classes/:classId/assessments/:assessmentId/marks/submit` | Assigned Subject Teacher with `?learningAreaId=`; submit only the assigned learning area |

## Not yet implemented

The implemented workflow does not yet provide bulk Excel import, a guided learner-transfer wizard, analytics dashboards, comprehensive report exports, or controlled post-publication correction and supersession. Result computation must use the immutable assessment candidate and learning-area snapshots, not the current live class roster.

## Subject Teacher mark access

A Subject Teacher assignment is attached to a school class and a specific Council-approved curriculum learning-area mapping. It is not implied by the global TEACHER membership. For an open assessment, the teacher's assignment must match the assessment learning-area snapshot's `councilGradeLearningAreaId`. Subject Teachers can read only that learning-area column, save only its mark cells, and submit only that learning area's marks across the active class candidates. Class Teachers retain class-coordination and assigned-roster access; marks permissions remain subject-assignment scoped. All marks remain subject to the same score maximum, decimal precision, revision history and immutable submission rules.
