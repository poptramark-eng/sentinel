# Authorization Policy Contract — Sentinel

**Status:** Working authorization contract, adopted alongside ADR-001 through ADR-012 in `docs/decisions/decision-register.md`.
**Approval state:** The adopted ADRs resolve several earlier TBDs below. Any remaining implementation-specific details must follow the decision register; external legal and institutional validation remains a production gate.
**Applies to:** NestJS/Fastify API, domain services, database access, exports, reports, and asynchronous workers.
**Migration status:** No Prisma schema or migration is authorized by this document.

## 1. Authorization decision model

Sentinel uses role-based permissions combined with relationship and resource attributes (RBAC + ReBAC/ABAC). A role name alone never grants access to a resource.

A policy decision must be evaluated against a fresh, server-resolved context containing:

- authenticated account ID, linked Person ID, account status, and authentication version;
- active memberships and lifecycle status;
- CouncilSchoolRegistration status and Council ownership;
- StaffAssignment scope and effective dates;
- OrganizerAuthority, parent organization, delegated staff grant, scope, permissions, and validity;
- assessment owner, participation relationship, and current workflow state;
- requested action, resource identity, and resource relationships;
- individual-level separation-of-duties conflicts.

**Decision outcomes:** ALLOW, DENY, or INDETERMINATE. INDETERMINATE is treated as deny. The API may return a non-enumerating 404 for inaccessible resources; it must not reveal whether a foreign-tenant resource exists.

## 2. Non-negotiable policy invariants

1. Deny by default. An absent permission is not implied permission.
2. Derive Council, school, assessment, assignment, and authority scope on the server. Never trust client-supplied tenant IDs as proof of access.
3. Resolve an active membership and its current status on every protected operation. A pending, suspended, expired, or revoked membership grants no operational access.
4. A Council user is confined to that Council. A school registration in Council A grants no access to Council B.
5. An assessment belongs to one immutable owning Council. Organizer access is bounded by a current authority granted by that Council.
6. Assessment-specific organizer scope is the default. Council-wide scope must be an explicit grant.
7. Delegated staff permissions are the intersection of the active parent authority and the explicit staff delegation. A delegation cannot add permissions, broaden scope, extend validity, or be delegated onward.
8. Parent authority suspension, expiry, or revocation immediately invalidates dependent staff access.
9. Check separation of duties against the actual Person/account, not only role labels. A requester cannot approve their own request; a person cannot approve a decision directly affecting their own appointment or authority.
10. CouncilApprover and CouncilGovernanceApprover are distinct authorities. Neither role implies the other's powers.
11. Approval and release are separate actions. An approval record never itself releases results.
12. Re-authorize list/detail reads, nested relations, bulk operations, imports, exports, report generation, file downloads, signed URLs, scheduled jobs, and workers.
13. UI navigation and disabled controls are usability aids only. The API remains authoritative.
14. Every privileged decision and high-risk mutation must produce an immutable audit event with actor, scope, action, resource, decision, reason where required, timestamp, and correlation ID. Do not log credentials or unnecessary learner data.

## 3. Action catalogue and policy boundaries

The action identifiers below are proposed stable policy keys. They are not a commitment to a particular database enum or route naming convention.

