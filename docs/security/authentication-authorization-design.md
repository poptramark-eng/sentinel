# Authentication and Authorization Architecture

**Status:** Working design. First-party login/refresh/logout/me foundation is implemented; account onboarding, verification, recovery, rate limits for non-auth endpoints, and complete authorization remain in progress.
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
- Use Argon2id via the maintained `@node-rs/argon2` native binding. The initial profile is 19 MiB memory, 2 iterations, parallelism 1, and a 32-byte output, encoded in PHC format.
- Keep algorithm and parameters in the encoded hash. Benchmark latency and memory under expected concurrent login load before production; tune the cost upward only when the deployment can sustain it without creating a denial-of-service risk.
- Never store plaintext or reversible passwords. Enforce a 12–128 character input range at the API boundary and apply account/network/identifier rate limits before production.
- Existing prototype scrypt hashes are verified only for migration compatibility and are upgraded to Argon2id after a successful login. New hashes are always Argon2id.
- Password reset is a one-time, short-lived, high-entropy token; persist only its hash.

### Access and refresh tokens
- Issue short-lived signed JWT access tokens (10 minutes in the current implementation).
- JWT claims include subject, issuer, audience, issued-at, expiry, unique token identifier, Person ID, and an authentication-version value. Do not embed sensitive learner data or broad tenant privileges. The current API verifies a fixed HS256 algorithm and fixed issuer/audience.
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
- Protect state-changing cookie-authenticated refresh/logout requests with a double-submit CSRF token and exact Origin/Referer allowlist validation. SameSite alone is not the only CSRF control.
- Never expose tokens to localStorage, sessionStorage, URL parameters or client logs.
- Logout clears cookies and revokes only the current device refresh-token family. Logout-all revokes every family and increments the account authentication version, immediately invalidating all outstanding access tokens.

## 4. Authentication flows

- Login: normalize email; verify account status and verified identifier; verify Argon2id (or migrate a legacy scrypt hash); issue access + refresh cookies; record a security audit event. Login and refresh throttling are enforced by the Upstash rate-limit guard; production credentials are mandatory and the API fails closed when the service is unavailable.
- Refresh: validate refresh-token hash and family state; rotate transactionally; detect replay; issue new access token.
- Logout: revoke the current device refresh-token family and clear its cookies.
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

- Login and refresh are rate-limited through Upstash Redis and `@upstash/ratelimit`: 30 login attempts/IP/15 minutes, 5 login attempts/normalized email/15 minutes, and 60 refresh attempts/IP/5 minutes. Sliding windows are used to reduce fixed-window boundary bursts; analytics are disabled to avoid unnecessary request volume.
- Email identifiers are HMACed before they become Redis keys. IP identity uses Fastify's resolved `request.ip`; `TRUST_PROXY` remains false unless the API is behind a known trusted proxy.
- In development, missing Upstash credentials allow local work. In production, missing/invalid credentials, Redis errors or rate-limit timeouts fail closed with 503; exceeded limits return 429 with `Retry-After`. Production deployment is blocked until a dedicated Upstash database and secrets are configured.
- Extend the same controls to signup, verification, password reset, invitations, OTP and expensive exports before those endpoints are exposed.
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

## 9. Current implementation boundary

Implemented in the API foundation: email/password login for pre-provisioned active accounts; Argon2id password hashing with legacy scrypt rehash-on-login; 10-minute HS256 access JWT in an HttpOnly cookie; opaque refresh-token hash persistence and transactional rotation; refresh-family replay response; account auth-version checks; CSRF double-submit plus exact origin allowlist for refresh/logout; logout; current-user endpoint; developer-controlled PlatformAdministrator bootstrap; and authenticated school-registration submission, withdrawal, status and PlatformAdministrator review/identifier-verification endpoints.

Not yet implemented: public account signup, email verification delivery, password reset, MFA/passkeys, rate limits for signup/recovery/invitations/exports, login alerting, full Council/School/Organizer authorization policies, and full database-backed API integration tests. Login and refresh rate limiting are implemented but require production Upstash credentials. Do not expose this API to production users until the remaining controls are completed and tested. The current implementation has not been penetration-tested.

## 10. Decisions still required before production

- Email is the first supported login identifier. Phone login is deferred until phone verification, recovery and SIM-swap controls are implemented.
- One account maps to one Person; a Person may have multiple scoped memberships.
- Remaining role/action policy details are governed by `docs/security/authorization-policy-contract.md` and the adopted ADRs.
- School administrator replacement and recovery follow ADR-008; production identity-proofing procedures still require institutional validation.
- Password reset and email-verification expiry/retention values must be configured and reviewed before launch.
- Cookie hostnames and deployment topology for Vercel/Render must be fixed before production.
- Support access is denied by default; a time-limited, purpose-bound break-glass workflow is required before support can inspect identifiable learner data.
- Authentication audit retention and privacy schedule require legal/controller approval.

The Prisma schema includes Person, UserAccount, LoginIdentifier, PlatformOperator, RefreshToken, Council, scoped memberships, CouncilSchoolRegistration, geography and AuditEvent. The initial migration is not yet generated or applied. Production credential setup is not authorized by this design note. Use synthetic test identities only.
