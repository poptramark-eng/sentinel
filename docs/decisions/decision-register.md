# Architecture and Domain Decision Register — Sentinel

**Date:** 24 November 2026
**Status:** Decisions adopted as the working implementation baseline unless explicitly marked provisional.
**Authority:** Product/engineering decisions made to unblock implementation under the user's instruction to proceed autonomously.
**Repository:** `poptramark-eng/sentinel`, branch `main`.

This register resolves the previously open design questions with conservative defaults. It supersedes earlier TBD markers only where it explicitly records a decision. It does not override statutory requirements, Council contracts, or a later explicit product decision.

## ADR-001 — Canonical School identity and Council registration episodes

**Decision**

- A School is a global canonical institution record identified internally by an immutable UUID.
- External identifiers are optional and represented as issuer-scoped identifiers (issuer + normalized value); never assume a single universal Kenyan school code is available or authoritative.
- A CouncilSchoolRegistration is a distinct, Council-owned registration episode linking one canonical School to one Council.
- Multiple historical registration episodes for the same School/Council pair are allowed, but only one may be operationally active at a time.
- Registration lifecycle: DRAFT (local form only), PENDING_REVIEW, APPROVED, REJECTED, SUSPENDED, WITHDRAWN, EXPIRED. Reapplication creates a new episode; it does not overwrite the historical decision.
- Historical assessment participation remains linked to the registration episode used at the time. Suspending or expiring a later registration does not rewrite historical participation.
- The initial registrant is recorded as the proposed initial School Administrator. The membership is pending and gains operational powers only after registration approval.

**Consequences**

- School is not tenant-owned; CouncilSchoolRegistration is tenant-owned.
- Unique active registration must be enforced transactionally (partial unique index in PostgreSQL, or an equivalent serialized service invariant if Prisma cannot express it).
- Registration state changes and decisions are audited.

**Confidence:** High. Reversible by introducing a verified external identifier later; canonical identity is not merged automatically.

## ADR-002 — Person, account and professional identity

**Decision**

- Person is the global human identity root.
- One UserAccount belongs to exactly one Person; a Person may exist without a login account.
- A person can hold multiple CouncilMemberships and SchoolMemberships through distinct, scoped relationships.
- Teacher identity is a Person plus a TeacherProfile/professional-identifier collection; it is not duplicated for each school.
- Verified issuer identifiers (for example, a verified teacher registration number) are preferred for matching. Names, phone numbers, email addresses, and fuzzy similarity are not sufficient to auto-merge identities.
- A duplicate-person resolution process is manual, privileged, audited, and preserves references/history. No automatic merge.
- Login identifiers are normalized and globally unique by identifier type/value. Email is not assumed mandatory; at least one verified login/recovery method is required before account activation.
- Account lifecycle is PENDING_VERIFICATION, ACTIVE, LOCKED, DISABLED. Authentication version increments on credential reset, forced logout, compromise, or account disablement.

**Consequences**

- Roles are assigned through scoped memberships/assignments, not stored as one global role field on UserAccount.
- A teacher joining another school receives another SchoolMembership/StaffAssignment linked to the same Person.
- Person and UserAccount are separate so learner records do not become login accounts.

**Confidence:** High for cardinality and identity safety; medium for the exact accepted identifier issuers, which need operational verification.

## ADR-003 — Learner identifier namespace and candidate uniqueness

**Decision**

- LearnerIdentity is a global learner record with an issuer-scoped identifier: (issuer, normalized learner identifier).
- The issuer is explicit; no assumption is made that all schools or Councils use one universal identifier scheme.
- Learners have no UserAccount in the current product scope. Learner identifiers are locators, never passwords, OTP destinations, recovery secrets, or bearer credentials.
- AssessmentCandidate represents one learner's registration for one AssessmentSitting.
- Candidate uniqueness is (assessment sitting, learner identity), not simply (assessment, learner), allowing an explicitly configured repeat/sitting while preventing duplicate entry in the same sitting.
- An Assessment has one or more AssessmentSittings. A sitting has a clear registration window and status. Papers/learning areas belong to the assessment/sitting configuration; a learner is not duplicated for every subject.
- Each candidate is associated with one participating school registration at registration close. A controlled transfer workflow may change the responsible school before close; after close it requires a governed transfer record and cannot silently rewrite historical ownership.
- Candidate numbers are unique within the sitting and the responsible school participation, subject to final numbering convention.

