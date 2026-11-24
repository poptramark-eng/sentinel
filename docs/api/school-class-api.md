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

This first assignment slice supports `CLASS_TEACHER` only. It coordinates class readiness; it does not grant marks entry, learner-record access, assessment visibility or result access. `SUBJECT_TEACHER` assignments will be added only when the versioned curriculum mapping and Council learning-area configuration are published. No learner enrollment or learner personal data is created by these endpoints.
