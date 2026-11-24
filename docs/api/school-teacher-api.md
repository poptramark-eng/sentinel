# School teacher membership API

All routes require an active access token. Mutations require the CSRF header. The caller must hold an active School Administrator membership for the specified, approved `CouncilSchoolRegistration`, and the linked School and Council must both be active. The registration ID is a selector, never proof of access.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/school/registrations/:registrationId/teachers` | List teacher memberships for the caller's approved school registration |
| `POST` | `/api/school/registrations/:registrationId/teachers` | Link an existing global account by exact verified email |

## Link request

`POST` accepts `{ "email": "teacher@example.com" }`. The API normalizes the address and resolves an active account through a verified EMAIL LoginIdentifier. Name-only matching is not allowed. The same Person may hold TEACHER memberships in multiple school registrations; linking does not create another Person or UserAccount.

If no active account with a verified matching email exists, the request returns a not-found response. New teacher invitation/provisioning is not implemented in this slice; do not ask teachers to self-enroll as a workaround, create a duplicate identity, or use an unverified email. Sentinel never accepts a School Administrator's password on behalf of another person.

The membership is activated in a serializable transaction, with an immutable audit event. A best-effort Resend notification is sent after commit; email failure does not undo the membership. The response exposes only a masked email address.

Only a previously REVOKED teacher membership may be reactivated by the explicit link action after the verified identity is re-resolved. PENDING and SUSPENDED memberships require separate governance workflows. An already-active membership cannot be duplicated. A person who is already the School Administrator for that registration cannot also be linked as a teacher.

## Deliberate scope boundary

This slice creates school-specific TEACHER membership only. Grade, class/stream and learning-area assignments are not yet implemented because their curriculum/assessment ownership and physical data model are still being finalized. Do not infer subject-teacher or class-teacher privileges from a TEACHER membership alone.