**Consequences**

- Candidate, school participation, sitting and learner links must be validated together.
- Candidate import must detect duplicates before writing and produce a reviewable error report.
- No candidate lookup endpoint may disclose learner data using the identifier alone.

**Confidence:** Medium-high. The issuer catalogue and late-transfer rules can be configured without changing the core cardinality.

## ADR-004 — Learning-area catalogue and curriculum versioning

**Decision**

- LearningArea is a canonical, platform-managed reference catalogue, with stable codes and localized/display labels.
- Councils may enable, order, alias for display, and configure applicability of canonical learning areas through CouncilCurriculum and GradeLearningArea records; they do not create duplicate canonical learning areas for spelling/display variations.
- Curriculum configuration is versioned and effective-dated. An Assessment snapshots the exact curriculum, grade-learning-area configuration and grading rubric version it uses.
- Grades 1–9 are canonical grade references in the initial scope.
- Rubric boundaries are configuration data. No PL/EE/ME/AE/BE numeric boundaries are assumed by application code. Boundary sets must be validated for the configured scale and approved by the Council.

**Consequences**

- Historical results remain reproducible even when curriculum/rubric configuration changes.
- Council-specific display names do not change canonical identity.

**Confidence:** High for canonical catalogue/versioning; the initial catalogue contents still need source validation before seeding.

## ADR-005 — Marks entry, correction and school submission

**Decision**

- A Teacher may enter marks only for active StaffAssignments covering the school, assessment, grade/class and learning area.
- A teacher may correct their own draft mark entries while the assessment entry window is open and before the school's submission is finalized. Every change is revisioned and audited.
- A SchoolAdministrator cannot silently edit marks by virtue of being administrator.
- A Class Teacher is a teacher with an explicit class-coordination assignment/capability. They can review completeness and coordinate readiness but cannot bypass subject assignment rules or independently finalize the school's submission.
- SchoolAdministrator performs the final school submission after completeness checks. Submission freezes the submitted version for ordinary teacher editing.
- After submission, a mark change requires a correction request with reason and evidence. The designated reviewer returns/approves the request according to the assessment workflow; the original and corrected values remain in append-only revision history.
- After result release, corrections require a formal correction case and a new result release version. Released snapshots are never updated in place.

**Consequences**

- Mark value and mark revision history are distinct.
- Submission records reference immutable/versioned mark sets.
- School administration and mark-entry responsibilities remain separated.

**Confidence:** Medium-high; specific deadlines and evidence requirements are assessment configuration, not hard-coded global constants.

## ADR-006 — Council and Platform data visibility

**Decision**

- Council users see Council operational metadata and aggregate progress by default.
- Identifiable learner/candidate records, marks and individual results are not visible to Council staff merely because they administer the tenant.
- A Council may access identifiable data only through an explicitly assigned, purpose-limited review/oversight case with fields, assessment scope, named reviewers, expiry and audit.
- PlatformAdministrators see platform health, registration status and aggregate oversight by default. Individual learner/mark access is a separate break-glass support/review grant, not implied by platform role.
- School staff see only the learners and assessment records required by their active school membership and assignments.
- Organizer staff see participating-school/candidate data only within their current assessment authority and workflow step. Release permission does not imply unrestricted access to unrelated school records.
- All exports inherit the same row- and field-level rules as interactive access. Identifiable cross-Council consolidated reports are denied by default; aggregate consolidation requires explicit authorization from each affected Council.

**Consequences**

