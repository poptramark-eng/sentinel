# CBE Domain Model — Working Baseline

**Status:** Logical design baseline derived from the CBE Notion workspace; not an approved physical schema.  
**Scope:** Multi-council examination management. Admissions are excluded.

## 1. Domain principles

- A Council is the tenant boundary for council-owned data.
- A School is one canonical institution. Council-specific registration, school code and geography are stored in a separate CouncilSchoolRegistration.
- An Organization is not synonymous with a Council. An organization may organize an assessment only through explicit OrganizerAuthority granted by the owning Council.
- An Assessment belongs to exactly one immutable owning Council.
- A school participates through AssessmentParticipation referencing its registration in the same Council as the assessment. Do not duplicate School or create a cross-council participation edge.
- Cross-council consolidated reports are separate, explicitly authorized products; they do not merge underlying assessments or tenant-owned records.
- Global person, teacher and learner identities are separate from account credentials, memberships, assignments and assessment candidates.
- A Learner does not log in. A learner identifier is not a credential or proof of authorization.
- Marks are final numerical totals per learning area. Strand, substrand, outcome and evidence capture are out of scope.
- Historical assessment configuration and released results must be reproducible and immutable.

## 2. Bounded contexts and principal entities

### Platform and tenant governance

- **PlatformOperator:** platform-scoped identity provisioned by the developer. Not a school membership.
- **Council:** tenant root, status, slug and configuration.
- **CouncilMembership:** global person/account linked to one Council with council-scoped roles and lifecycle.
- **CouncilGovernanceRequest:** appointment, replacement, suspension or removal requests requiring independent governance approval.
- **Organization:** canonical independent organizing body and its staff.
- **OrganizerAuthority:** Council + Organization + scope + permissions + validity + grant/review/revocation history.
- **OrganizerStaffDelegation:** named, individually authenticated staff whose effective permissions cannot exceed the parent authority and cannot be delegated onward.

### Geography and school registry

Council-owned hierarchy:

Council → Region → County → Subcounty → Zone → Cluster

- **School:** canonical institution identity independent of any one council.
- **CouncilSchoolRegistration:** Council + School + council-specific Cluster + school code + approval/status + effective dates.
- A school can have registrations in multiple councils. Unique constraints are expected for (Council, School) and (Council, CouncilSchoolCode).
- The cluster must belong to the same Council as the registration.
- Suspending a registration affects only that council's registration and eligibility; it must not deactivate the canonical School or another council's registration.
- Initial school registration requires Platform Administrator approval. The registrant becomes the initial School Administrator, but the account/membership and school-management capabilities remain pending until approval.

### People, accounts and school staffing

- **Person:** minimal global human identity.
- **UserAccount:** authentication principal and credential lifecycle; may be linked to a Person.
- **TeacherIdentity:** global teacher identity linked to Person; verified issuer/identifier uniqueness, never name-only matching.
- **SchoolMembership:** person + CouncilSchoolRegistration + school role + status + dates.
- **StaffAssignment:** membership + optional grade/class/learning-area scope + assignment type and dates.
- One teacher can have memberships and assignments at multiple schools without duplicate global identity.
- A School Administrator may create a new teacher identity or associate an existing verified identity with their school.
- School-level operational actors are School Administrator, Teacher and Learner. Learners are records, not login users.

### Curriculum and grading

- **Curriculum:** versioned council-owned configuration unless an explicitly approved shared-curriculum model is adopted.
- **Grade:** canonical levels Grades 1–9.
- **LearningArea:** canonical or council-configured learning-area identity; ownership remains an explicit design question.
- **GradeLearningArea:** curriculum + grade + learning area, defining grade applicability and display order.
- **GradingRubric:** versioned rubric associated with council/curriculum/grade.
- **RubricLevel:** configurable label, code, numeric boundaries and order.
- Never hard-code unconfirmed rubric boundaries. Assessment records must retain the exact configuration version used.

### Assessment and participation

- **Assessment:** owning Council, organizer Organization, reference, type, year/period, status and creator. The organizer must hold current authority from the owning Council.
- **AssessmentGrade:** grades covered.
- **AssessmentLearningArea:** learning areas actually assessed for each applicable grade, maximum mark, precision and order.
- **AssessmentWindow:** registration, mark-entry, correction and submission windows.
- **AssessmentParticipation:** Assessment + CouncilSchoolRegistration + participation status and lifecycle.
- An assessment cannot reference a school registration owned by another council.

### Learners, candidates and marks

- **LearnerIdentity:** globally unique learner identity under an issuer policy that remains to be finalized.
- **AssessmentCandidate:** Assessment + AssessmentParticipation + LearnerIdentity + Grade, with candidate number and required assessment-time snapshots.
- One candidate per learner per assessment is the current provisional uniqueness rule. Multi-paper/session/repeat-candidate rules must be resolved before a physical unique constraint is selected.
- **Mark:** candidate + configured assessment learning area + NUMERIC value + actor/time.
- **MarkRevision:** append-only prior/new values, actor, reason, timestamp and approval context.
- Candidate grade must be covered by the assessment; learning area must apply to that grade; mark must be within configured maximum and precision.

### Submission, governance and release

