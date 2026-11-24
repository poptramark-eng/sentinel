# Authentication and Authorization Architecture

**Status:** Proposed technical design based on the current CBE requirements; full permission matrix and physical persistence are not yet approved.  
**Implementation:** NestJS + Fastify API, PostgreSQL, Prisma, Next.js client.  
**Identity provider:** First-party application authentication. No Auth0, Clerk, Firebase Auth, Cognito, Supabase Auth or other third-party identity provider.

## 1. Identity model

Separate these concepts:

- **Person:** global human identity with minimal personal data.
- **UserAccount:** authentication principal, login identifiers, password hash, verification and account status.
- **TeacherIdentity:** global teacher identity linked to Person, with verified professional identifiers where available.
- **CouncilMembership:** account/person membership and role assignments within one Council.
- **SchoolMembership:** account/person membership within one CouncilSchoolRegistration.
- **OrganizerStaffMembership:** named staff identity explicitly delegated by an Organization Administrator under an active OrganizerAuthority.
- **LearnerIdentity:** a protected educational identity with no UserAccount in the current product scope.

A teacher working at multiple schools has one Person and one TeacherIdentity, but multiple SchoolMembership and StaffAssignment records. Do not create duplicate global accounts to represent another school assignment.

Learner identifiers locate learner records only. They are not passwords, one-time secrets or proof of identity. A learner cannot gain access by knowing or entering an identifier.

## 2. Account provisioning

### Platform operators
- Platform Administrators are provisioned by the developer through a restricted bootstrap/administrative process.
- No public self-registration or ordinary school workflow can create a Platform Administrator.
- Bootstrap credentials must be one-time, rotated and never committed to source control.

### School registration
- The registrant becomes the initial School Administrator.
- School registration and the initial administrator membership remain pending until the required Platform Administrator approval.
- Pending accounts/memberships cannot perform school-management actions or provision teachers.
- Approval activates the permitted school-management capabilities.

### Council membership
- A Council Administrator may invite an existing platform user, creating a CouncilMembership rather than another identity.
- An invitation for a new user is Council-specific; the recipient verifies the invitation and creates a global account before membership activation.
- Invitations expire and can be revoked; an invitation alone grants no access.

### Teacher onboarding
- A School Administrator may create a teacher profile or associate an existing verified TeacherIdentity with the school.
- Identity matching must use verified issuer/identifier or a controlled duplicate-resolution process. Never merge identities based only on a matching name.
- A teacher may belong to multiple schools.

### Learners
- No learner-created account or learner login is included in the current scope.

## 3. Credential and token design

Use established cryptographic libraries. Do not invent cryptographic primitives.

### Passwords
- Hash passwords with Argon2id using parameters benchmarked for the deployed runtime.
- Use unique salts through the library; never store plaintext or reversible passwords.
- Enforce reasonable password length and compromised-password checks where available.
- Rehash after successful authentication when parameters become outdated.
- Password reset is a one-time, short-lived, high-entropy token; persist only its hash.

### Access and refresh tokens
- Issue short-lived signed JWT access tokens (target 5–10 minutes).
- JWT claims include subject, issuer, audience, issued-at, expiry, token identifier, and an authentication-version value. Do not embed sensitive learner data or broad tenant privileges.
- Issue a high-entropy opaque refresh token, stored only as a cryptographic hash with token-family metadata, expiry, used/revoked timestamps and account reference.
- Rotate refresh tokens on every use. Reuse of an already-used token revokes the token family and triggers an audit/security event.
- This is token-based authentication, not a server-side login session. PostgreSQL stores revocation/rotation evidence, not a session payload.
- Increment the account authentication version on password reset, account suspension, logout-all and security-sensitive recovery. Enforce current account/version state on protected requests; cache only with a short, explicit revocation-latency policy.
- Revoke all active refresh-token families after suspected compromise.

### Cookies and browser security
- Set access and refresh tokens only in Secure, HttpOnly cookies. Use explicit cookie names, path, expiry and SameSite policy.
- Prefer frontend and API custom domains under the same registrable site so SameSite=Lax can be used. If deployment requires cross-site cookies, use SameSite=None; Secure and enforce strict CSRF controls.
- Keep cookies host-only where possible; do not broaden Domain unnecessarily.
- Use exact CORS origin allowlists and credentials only for trusted frontend origins.
- Protect state-changing cookie-authenticated requests with CSRF tokens and Origin/Referer validation. SameSite alone is not the only CSRF control.
- Never expose tokens to localStorage, sessionStorage, URL parameters or client logs.
- Logout clears cookies and revokes the refresh-token family.

## 4. Authentication flows