- Add purpose-limited DataAccessGrant/ReviewCase concept before any Council/Platform PII inspection feature.
- Audit access to identifiable learner data, including reads and exports.
- UI role dashboards show counts/aggregates unless the user opens an explicitly authorized case.

**Confidence:** High; intentionally privacy-preserving.

## ADR-007 — Organizer validation, correction and release authority

**Decision**

- OrganizationAdministrator may coordinate assessment setup and participation only within an active OrganizerAuthority.
- Organizer staff can validate submissions and create/resolve ValidationIssues within the authority's assessment scope.
- Organizer staff cannot directly alter school-entered marks. They may return a submission or raise a correction request for the school to address.
- Organizer release requires explicit active RELEASE_RESULTS authority, independently approved by a CouncilApprover, with scope limited to the named assessment unless Council-wide scope is explicitly granted.
- CouncilApprover cannot release results merely by approving the grant. CouncilGovernanceApprover cannot approve this permission unless separately and independently appointed as CouncilApprover, and separation-of-duties still applies.
- Release creates a versioned immutable snapshot. A later correction creates a new correction case and release version.

**Consequences**

- Organizer authority grant and release decision are separate records.
- Validation, correction, approval and release are distinct workflow transitions.

**Confidence:** High.

## ADR-008 — Governance role separation and membership lifecycle

**Decision**

- PlatformAdministrator is provisioned only through a restricted developer-controlled process.
- CouncilAdministrator manages ordinary Council operations within its Council, but cannot approve its own sensitive appointment/replacement/suspension/removal decisions.
- CouncilGovernanceApprover is a separate, narrowly scoped governance role. Temporary appointments have explicit start/end times and expire automatically.
- CouncilApprover is a distinct role restricted to approval/rejection of Organizer RELEASE_RESULTS authority requests.
- A governance request records requester, affected person, proposed change, reason, evidence reference, decision and timestamps. Requester and affected person cannot approve.
- SchoolAdministrator replacement uses a two-person process: current SchoolAdministrator initiates; an independent eligible approver confirms identity and approves transfer. If the current administrator is unavailable, a PlatformAdministrator opens a time-limited recovery case with independent verification and full audit. Platform support does not directly assume the school role.
- Council and school memberships are independently suspendable/revocable. Suspending one registration/membership does not disable the global Person or unrelated memberships.

**Consequences**

- Role changes are append-only governance events, not direct unreviewed role-field edits.
- Account disablement is separate from membership suspension.

**Confidence:** Medium; recovery verification procedures must be documented operationally.

## ADR-009 — Exports, privacy, retention and deletion

**Decision**

- Export jobs are asynchronous for large datasets, scoped at request and re-authorized at execution and download.
- Export fields are allowlisted per report type and actor; no arbitrary select-all PII export.
- Downloads use short-lived access and expire. Revoked membership/authority prevents retrieval even if the export file still exists.
- Consolidated reporting uses aggregate-only data by default. Identifiable data requires explicit approval by every affected Council and a documented lawful purpose.
- Retention periods are not invented. Each data class must have an approved schedule based on applicable Kenyan law, Council contracts, examination/education requirements and legal holds before production launch.
- Until a schedule is approved, production retention/purge automation for learner, mark, audit and release records remains disabled. Development fixtures are synthetic and may be reset.
- Erasure requests must preserve legally required examination/audit records where applicable, using controlled restriction or pseudonymization where deletion is not lawful.

**Consequences**

- RetentionSchedule and LegalHold are operational configuration concepts; values remain unpopulated pending legal review.
- No automatic destructive purge is enabled by default.

**Confidence:** High on process; actual durations remain legal review items.

## ADR-010 — Tenant isolation and database enforcement

**Decision**