| Policy key | Actor | Decision / scope | Preconditions and restrictions |
|---|---|---|---|
| platform.admin.provision | Developer-controlled process | **Allowed** | No public or tenant-facing endpoint. Platform administrators are provisioned only through the restricted developer process. |
| platform.council.create | PlatformAdministrator | **Allowed** | Platform-level tenant setup only. Creates a Council root; does not create Council memberships or grant tenant roles. |
| platform.council.geography.manage | PlatformAdministrator | **Allowed** | Create geography nodes only within an active Council; each child requires an active parent in that same Council. Mutations are audited. |
| school.registration.submit | Initial registrant | **Allowed** | Creates a pending CouncilSchoolRegistration; registrant is recorded as initial School Administrator, but receives no school-management capability before approval. |
| school.registration.review | PlatformAdministrator | **Allowed** | Approve or reject initial registration. Record decision and reason. |
| school.manage.pending | SchoolAdministrator | **Denied** | Pending/rejected registration cannot manage school data or provision users. |
| school.manage.approved | SchoolAdministrator | **Scoped** | Own approved school registration only. |
| school.registration.suspend / reactivate | CouncilAdministrator | **Scoped** | Own Council registration only; reason required; does not suspend canonical School or other Council registrations. Exact policy approval/recovery remains **TBD**. |
| council.membership.invite | CouncilAdministrator | **Scoped** | Own Council only. Invite links an existing global identity or creates an account after verification; never duplicate a Person. Invitation lifecycle and allowed invitee roles remain **TBD**. |
| council.role.assign | CouncilAdministrator | **Scoped / TBD** | Own Council and permitted role catalogue only. Exact role catalogue, self-assignment limits, and role-combination constraints remain **TBD**. |
| council.admin.governance.request | Eligible Council actor | **Scoped** | Appointment/replacement/suspension/removal request. Requester and affected person cannot approve. Initiation details beyond existing rules remain **TBD**. |
| council.admin.governance.approve | CouncilGovernanceApprover | **Scoped** | Independent, active, unconflicted governance approver. Temporary appointment expires and has narrow permissions. |
| organizer.authority.grant | CouncilAdministrator | **Scoped** | Own Council; named Organization; assessment-specific by default. Non-release permission catalogue and exact grant workflow require finalization. |
| organizer.release_authority.request | OrganizationAdministrator | **Scoped** | Requests RELEASE_RESULTS from the owning Council. Does not activate the permission. |
| organizer.release_authority.decide | CouncilApprover | **Scoped** | Approve/reject only; active, distinct, and unconflicted. Cannot execute result release merely by holding this role. |
| organizer.authority.suspend / revoke | CouncilAdministrator | **Scoped** | Own Council; emergency suspension/revocation requires reason and immutable audit. |
| organizer.staff.delegate | OrganizationAdministrator | **Scoped** | Named, individually authenticated staff; active parent authority; permissions and scope are a strict subset; no onward delegation. |
| organizer.assessment.act | OrganizationAdministrator / OrganizerStaff | **Scoped** | Current parent authority or effective delegated authority must cover this assessment and action. |
| organizer.results.release | OrganizationAdministrator / OrganizerStaff | **Scoped** | Explicit current RELEASE_RESULTS permission, valid assessment scope, all validation/review gates satisfied, and correct workflow state. |
| school.teacher.link_or_create | SchoolAdministrator | **Scoped** | Own approved school. Link existing verified global teacher identity where possible; never match by name alone or create a duplicate merely for a new school membership. |
| school.membership.manage | SchoolAdministrator | **Scoped / TBD** | Own approved school. Membership lifecycle, deactivation, and approval rules need final definition. |
| school.assignment.manage | SchoolAdministrator | **Scoped** | Own school; grade/class/learning-area assignments are school-specific and time-bounded. Assignment catalogue and reassignment rules need finalization. |
| marks.enter | Subject Teacher assignment | **Scoped** | Assigned learning area, grade/class, assessment participation, and open entry window. |
| marks.correct | Teacher / SchoolAdministrator | **TBD** | Do not infer correction rights from entry rights or school oversight. Correction actor, deadlines, approval and post-submission/release rules remain unresolved. |
| school.submission.coordinate | Designated Class Teacher | **Scoped / TBD** | Only assigned class/assessment. Exact designation, authority and reassignment rules remain unresolved. |
| school.submission.finalize | School-side actor | **TBD** | Class Teacher versus School Administrator final submitter and delegation rules must be approved before implementation. |
| results.internal.approve | PlatformAdministrator | **Allowed** | Internal workflow only; explicit review/return/approve transition. Approval is not release. |
| results.internal.release | SchoolAdministrator | **Scoped** | Own school and only after required PlatformAdministrator approval. |
| results.external.validate | Authorized Organizer staff | **Scoped** | Assessment-specific current authority. Exact validation and candidate-correction action set remains **TBD**. |
| results.external.release | Organizer staff | **Scoped** | Explicit active RELEASE_RESULTS authority; immutable release version; approval to hold authority is not itself release. |
| learner.authenticate | Learner | **Denied** | Learners are records in current scope. Learner identifier is a locator, never a credential or recovery secret. |
| platform.support.access | Platform support | **TBD** | No standing unrestricted superuser bypass. Any break-glass access needs separate approval, reason, narrow scope, expiry and audit. |
| reports.export | All roles | **Scoped / TBD** | Same data scope as source records; field-level permissions, recipient controls, expiry and retention must be finalized. Consolidated reports require explicit authorization from every affected Council. |

## 4. Scope resolution rules

### 4.1 Platform scope

PlatformAdministrator can perform platform registration approval and defined oversight actions. This role does not imply unrestricted routine access to learner, candidate, mark, or result content. Any support access is a separate policy and is currently **TBD**.

