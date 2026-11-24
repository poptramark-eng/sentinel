# School Registration API Contract

**Status:** Implementation-ready contract for the first domain vertical slice.  
**Base path:** /api  
**Authentication:** First-party authenticated account.  
**Authorization:** Server-resolved Person, Platform role, Council scope and registration ownership.  
**Data:** Synthetic data only until privacy and legal gates are complete.

## 1. Contract principles

- The authenticated account determines the registrant Person. Never accept personId, accountId, role, status, or reviewer identity from the request body.
- The request's councilId and clusterId identify requested resources; the server verifies they belong to the same active Council and that registration is open.
- The registrant is the initial proposed School Administrator. The SchoolMembership remains PENDING until a PlatformAdministrator approves the registration.
- School name is not a canonical identity key. Do not auto-merge or link records based on name, address, phone, or fuzzy matching.
- An external school identifier may be submitted as a claim, but is not trusted as verified identity until reviewed against its issuer.
- All transitions are commands with explicit preconditions and audit events. Do not expose unrestricted status updates.
- All request DTOs reject unknown properties. All list endpoints are paginated and server-scoped.

## 2. Endpoints

| Method | Path | Actor | Purpose |
|---|---|---|---|
| POST | /api/school-registrations | Authenticated, verified registrant | Submit a school registration |
| GET | /api/school-registrations/mine | Registrant | List own submitted registration episodes |
| GET | /api/school-registrations/mine/:id | Registrant | Read own registration status and decision feedback |
| GET | /api/platform/school-registrations | PlatformAdministrator | Review queue with filters and pagination |
| GET | /api/platform/school-registrations/:id | PlatformAdministrator | Read registration and evidence for review |
| POST | /api/platform/school-registrations/:id/approve | PlatformAdministrator | Approve pending registration |
| POST | /api/platform/school-registrations/:id/reject | PlatformAdministrator | Reject pending registration with reason |
| POST | /api/school-registrations/:id/withdraw | Original registrant | Withdraw own pending registration |

No endpoint is provided for arbitrary membership activation, reviewer assignment, registration status patching, school merge, or platform-admin self-provisioning.

## 3. Submit registration

### Request

~~~json
{
  "councilId": "uuid",
  "clusterId": "uuid",
  "school": {
    "name": "Example Primary School",
    "identifier": {
      "issuer": "issuer-code",
      "type": "OTHER",
      "value": "external-school-code"
    }
  },
  "registrationCode": "optional-council-code"
}
~~~

The identifier object is optional. It is a claim for review, not proof of canonical identity. The service creates a provisional School unless an exact verified identifier match can be established through an approved registry integration or a platform-reviewed record. Name-only matching is forbidden.

### Success — 201

~~~json
{
  "id": "uuid",
  "status": "PENDING_REVIEW",
  "school": {
    "id": "uuid",
    "name": "Example Primary School"
  },
  "council": {
    "id": "uuid"
  },
  "submittedAt": "ISO-8601",
  "nextStep": "WAIT_FOR_PLATFORM_REVIEW"
}
~~~

The response does not disclose reviewer details or other registrants' records.

### Validation and authorization

- Require active UserAccount and a verified login identifier.
- Resolve Person from authenticated account.
- Require Council ACTIVE and Cluster ACTIVE.
- Verify Cluster belongs to the supplied Council.
- Reject an existing active registration for the same Council/School.
- Reject duplicate Council registration code where supplied.
- Reject a conflicting school identifier claim and route to identity review; never silently reassign it.
- Create registration and pending SchoolAdministrator membership in one transaction.
- Append an audit event in the same transaction.

## 4. Registrant read endpoints

The registrant can only read registration episodes whose initialRegistrantPersonId matches the authenticated Person. Do not allow access merely because the caller knows the registration UUID or shares the same school name.

List query:
- page: integer, default 1, minimum 1
- pageSize: integer, default 20, maximum 50
- status: optional RegistrationStatus

Response is a page envelope with items, page, pageSize and total. Only status, submitted/decision dates, school name and decision feedback are returned.

## 5. Platform review queue

### GET /api/platform/school-registrations

Query:
- status: defaults to PENDING_REVIEW; allowlisted states only
- councilId: optional filter
- submittedFrom / submittedTo: optional ISO date bounds
- search: school name or registration code; search is not an authorization predicate
- page / pageSize: bounded pagination

PlatformAdministrator is provisioned outside the application. A normal Council or School role cannot call these endpoints.