- Application-level authorization and tenant-scoped repository methods are mandatory.
- Council-owned records carry an explicit Council ID where feasible, even if derivable through a parent, to support composite foreign keys and efficient scoped queries.
- Composite foreign keys/unique constraints enforce same-Council parent-child relationships wherever PostgreSQL permits.
- PostgreSQL Row-Level Security is deferred for the first implementation slice. It may be added after the connection pool, transaction-local tenant context, Prisma behavior, migration strategy and background-worker context are proven.
- RLS is defense in depth, never the only authorization layer.
- Every request and background job re-resolves membership/authority at execution time; long-lived permission caching is not permitted in the initial release.

**Consequences**

- Schema uses tenant IDs plus composite uniqueness/FKs for integrity.
- Tests must attempt foreign-tenant ID substitution on every endpoint.

**Confidence:** High for app enforcement/composite constraints; RLS decision can be revisited.

## ADR-011 — Architecture baseline for this repository

**Decision**

- Sentinel's active implementation baseline is the newer 24 November 2026 engineering brief: Next.js App Router + TypeScript web, NestJS with Fastify API, PostgreSQL + Prisma.
- The older Notion architecture note describing a Next.js-only API was written earlier and is superseded for this new Sentinel repository by the newer explicit stack direction. The older note remains historical context, not the active target.
- The monorepo keeps shared database/domain contracts separate from transport/UI. Domain logic must not depend on Next.js or NestJS.
- Authentication is first-party; no hosted third-party identity provider is introduced.
- Redis/queues are added only when a specific workflow requires them; do not add infrastructure merely for fashion.
- Production payment, SMS, email and storage credentials are not provisioned without explicit approval.

**Consequences**

- ADRs and implementation docs in Sentinel are the source of truth for the active stack.
- Notion architecture page should be updated to identify the newer repository baseline and avoid contradictory instructions.

**Confidence:** High; follows the latest explicit engineering direction.

## 10. Remaining external validation gates

These are not product ideation questions; they are evidence/compliance tasks to complete before production:

1. Verify accepted school and teacher identifier issuers against the actual Council/education registry sources.
2. Validate the canonical CBE learning-area catalogue and current grade applicability against authoritative curriculum documents.
3. Obtain legal/privacy review of child data, lawful basis, retention, access rights, cross-Council sharing and incident obligations.
4. Validate recovery and governance identity-proofing procedures with the institution.
5. Confirm contractual result-release and correction rules with participating Councils.

These gates do not block synthetic-data development, domain tests, physical schema prototyping or non-production vertical slices. They do block real learner-data onboarding and production launch.


## ADR-012 — Password hashing and credential migration

**Decision**

- New account passwords are hashed with Argon2id using the maintained `@node-rs/argon2` binding and PHC-encoded hashes.
- Initial parameters are 19 MiB memory, two iterations and parallelism one. These are a baseline, not a permanent ceiling; benchmark login latency and concurrent memory pressure in the target runtime before production.
- The previous Sentinel prototype used Node.js scrypt. The authentication service retains a narrow legacy verifier and upgrades a valid legacy hash to Argon2id after successful login using a compare-and-set update. New hashes are never scrypt.
- Password hashes and credentials never enter logs, audit metadata or API responses.

**Consequences**

- New accounts use Argon2id. Legacy scrypt support can be removed after the migration window and account inventory confirm no remaining legacy hashes.
- Authentication tests cover Argon2id verification, invalid passwords, legacy verification/rehash, refresh rotation and refresh replay response.
- Distributed login/refresh rate limiting is defined separately in ADR-013. It is now implemented for those routes; signup, verification, recovery, invitations and export limits remain production blockers until their endpoints exist and are protected.

**Confidence:** High for algorithm selection; production cost tuning remains deployment-specific.


## ADR-013 — Distributed authentication rate limiting

**Decision**