### 4.2 Council scope

Resolve an active CouncilMembership and the Council ID from that membership. All Council-owned reads and writes must be filtered by this server-resolved Council ID. CouncilAdministrator manages only their own Council and only actions in the approved permission catalogue.

Whether Council roles may inspect identifiable candidates and marks, or only operational metadata and approved aggregates, is **TBD**.

### 4.3 School scope

Resolve the active CouncilSchoolRegistration and SchoolMembership for the authenticated Person. Require registration status APPROVED for operational school actions. A school-scoped query must constrain both the registration and the owning Council. Do not authorize solely because the caller knows a School ID.

### 4.4 Teacher assignment scope

Teacher access requires an active SchoolMembership and a current StaffAssignment. Assignment scope is the intersection of school, assessment participation, grade/class/stream, learning area, and effective dates. Subject-teacher and class-teacher are assignment capabilities, not global roles.

Teacher visibility of learner identifiers, demographics, historical results, and cross-class information remains **TBD** and must be field-filtered when resolved.

### 4.5 Organizer scope

Resolve the owning Council from the Assessment. Then resolve the Organization's current OrganizerAuthority granted by that Council. For staff, additionally resolve the named staff delegation and compute:

- effective permissions = parent permissions intersect delegated permissions;
- effective scope = parent scope intersect delegated scope;
- effective validity = parent validity intersect delegated validity.

Any inactive, expired, suspended, revoked, mismatched, or missing parent/delegation record results in deny. Do not rely on cached authorization longer than the approved revocation-latency policy; default to checking current authority state.

### 4.6 Learner and candidate scope

LearnerIdentity is not an authenticated principal. Candidate access is mediated through an authorized school, Council, or organizer relationship to a specific AssessmentParticipation. Never provide a learner lookup endpoint that reveals data solely from a learner identifier.

## 5. Workflow-aware authorization

Authorization must evaluate both actor permission and the current state transition:

- Initial school registration: only a PlatformAdministrator may approve/reject; pending SchoolAdministrator cannot provision staff.
- Internal results: school submission enters the platform review path; PlatformAdministrator may approve or return; SchoolAdministrator may release only after approval.
- External results: participating schools submit; authorized organizer staff validate and return issues; result release requires explicit active RELEASE_RESULTS authority and all assessment workflow gates.
- Result release creates an immutable version/snapshot. A correction after release must create a new governed version; no silent overwrite.
- School registration suspension affects that Council registration only.
- Organizer authority suspension, expiry, or revocation immediately removes effective access from dependent staff.
- Any transition not represented in the approved state machine is denied.

Exact reopening, correction, replacement, and recovery transitions remain **TBD**.

## 6. API and persistence enforcement pattern

Each command/query should follow this sequence:

1. Authenticate the account and verify active account/authentication version.
2. Load the minimum current membership, registration, assignment, or authority records required for the decision.
3. Resolve the target resource and its ownership relationships from trusted persistence.
4. Evaluate action permission, scope, validity, workflow state, and separation-of-duties constraints.
5. Execute the domain operation in a transaction with required concurrency/idempotency controls.
6. Write the immutable audit event in the same transaction for high-risk mutations.
7. Return only fields permitted for this actor and purpose.

Additional requirements:

- Reject unknown request fields and ignore no client-supplied tenant field as an authorization source.
- Use scoped repository/query methods so developers cannot accidentally fetch by resource ID alone.
- Use composite tenant-aware foreign keys/unique constraints where the final schema supports them.
- Re-check authority inside asynchronous workers at execution time and again when a protected export/download is requested.
- Signed file URLs must be short-lived and issued only after a fresh scope check.
- Avoid long-lived caches for membership, role, authority, and workflow state unless revocation invalidation is reliable and explicitly tested.
- Login and refresh use the Upstash policies defined in ADR-013. Add equivalent scoped controls to signup, invitations, OTP, bulk imports, recovery and expensive reports before those routes launch.

## 7. Required security test catalogue

Every policy key implemented must have positive and negative tests. At minimum:

| Test ID | Scenario | Expected result |
|---|---|---|
| AUTHZ-001 | Pending SchoolAdministrator attempts to create a teacher | Deny |
| AUTHZ-002 | Approved SchoolAdministrator manages a different school's membership | Deny |
| AUTHZ-003 | Council A administrator substitutes a Council B registration ID | Deny without data leakage |
| AUTHZ-004 | Council A organizer attempts to access an assessment owned by Council B | Deny |
| AUTHZ-005 | Organizer staff delegation requests a permission absent from parent authority | Deny |
| AUTHZ-006 | Parent authority expires, is suspended, or is revoked while staff delegation remains active | Deny immediately |
| AUTHZ-007 | Organizer staff attempts onward delegation | Deny |
| AUTHZ-008 | Requester attempts to approve their own authority/governance request | Deny |
| AUTHZ-009 | Affected person attempts to approve their own appointment/removal decision | Deny |
| AUTHZ-010 | CouncilApprover attempts to release results | Deny |
| AUTHZ-011 | CouncilGovernanceApprover attempts to approve organizer RELEASE_RESULTS authority without separately holding CouncilApprover | Deny |
| AUTHZ-012 | SchoolAdministrator attempts internal result release before platform approval | Deny |
| AUTHZ-013 | Organizer staff with RELEASE_RESULTS permission attempts release outside granted assessment scope | Deny |
| AUTHZ-014 | Teacher attempts mark entry outside active assignment or entry window | Deny |
| AUTHZ-015 | Learner identifier is submitted as a login or recovery credential | Deny |
| AUTHZ-016 | Export worker runs after requester membership/authority is revoked | Deny/cancel |
| AUTHZ-017 | User requests a nested relation belonging to another tenant | Deny without data leakage |
| AUTHZ-018 | Bulk import contains mixed-tenant IDs | Reject atomically; no partial cross-tenant writes |
| AUTHZ-019 | Result snapshot is modified after release | Deny; require a new governed release version |
| AUTHZ-020 | A Council registration is suspended | Other Council registrations and canonical School remain unaffected |
| AUTHZ-021 | User loses membership while access token remains unexpired | Protected operation denied according to current membership state |
| AUTHZ-022 | User changes filters, pagination, or export parameters to widen scope | Results remain bounded by server-resolved scope |

Also test race conditions: simultaneous approvals, authority revocation during a release, duplicate submissions, stale version writes, and export authorization changes between request and execution.

## 8. Adopted decisions and remaining implementation gates

The following earlier TBD items are now resolved as working defaults:

- School Administrator mark editing and submission: teachers may edit their own draft marks within active assignment and entry window; SchoolAdministrator finalizes submission; post-submission changes require governed correction. (ADR-005)
- Class Teacher: explicit class-coordination assignment; may review completeness and coordinate readiness but cannot bypass subject assignments or finalize submission. (ADR-005)
- Council/Platform visibility: aggregate operational oversight by default; identifiable learner/candidate/mark access requires purpose-limited, named, expiring and audited access. (ADR-006)
- Teacher data access: constrained to learners and assessment records needed for active school membership and assignments; field-level details must be implemented against that scope. (ADR-006)
- Organizer validation/correction: organizer staff may validate, create/resolve issues and return submissions, but cannot directly change school-entered marks. (ADR-007)
- Governance and SchoolAdministrator replacement: independent governance approval, two-person replacement, and time-limited audited recovery process. (ADR-008)
- Export/privacy: allowlisted fields, asynchronous reauthorization at execution/download, short-lived retrieval, aggregate-only consolidated reports by default, and no invented retention periods. (ADR-009)
- Tenant enforcement: tenant-scoped repositories and composite constraints; PostgreSQL RLS deferred until transaction context and connection pooling are proven. (ADR-010)

Remaining implementation gates are operational rather than ideation blockers:

1. Translate every adopted action into policy service methods and endpoint-level tests before exposing that endpoint.
2. Configure the named reviewer/approval workflow for post-submission mark corrections and correction evidence requirements per assessment.
3. Define field allowlists for each report/export type before implementing those exports.
4. Implement the purpose-limited DataAccessGrant/ReviewCase before Council or Platform users can inspect identifiable learner data.
5. Validate institutional identity-proofing and recovery procedures, and obtain legal/controller approval for child-data retention and sharing.
6. Extend distributed rate limiting to future invitation and export routes, then implement password recovery before production onboarding.

## 9. Exit criteria before protected feature implementation

- Every API operation maps to an approved policy key.
- Every policy key has an actor, resource scope, lifecycle preconditions, and explicit deny cases.
- No high-impact TBD permission is implemented by inference.
- Tenant ownership and relationship constraints are represented in the data design.
- Positive, negative, cross-tenant, stale-authority, workflow-state, and concurrency tests are specified.
- The authorization matrix and this contract are reviewed together before Prisma migrations.