- **SchoolSubmission:** participation + version + submitter + timestamp + state.
- **ValidationIssue:** submission + severity + code + field/entity reference + resolution history.
- **Review:** review action and findings by an authorized reviewer.
- **Approval:** append-only decision by a distinct authority; approval is not equivalent to release.
- **ResultRelease:** assessment + immutable version + release actor + timestamp + correction/replacement linkage.
- **ResultSnapshot:** immutable candidate result/rank payload for a release.
- Do not use one generic Assessment.approved flag to represent all workflow transitions.

### Audit, notification and reporting

- **AuditEvent:** immutable actor, tenant, action, resource, correlation ID, time and minimal before/after metadata.
- **Notification:** delivery intent and status, without unnecessary sensitive payload retention.
- **ExportJob:** requester, tenant, authorized scope, filters, status and expiry. Re-authorize at execution and download.
- **ConsolidatedReportAuthorization:** each affected Council explicitly authorizes purpose, fields, recipients and validity period. Identifiable learner/candidate data is excluded by default; inclusion requires explicit authorization from every affected Council.

## 3. Core relationship map

~~~mermaid
erDiagram
  COUNCIL ||--o{ COUNCIL_MEMBERSHIP : has
  COUNCIL ||--o{ REGION : owns
  REGION ||--o{ COUNTY : contains
  COUNTY ||--o{ SUBCOUNTY : contains
  SUBCOUNTY ||--o{ ZONE : contains
  ZONE ||--o{ CLUSTER : contains
  COUNCIL ||--o{ COUNCIL_SCHOOL_REGISTRATION : registers
  SCHOOL ||--o{ COUNCIL_SCHOOL_REGISTRATION : registered_as
  CLUSTER ||--o{ COUNCIL_SCHOOL_REGISTRATION : locates
  COUNCIL ||--o{ ORGANIZER_AUTHORITY : grants
  ORGANIZATION ||--o{ ORGANIZER_AUTHORITY : receives
  COUNCIL ||--o{ ASSESSMENT : owns
  ORGANIZATION ||--o{ ASSESSMENT : organizes
  ASSESSMENT ||--o{ ASSESSMENT_PARTICIPATION : includes
  COUNCIL_SCHOOL_REGISTRATION ||--o{ ASSESSMENT_PARTICIPATION : participates
  PERSON ||--o| USER_ACCOUNT : may_have
  PERSON ||--o| TEACHER_IDENTITY : may_be
  PERSON ||--o{ SCHOOL_MEMBERSHIP : joins
  COUNCIL_SCHOOL_REGISTRATION ||--o{ SCHOOL_MEMBERSHIP : has
  SCHOOL_MEMBERSHIP ||--o{ STAFF_ASSIGNMENT : receives
  LEARNER_IDENTITY ||--o{ ASSESSMENT_CANDIDATE : enters
  ASSESSMENT_PARTICIPATION ||--o{ ASSESSMENT_CANDIDATE : registers
  ASSESSMENT_CANDIDATE ||--o{ MARK : receives
  ASSESSMENT_LEARNING_AREA ||--o{ MARK : defines
  MARK ||--o{ MARK_REVISION : history
  ASSESSMENT_PARTICIPATION ||--o{ SCHOOL_SUBMISSION : submits
  SCHOOL_SUBMISSION ||--o{ VALIDATION_ISSUE : has
  ASSESSMENT ||--o{ APPROVAL : governed_by
  ASSESSMENT ||--o{ RESULT_RELEASE : releases
  RESULT_RELEASE ||--o{ RESULT_SNAPSHOT : snapshots
~~~

## 4. Integrity invariants

1. Every council-owned row is scoped to exactly one Council, directly or through a constrained parent relationship.
2. Every assessment belongs to exactly one Council; its Council ownership is immutable in normal operations.
3. Organizer permissions are granted by the owning Council and are assessment-specific by default; council-wide scope is explicit.
4. AssessmentParticipation references a CouncilSchoolRegistration from the same Council as the Assessment.
5. School canonical identity is never duplicated to satisfy council-specific school codes or geography.
6. Global teacher identity is never duplicated to represent another school membership.
7. Learner identifiers are never accepted as authentication secrets.
8. Candidate, grade, participation, assessment and learning-area references must be mutually consistent.
9. Marks use fixed precision numeric types and configured limits; corrections append revision history.
10. Submission, review, approval and release are distinct auditable events.
11. Result releases and snapshots are immutable; corrections create a new version.
12. Background jobs, exports, reports and downloads repeat authorization checks at execution time.

## 5. Explicitly unresolved before physical schema/migrations

- Canonical school identity authority and global identifiers.
- School re-registration episode/reactivation and historical registration policy.
- Full Platform/Council/School role-permission matrix.
- Verified person/teacher identity matching, duplicate resolution and TSC/other issuer handling.
- Learner identifier issuer, correction and multiple papers/sessions/repeat candidate uniqueness.
- Canonical versus council-owned learning-area catalogue.
- Mark correction authority and post-release correction/approval policy.
- Exact internal/external workflow state names, guards, actor authority and reopening paths.
- Consolidated-report aggregation/anonymization thresholds, recipient controls, retention and deletion.
- Privacy retention schedule and lawful-disposal exceptions.
- Exact Council membership and governance persistence, separation-of-duties constraints, and recovery lifecycle.

## 6. Migration gate

This document is a logical design baseline only. Do not create or apply a Prisma migration until the open items above are resolved, the ownership and authorization matrices are reviewed, and the data dictionary plus migration/rollback plan are approved. No real learner data is permitted in development.