- Use Upstash Redis with the official `@upstash/ratelimit` and `@upstash/redis` SDKs for distributed API rate limiting. This avoids process-local counters that reset across instances and supports the serverless/deployment topology.
- Login limits: 30 requests per source IP and 5 per normalized email per 15 minutes. Refresh limit: 60 per source IP per 5 minutes. Registration limits: 5 per source IP and 3 per normalized email per hour. Email verification: 20 per source IP per 15 minutes. Resend: 5 per source IP and 3 per normalized email per hour. Use sliding-window policies.
- HMAC normalized email values before using them as Redis identifiers. Do not store raw email addresses in rate-limit keys.
- Disable analytics initially to reduce command volume and avoid collecting additional identifier telemetry. Use the SDK's bounded ephemeral cache to reject repeated blocked requests without a Redis round trip.
- Development may run without Redis credentials. Production must fail closed with 503 when credentials are absent, Redis fails, or the SDK reports a timeout. Requests exceeding policy return 429 with `Retry-After`.
- Do not create or activate a Redis database automatically. Provisioning and secret configuration require explicit owner authorization.

**Consequences**

- Production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in the API runtime secret store.
- `TRUST_PROXY` stays false unless the API is behind a known reverse proxy; then configure an explicit trusted proxy IP/CIDR allowlist. Wildcard trust is rejected. Production also requires a 32-byte `REFRESH_TOKEN_PEPPER`, which keys HMACed email identifiers.
- Extend rate limits to password reset, invitations, OTP and expensive exports before those features launch.
- Sliding windows cost more than fixed windows; analytics are off and blocked-identifier caching is enabled to control request volume. Revisit thresholds with real traffic and abuse telemetry.

**Implementation references:** [Upstash Ratelimit TypeScript getting started](https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted), [algorithms](https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms), and [features](https://upstash.com/docs/redis/sdks/ratelimit-ts/features).

**Confidence:** High for the distributed limiter choice; thresholds are conservative starting values and require production observation.


## ADR-014 — Public account onboarding and email verification

**Decision**

- Public registration creates a global Person, a UserAccount in `PENDING_VERIFICATION`, and an unverified EMAIL LoginIdentifier. It grants no CouncilMembership, SchoolMembership, role, school ownership or operational access. School registration is a separate request and the initial SchoolAdministrator membership remains pending until PlatformAdministrator approval.
- Verify email using a 32-byte random, base64url one-time token with a 24-hour expiry. Persist only an HMAC-SHA256 token hash keyed with `REFRESH_TOKEN_PEPPER`. A composite foreign key guarantees the verification token's LoginIdentifier belongs to the same UserAccount. A PostgreSQL partial unique index allows at most one unconsumed token per LoginIdentifier.
- Successful verification atomically consumes the token, marks the email LoginIdentifier verified and activates the account. Reuse, expiry, wrong-account linkage and invalid tokens are denied. Resending invalidates all earlier unconsumed tokens for that identifier.
- Registration and resend endpoints return the same generic response for existing and non-existing addresses to reduce account enumeration. Password is Argon2id-hashed before account persistence. Duplicate registration does not send another message; the explicit resend endpoint handles pending accounts.
- Use Resend's email API (`POST /emails`) with a server-side sending-only API key and verified sender domain. The email includes both HTML and plain-text versions. In non-production only, `DEV_EMAIL_PREVIEW=true` may return a local verification URL without sending email. This preview path is unavailable in production.
- The verification page requires an explicit user click before consuming the token, to avoid link-scanner prefetches activating accounts. Its referrer policy is `no-referrer`.

**Consequences**

- Production requires `RESEND_API_KEY`, a verified `EMAIL_FROM`, and an HTTPS `WEB_APP_URL`. No API key or sender domain is created/activated automatically.
- Email delivery failure is logged without recipient/token details; registration and resend still return the same generic `202 Accepted` response to avoid revealing account eligibility. The pending account remains unverified and can request a fresh token after delivery recovers.
- Registration, verification and resend are rate-limited by IP and/or HMACed email identifier under ADR-013.
- Password recovery, MFA and account deletion remain separate workflows.

**Implementation references:** [Resend Email API](https://resend.com/features/email-api) and [Resend REST example](https://resend.com/aws-lambda).

**Confidence:** High for the security and lifecycle boundaries; sender-domain and deliverability setup remains an owner-operated deployment task.