Review detail contains:
- registration and canonical School identity fields;
- claimed school identifiers and verification status;
- Council and cluster hierarchy;
- initial registrant's minimum necessary contact identity;
- submission timestamp and prior decisions;
- audit history relevant to this registration.

Do not return password hashes, authentication tokens, unrelated memberships or learner data.

## 6. Approve registration

### Request

~~~json
{
  "reason": "Registration evidence reviewed and accepted.",
  "expectedVersion": 0
}
~~~

### Preconditions

- Actor has active PlatformAdministrator capability.
- Registration currently has PENDING_REVIEW status.
- Expected version matches current version.
- School and Council are not disabled.
- No other active registration exists for this School/Council pair.
- Required evidence and identifier conflicts have been reviewed.
- Actor is not the registrant and has no conflict of interest.

### Transaction

1. Conditionally transition registration to APPROVED and increment version.
2. Record reviewer account, reviewedAt and reason.
3. Set School ACTIVE.
4. Activate the initial SchoolAdministrator membership and set startsAt.
5. Append immutable audit event.
6. Enqueue a notification event for later delivery (outbox implementation is a later slice).

### Success — 200

Returns the registration ID, APPROVED status, new version and decision timestamp. It does not return credentials.

## 7. Reject registration

### Request

~~~json
{
  "reason": "A clear, actionable reason for rejection.",
  "expectedVersion": 0
}
~~~

Reason is required and must be meaningful, not a generic placeholder.

### Transaction

1. Conditionally transition PENDING_REVIEW to REJECTED and increment version.
2. Record reviewer account, reviewedAt and reason.
3. Keep the canonical School and claimed identifiers for history; do not delete or merge.
4. Keep the pending membership non-operational and mark it REVOKED.
5. Append audit event.
6. Enqueue a notification event for later delivery.

Reapplication creates a new registration episode. It must not overwrite the rejected decision.

## 8. Withdraw registration

Only the initial registrant may withdraw their own PENDING_REVIEW registration. Withdrawal records actor/time/reason, changes status to WITHDRAWN, revokes the pending SchoolAdministrator membership and appends an audit event. Approved registrations cannot be withdrawn through this endpoint; they require a governed suspension/closure workflow.

## 9. Error contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid DTO, malformed UUID/date or unknown property |
| 401 | AUTHENTICATION_REQUIRED | Missing/invalid/disabled account |
| 403 | ACTION_NOT_PERMITTED | Authenticated but lacks action permission |
| 404 | RESOURCE_NOT_FOUND | Resource absent or intentionally concealed outside caller scope |
| 409 | REGISTRATION_ALREADY_ACTIVE | An active episode already exists for this School/Council |
| 409 | VERSION_CONFLICT | Registration changed since the caller loaded it |
| 409 | IDENTIFIER_REVIEW_REQUIRED | Claimed identifier conflicts or needs manual canonical-identity review |
| 422 | REGISTRATION_NOT_REVIEWABLE | State transition is invalid |
| 429 | RATE_LIMITED | Abuse/rate limit triggered |

Error responses must not reveal whether a foreign Council's school registration exists.

## 10. Audit catalogue

- SCHOOL_REGISTRATION_SUBMITTED
- SCHOOL_REGISTRATION_APPROVED
- SCHOOL_REGISTRATION_REJECTED
- SCHOOL_REGISTRATION_WITHDRAWN
- SCHOOL_IDENTIFIER_CLAIMED
- SCHOOL_IDENTIFIER_VERIFIED (later reviewer workflow)

Each event records actor account, Person where appropriate, Council scope, registration resource, decision/reason, correlation ID, timestamp and minimal metadata. Never include passwords, tokens or unnecessary personal data.

## 11. Acceptance criteria

1. A pending registrant can see only their own registration status.
2. A pending SchoolAdministrator cannot create staff, assignments, assessments or school data.
3. Only a provisioned PlatformAdministrator can approve/reject.
4. A CouncilAdministrator cannot approve initial school registration.
5. A registrant cannot approve their own registration.
6. Two concurrent submissions cannot create two active episodes for the same Council/School.
7. Two concurrent reviewers cannot both decide the same pending version.
8. Changing a UUID in the URL never exposes another registrant's registration.
9. Rejection preserves history and does not activate membership.
10. Approval activates only the initial membership for the approved registration.
11. Suspending one CouncilSchoolRegistration does not affect another Council's registration for the same canonical School.
12. All high-impact transitions create immutable audit events.
