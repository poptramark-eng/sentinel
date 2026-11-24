# School class and Class Teacher API

All endpoints require an active access token and CSRF protection. Every route resolves the caller's active `SCHOOL_ADMINISTRATOR` membership for the requested approved `CouncilSchoolRegistration`. The supplied registration/class/membership IDs are selectors, never authorization context.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/school/registrations/:registrationId/classes` | List classes and current Class Teacher assignments in one school registration |
| `POST` | `/api/school/registrations/:registrationId/classes` | Create a school class |
| `POST` | `/api/school/registrations/:registrationId/classes/:classId/class-teacher` | Assign an active school teacher as Class Teacher |
| `DELETE` | `/api/school/registrations/:registrationId/classes/:classId/class-teacher` | End the active Class Teacher assignment |

## Create class

```json
{
  "grade": "GRADE_4",
  "academicYear": 2026,
  "streamCode": "A",
  "displayName": "Grade 4 East"
}
```

`grade` must be one of `GRADE_1` through `GRADE_9`. `academicYear` is an integer between 2000 and 2100. `streamCode` is normalized to uppercase; it defaults to `MAIN`. The unique class key is `(registration, academicYear, grade, streamCode)`. A duplicate returns `409 Conflict`.

## Assign Class Teacher

```json
{ "membershipId": "<active-teacher-school-membership-uuid>" }
```

The selected membership must be an active `TEACHER` membership in the same registration and Council, with an active account. A class may have only one active Class Teacher. Reassignment requires ending the current assignment first. Assignment and end actions are recorded in the immutable audit stream.

## Capability boundary

Class Teacher assignment is class-scoped and grants class-coordination and assigned-roster access. It does not grant marks entry, school administration, access to other classes or result-governance permissions. Subject Teacher assignment is a separate learning-area-scoped capability described below. No learner enrollment or learner personal data is created by these assignment endpoints.

## Subject Teacher assignments

Subject Teacher assignments are class-scoped and tied to a specific enabled `CouncilGradeLearningArea` from the Council's currently effective published curriculum. They do not create a new school membership or global role. The school administrator selects an existing active teacher membership and one grade learning-area mapping. A class can have only one active Subject Teacher assignment per learning area; the same teacher may be assigned to multiple learning areas or classes.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/school/registrations/:registrationId/classes/:classId/subject-teachers` | List currently assignable curriculum learning areas and their active Subject Teacher assignments |
| `POST` | `/api/school/registrations/:registrationId/classes/:classId/subject-teachers` | Assign an active school teacher to one enabled learning area |
| `DELETE` | `/api/school/registrations/:registrationId/classes/:classId/subject-teachers/:assignmentId` | End an assignment without deleting its history |

The POST body is `{ "membershipId": "...", "councilGradeLearningAreaId": "..." }`. The API verifies the active School Administrator membership, approved school and Council, class grade, active teacher membership, effective Council curriculum selection, published curriculum version, and enabled grade-to-learning-area mapping in a serializable transaction. Database composite foreign keys and a partial unique index enforce mapping ownership and one active assignment per class/learning area. Every assignment and end operation is audited.

A Class Teacher does not bypass learning-area assignments. A Subject Teacher can read, save and submit marks only for the explicitly assigned learning area. The mark-sheet GET and submit routes accept `learningAreaId` (the assessment's learning-area snapshot ID) to scope the operation. A Subject Teacher must supply `learningAreaId`; an unqualified mark-sheet request is denied.