- Login: normalize identifier; rate-limit; verify account status; verify Argon2id hash; issue access + refresh cookies; record a security audit event.
- Refresh: validate refresh-token hash and family state; rotate transactionally; detect replay; issue new access token.
- Logout: revoke current refresh token/family and clear cookies.
- Logout all: increment authentication version, revoke all refresh families and clear current cookies.
- Email verification: send a short-lived one-time link through Resend; persist only token hash; make operation idempotent.
- Password reset: return the same public response regardless of whether an account exists; send a one-time reset link only when eligible; revoke refresh families and increment authentication version after reset.
- Account suspension: deny new login and protected access, revoke refresh families and increment authentication version.
- Optional phone verification: add only where a defined workflow needs it; use SMS provider abstraction and one-time rate-limited codes.

## 5. Authorization model

Use role-based permissions plus resource attributes and explicit relationships (RBAC + ABAC/ReBAC). A role alone is never enough to authorize cross-tenant data access.

The policy decision uses:
- authenticated account and Person;
- active account status and authentication version;
- active CouncilMembership / SchoolMembership / OrganizerStaffMembership;
- Council and school registration status;
- current OrganizerAuthority and delegated permissions;
- assessment ownership, participation and workflow state;
- requested action and resource relationship;
- separation-of-duties constraints.

### Known role boundaries

- **PlatformAdministrator:** platform-level school approval and oversight; created only by the developer. No routine school operations.
- **CouncilAdministrator:** multiple may exist per Council; manages only their own Council and its authorized configuration/organizer grants.
- **CouncilGovernanceApprover:** separate Council governance authority for sensitive Council administrator appointments/replacements/suspensions/removals. Does not automatically grant assessment or release permissions.
- **CouncilApprover:** narrowly approves/rejects organizer RELEASE_RESULTS authority requests. It does not execute result release.
- **OrganizationAdministrator:** may delegate named staff only within active parent authority; delegation is non-transitive and cannot increase permissions.
- **SchoolAdministrator:** manages an approved school registration, staff and school operations; only this role initiates replacement of the school administrator role-holder.
- **Teacher:** school-level user. Subject-teacher and class-teacher duties are assignments/capabilities scoped to grade, class/stream, learning area and period—not separate global identities.
- **Learner:** record only, not an authenticated actor in current scope.

### Separation of duties
- A requester cannot approve their own request.
- A person cannot approve a decision directly affecting their own appointment or administrative authority.
- CouncilApprover and CouncilGovernanceApprover are distinct authorities.
- A role overlap never bypasses individual-level conflict checks.
- Parent authority suspension, expiry or revocation immediately disables delegated staff access.

## 6. API enforcement

- Authentication and authorization are implemented in NestJS guards, policy services and domain services.
- Derive tenant and resource scope from verified server-side membership and authority records. Never trust tenant IDs supplied by the client as proof of access.
- Every endpoint, nested relation, bulk operation, import, export, report, file download and asynchronous worker must apply scope.
- Deny by default; return non-enumerating responses where revealing resource existence would leak data.
- Validate request DTOs, reject unknown fields and use explicit command methods for state transitions.
- Use database constraints and transactions as defense in depth.
- Consider PostgreSQL RLS only after connection-pooling and Prisma transaction context have been designed and tested.

## 7. Abuse controls and audit

- Rate-limit login, reset, verification, invitations, OTP and expensive exports by appropriate account, network and target dimensions.
- Add progressive delays and risk signals without permanently locking out legitimate school users.
- Audit successful and failed privileged operations, account lifecycle events, membership/role changes, authority grants, approval decisions, marks corrections, submissions, releases, exports and support access.
- Redact credentials, tokens, reset links, OTPs and unnecessary personal/learner data from logs.
- Alert on refresh-token reuse, privilege changes, unusual bulk export and repeated cross-tenant denial patterns.

## 8. Security acceptance tests

- No learner identifier can authenticate or recover an account.
- Pending school administrator cannot provision users or manage school data.
- Existing teacher can be linked to another school without a duplicate identity.
- Inactive or revoked memberships immediately lose access.
- A Council A user cannot access Council B data by substituting IDs, filters or nested relation IDs.
- Organizer staff cannot exceed the parent authority and cannot delegate onward.
- Organizer access expires/revokes with parent authority.
- Requester cannot approve own request or conflicted administrative decision.
- Refresh rotation, replay detection, logout, logout-all, password reset and account suspension behave transactionally.
- CSRF, CORS, cookie attributes, brute-force throttling and account enumeration are tested.
- Every high-risk mutation emits the required immutable audit event.

## 9. Decisions still required before implementation

- Canonical account login identifier policy (email, phone, or both) and duplicate handling.
- Whether one account can hold multiple people/persona relationships and the identity verification process.
- Exact complete permission catalogue and route/action matrix.
- School administrator replacement approval and recovery workflow.
- Password reset and email-verification expiry/retention values.
- Cookie hostnames and deployment topology for Vercel/Render.
- Support-access policy and whether it is needed.
- Authentication audit retention and privacy schedule.

No authentication migration or production credential setup is authorized by this design note. Resolve the data model and permission matrix first; use synthetic test identities only.
