# Data Dictionary and Integrity Constraints — Draft 0.1

**Status:** Logical data dictionary baseline; selected design decisions are adopted in `docs/decisions/decision-register.md` (ADR-001 through ADR-020).
**Source baseline:** Sentinel domain model, tenant ownership matrix, workflow state machines, authorization policy contract, KICD source review and current CBE requirements.
**Migration gate:** Foundation and school-class slices are implemented. Assessment/candidate/marks/results models remain separate implementation slices. Real learner data is blocked until the child-data release gates in `docs/research/kenya-child-data-privacy-review.md` are evidenced.

## 1. Design conventions

- **Global** means platform-wide identity data, not owned by an individual Council.
- **Council-owned** means a row belongs to exactly one Council, directly or through a constrained parent.
- **School-scoped** means data is attached to one CouncilSchoolRegistration, not merely to a canonical School.
- **Assessment-scoped** means data is attached to one Assessment and its participation records.
- **Sensitive** means personal, learner, assessment, mark, or security information requiring field-level access and minimized disclosure.
- **Retention TBD** means no retention period is invented here. A retention schedule and lawful-disposal policy are prerequisites to production data.
- Names below describe conceptual fields and keys. They are not finalized column names or Prisma types.

## 2. Platform, tenant and governance dictionary

| Concept | Ownership | Core attributes / references | Candidate integrity constraints | Sensitivity / retention |
|---|---|---|---|---|
| Person | Global | Stable person ID; verified identity attributes; lifecycle | Do not merge by name alone. Identity resolution must use verified issuer identifiers and a controlled duplicate-resolution process. | Personal; retention TBD |
| UserAccount | Global | Account ID; one Person reference; login identifier(s); Argon2id password hash; status; auth version; verification state | One account per Person; email login identifier unique by normalized value; pending accounts cannot authenticate. A Person may have no account; learner records do not imply accounts. | Highly sensitive; security retention TBD |
| EmailVerificationToken | Account + LoginIdentifier | HMAC token hash; 24-hour expiry; consumed timestamp | Unique token hash; composite FK binds identifier to same account; partial unique index allows one unconsumed token per identifier; resend consumes prior token. | Credential-like metadata; short-lived |
| PlatformOperator | Platform | UserAccount/Person reference; platform role; provisioning metadata; status | Provisioned only by developer-controlled process; public account registration never grants platform roles. | Highly sensitive; audit retention TBD |
| Council | Tenant root | Council ID; name; slug; status; settings | Stable ID; slug uniqueness policy; all Council-owned descendants resolve to one Council. | Business confidential; retention TBD |
| CouncilMembership | Council + Person | Council; Person; roles/capabilities; status; effective dates; inviter | Candidate unique active membership per (Council, Person), subject to role-history model. Role assignment must be constrained by approved catalogue. | Personal/access control; retention TBD |
| CouncilGovernanceRequest | Council | Request type; subject; requester; approver; reason; status; timestamps | Requester and affected Person cannot approve. Approval actor must be independently eligible and unconflicted. | Highly sensitive governance; retention TBD |
| Organization | Global canonical organization | Organization ID; legal/display identity; status | Do not equate Organization with Council. Canonical identity/issuer policy remains open. | Business confidential; retention TBD |
| OrganizerAuthority | Council + Organization | Scope type; assessment reference if scoped; permission set; grantor; validity; status; review/revocation metadata | Council must own referenced Assessment. Assessment scope is default; council-wide scope explicit. Release permission requires independent CouncilApprover decision. | High privilege; audit retention TBD |
| OrganizerStaffDelegation | Parent OrganizerAuthority + Person/account | Named staff; delegated permission subset; delegated scope subset; validity; status | No onward delegation. Effective authority cannot exceed parent. Parent status/expiry immediately bounds child. | Personal/high privilege; retention TBD |

## 3. Geography and school registry dictionary

| Concept | Ownership | Core attributes / references | Candidate integrity constraints | Sensitivity / retention |
|---|---|---|---|---|
| Region | Council | Region ID; Council; name/code; status | Unique within Council by approved natural key. | Operational; retention TBD |
| County | Council via Region | County ID; Region; name/code | Parent Region must belong to same Council. | Operational; retention TBD |
| Subcounty | Council via County | Subcounty ID; County; name/code | Parent County must belong to same Council. | Operational; retention TBD |
| Zone | Council via Subcounty | Zone ID; Subcounty; name/code | Parent Subcounty must belong to same Council. | Operational; retention TBD |
| Cluster | Council via Zone | Cluster ID; Zone; name/code | Parent Zone must belong to same Council. | Operational; retention TBD |
| School | Global canonical institution | School ID; canonical identity; status | One institution identity independent of Council registrations. Global identifier and canonical authority are TBD. | Institutional; retention TBD |
| CouncilSchoolRegistration | Council + School | Registration ID; Council; School; Council-specific code; Cluster; status; approval; effective dates; initial administrator reference | Candidate unique (Council, School) and (Council, SchoolCode); Cluster must belong to same Council. Multiple Council registrations for one School are valid. | Institutional + contact data; retention TBD |
| SchoolMembership | CouncilSchoolRegistration + Person | Membership ID; registration; Person; school role; status; dates | A membership belongs to one registration. The same global Person may hold TEACHER memberships in multiple registrations; unique (registration, Person, role) prevents duplicates within one school. Teacher linking requires an active account with a verified email. | Personal/access control; retention TBD |
| SchoolClass | CouncilSchoolRegistration | Class ID; registration; academic year; grade; stream name/code; status | Class belongs to one approved school registration. Unique registration + academic year + grade + normalized stream code. | Operational; retention TBD |
| LearnerEnrollment | SchoolClass + LearnerIdentity | Enrollment ID; class; learner; effective dates; status; transfer reference | Enrollment history is retained. Active enrollment must resolve to the same registration as the class. Transfers do not duplicate LearnerIdentity. | Highly sensitive child data; retention TBD |
| StaffAssignment | SchoolMembership + SchoolClass | Assignment ID; assignment type (CLASS_TEACHER/SUBJECT_TEACHER); optional LearningArea; effective dates; status | Assignment cannot outlive membership. CLASS_TEACHER has no learning area; SUBJECT_TEACHER requires one. Teacher membership alone grants no class/mark access. | Personal/employment; retention TBD |

## 4. Curriculum and assessment dictionary

| Concept | Ownership | Core attributes / references | Candidate integrity constraints | Sensitivity / retention |
|---|---|---|---|---|
| Curriculum | Global platform-managed reference | Curriculum ID; code; name; version; source title/URL; publication/effective dates; status | Published versions are immutable. A curriculum update creates a new version; historical assessments retain their version. | Configuration; retain versions used |
| Grade | Global canonical reference | Grade ID/code; display name; order | Grades 1–9 are canonical in the initial regular CBE track. Special Needs and Senior School are separate future tracks. | Low sensitivity; retain |
| LearningArea | Global canonical catalogue | LearningArea ID; stable code; canonical name; localized/display labels; status | Canonical identity is global; Councils may alias for display but cannot create duplicate canonical areas. | Low sensitivity; retain versions |
| GradeLearningArea | Curriculum version + Grade + LearningArea | Applicability; core/optional; order; source reference | A learning area appears at most once per curriculum/grade version. Grade applicability is explicit; grade bands do not replace grade-level records. | Configuration; retain versions used |
| CouncilCurriculum | Council + Curriculum | Selected curriculum version; status; effective dates; assigned by | Council configuration is versioned/effective-dated. One active curriculum selection for new assessments at a time; historical assessments retain prior configuration. | Tenant configuration; retain versions used |
| CouncilGradeLearningArea | CouncilCurriculum + GradeLearningArea | Enabled/disabled; display alias; order override; assessment eligibility | Configuration must reference a grade-learning-area mapping in the selected curriculum version. No cross-curriculum mapping. | Tenant configuration; retain versions used |
| GradingRubric | Council + Curriculum version + Grade (+ optional LearningArea) | Rubric ID; version; scope; effective dates; status | Rubric boundaries are Council configuration, never hard-coded. Assessment snapshots exact published rubric. Grade-wide and learning-area-specific rubrics must not ambiguously overlap. | Configuration; retain versions used |
| RubricLevel | GradingRubric | Code/label; optional numeric min/max; order; description | Configured bands must be valid and non-overlapping. Qualitative-only levels may omit numeric bounds when explicitly configured. | Configuration; retain versions used |
| Assessment | One owning Council | Assessment ID; Council; Organization; title/reference; type; year/period; status; creator | Council ownership immutable in normal operations. Organizer must have current authority from same Council. | Confidential assessment metadata; retain |
| AssessmentGrade | Assessment | Grade reference | Grade must be configured and valid for the assessment. | Operational; retain |
| AssessmentLearningArea | Assessment + grade | LearningArea; maximum mark; precision; order; rubric version | Must apply to the grade and assessment. Unique assessment/grade/learning-area tuple. Maximum and precision are explicit configuration, not assumed. | Assessment confidential; retain |
| AssessmentWindow | AssessmentSitting | Window type; opens/closes; timezone; state | Window types and transition policy must be explicit. Close/open boundaries must be validated. | Operational; retain |
| AssessmentSitting | Assessment | Sitting ID; code/name; registration window; status; schedule | One Assessment may have multiple explicitly configured sittings. Sitting owns candidate uniqueness and candidate numbering scope. | Confidential assessment metadata; retain |
| AssessmentParticipation | Assessment + CouncilSchoolRegistration | Participation ID; assessment; registration; status; lifecycle | Assessment Council must equal registration Council. Candidate participation cannot be created from a different Council's registration. | School assessment confidential; retain |

## 5. Learner, candidate and marks dictionary

| Concept | Ownership | Core attributes / references | Candidate integrity constraints | Sensitivity / retention |
|---|---|---|---|---|
| LearnerIdentity | Global identity registry | Internal ID; issuer-scoped identifier; minimal identity attributes; status | Unique (issuer, normalized learner identifier). Learners have no UserAccount in current scope; identifiers are locators, never credentials. | Highly sensitive child data; retention TBD |
| AssessmentCandidate | AssessmentSitting + AssessmentParticipation + LearnerIdentity | Candidate ID; sitting; participation; learner; grade; candidate number; assessment-time snapshots | Unique (AssessmentSitting, LearnerIdentity). Candidate number unique within sitting + responsible school participation. One candidate belongs to one participating school at registration close. | Highly sensitive child/assessment data; retention TBD |
| Mark | AssessmentCandidate + AssessmentLearningArea | Mark ID; candidate; learning area; numeric value; entered by; timestamp; version/state | Candidate and learning area must belong to same assessment context; value within configured max and precision. | Highly sensitive educational data; retention TBD |
| MarkRevision | Mark | Prior/new value; actor; reason; timestamp; approval context | Append-only history. Draft corrections require the active SubjectTeacher assignment; post-submission corrections follow a governed return/correction workflow; post-release corrections create a new result version. | Highly sensitive audit; retention TBD |
| MarkEntryBatch | SchoolMembership/assignment + assessment participation | Batch ID; scope; idempotency key; status; counts; timestamps | Batch scope must be one authorized school/assessment/assignment context. Idempotency key prevents duplicate processing. | Sensitive; retention TBD |

## 6. Workflow, result and operational dictionary

| Concept | Ownership | Core attributes / references | Candidate integrity constraints | Sensitivity / retention |
|---|---|---|---|---|
| SchoolSubmission | AssessmentParticipation | Submission ID; version; submitter; timestamp; state | Submission actor must be authorized for participation. Version is monotonic; retries idempotent. | Highly sensitive; retention TBD |
| ValidationIssue | SchoolSubmission | Code; severity; field/entity reference; status; resolution history | Issue must refer to a resource in the same submission/assessment scope. Resolution is auditable. | Sensitive; retention TBD |
| Review | Assessment/submission | Reviewer; findings; action; timestamp | Reviewer must have current scope; review does not implicitly approve or release. | Sensitive governance; retention TBD |
| Approval | Assessment workflow | Decision type; actor; reason; timestamp; subject/version | Actor must be distinct, active and unconflicted where required. Approval is append-only and distinct from release. | High governance; retention TBD |
| ResultRelease | Assessment | Release ID; version; actor; timestamp; correction/replacement reference | Release versions are immutable and monotonic. New correction creates a new release version. | Highly sensitive; retain per approved education/legal policy |
| ResultSnapshot | ResultRelease | Candidate result; grade/learning-area summaries; rank payload; source version | Immutable snapshot. No post-release mutation. Recalculation creates a new version. | Highly sensitive child/educational data; retention TBD |
| AuditEvent | Actor + tenant/resource scope | Actor; action; resource; decision; reason; correlation ID; timestamp; minimal before/after | Append-only; no credentials/tokens; tenant scope must be consistent with resource. | Security-sensitive; retention TBD |
| Notification | Recipient + originating tenant | Recipient; event; channel; delivery state; timestamps | Notification content minimized; recipient must be authorized at dispatch where it contains protected data. | Personal; retention TBD |
| ExportJob | Requester + authorized scope | Requester; Council/school/assessment scope; filters; status; expiry; storage reference | Re-authorize at execution and download. Expired/revoked access cancels or denies retrieval. | Highly sensitive; retention TBD |
| ConsolidatedReportAuthorization | Every affected Council | Purpose; allowed fields; recipients; validity; approvals; status | Every affected Council must explicitly authorize. Purpose, fields, recipients and validity are bounded. Identifiable learner data excluded by default. | Highly sensitive governance; retention TBD |
| FinancialLedgerEntry | Platform billing account or explicitly scoped tenant | Account; transaction; amount/currency; provider reference; state | Financial scope and separation from educational records must be defined before enabling payments. | Financial; retention/legal schedule TBD |

## 7. Cross-record integrity constraints

These are logical invariants to preserve in the eventual schema and service layer. Exact Prisma relation syntax and PostgreSQL constraint implementation will be designed only after the open decisions are approved.

1. Council hierarchy: every Region, County, Subcounty, Zone and Cluster resolves to the same Council through its ancestors.
2. School registration: CouncilSchoolRegistration references one canonical School and one Cluster owned by the same Council.
3. School participation: AssessmentParticipation references an Assessment and CouncilSchoolRegistration with equal Council IDs.
4. Organizer authority: OrganizerAuthority's Council equals the Assessment Council whenever its scope is assessment-specific.
5. Staff delegation: delegated permissions, scope and validity are subsets of parent authority; child cannot outlive parent.
6. School membership: SchoolMembership references a Person and one CouncilSchoolRegistration; the same Person can have school memberships across multiple registrations. StaffAssignment references that membership.
7. Candidate consistency: AssessmentCandidate's LearnerIdentity, Grade, AssessmentSitting, AssessmentParticipation and Assessment must be mutually consistent. Enforce unique (AssessmentSitting, LearnerIdentity) and candidate-number uniqueness within the sitting/participation scope.
8. Mark consistency: Mark's candidate and AssessmentLearningArea must resolve to the same Assessment and grade applicability.
9. Mark numeric rules: value is non-negative, no greater than configured maximum, and respects configured decimal precision.
10. Workflow history: submissions, reviews, approvals, mark revisions and releases are append-only histories with actor and timestamp.
11. Result immutability: ResultSnapshot belongs to exactly one ResultRelease; released snapshot payload is immutable.
12. Export isolation: ExportJob scope is no broader than the requester's current permission at both execution and retrieval.
13. Audit integrity: actor, tenant, and resource references must be mutually consistent; event records cannot be updated by ordinary application operations.
14. Identity safety: teacher matching requires an exact verified email identifier; learner IDs are never authentication credentials.
15. School class consistency: SchoolClass belongs to one registration and academic year; LearnerEnrollment resolves through that class to the same registration.
16. Staff assignment consistency: StaffAssignment references an active SchoolMembership and a class under the same registration; SUBJECT_TEACHER requires a learning area, CLASS_TEACHER forbids one. Assignment validity cannot exceed membership validity.

## 8. Decisions adopted since draft 0.1

The earlier open items have been resolved as working engineering defaults by the decision register. These are implementation baselines, not claims that statutory, Council-contract or registry validation has been completed.

| Topic | Adopted decision | Source |
|---|---|---|
| Canonical School identity and registration history | Global School identity; issuer-scoped identifiers; separate Council registration episodes; only one active episode per Council/School | ADR-001 |
| Person, account and teacher identity | One account per Person; one global teacher identity; scoped school memberships/assignments; no name-only auto-merge | ADR-002 |
| Learner identity and candidate uniqueness | Issuer-scoped learner identifier; candidate unique per AssessmentSitting; governed transfer after registration close | ADR-003 |
| Learning areas and curriculum | Canonical platform-managed learning-area catalogue; Council curriculum configuration and version snapshots; configurable rubric boundaries | ADR-004 |
| Mark correction and submission | Teachers correct own draft marks before final submission; SchoolAdministrator finalizes school submission; later corrections use governed requests and new release versions | ADR-005 |
| Council and Platform data visibility | Aggregate oversight by default; identifiable learner/mark access requires purpose-limited review grant; exports inherit same scope | ADR-006 |
| Organizer validation and release | Organizer may validate/return, not directly edit school marks; RELEASE_RESULTS requires independent CouncilApprover approval | ADR-007 |
| Governance lifecycle | Separate Council governance and release approver roles; two-person SchoolAdministrator replacement with audited recovery | ADR-008 |
| Export and retention | Allowlisted fields, async reauthorization, aggregate-only cross-Council reporting by default; retention durations await legal review | ADR-009 |
| Tenant enforcement | Application scope plus tenant IDs/composite constraints; RLS deferred until connection/transaction context is proven | ADR-010 |
| Teacher membership linking | Existing global Person is linked by exact verified email; no name-only match; invitation/provisioning is a separate future workflow | ADR-017 |
| Curriculum source and publication | Canonical platform catalogue; versioned KICD source; Council grade-area configuration; immutable assessment snapshot | ADR-018 |
| Candidate uniqueness and mark correction | Candidate unique per AssessmentSitting + LearnerIdentity; append-only mark revisions and governed post-submission/release correction | ADR-019 |
| School classes and staff assignments | School-scoped classes/enrollments; CLASS_TEACHER and SUBJECT_TEACHER are effective-dated assignment capabilities | ADR-020 |
| School class and Class Teacher | Class keyed by registration/year/grade/stream; one active Class Teacher assignment per class; coordination only | ADR-021 |
| Child-data processing | No real learner data until lawful basis, parental/guardian safeguards, DPIA, rights, retention and processor/transfer controls are evidenced | ADR-022 |

## 9. External validation gates

1. Verify accepted school and teacher identifier issuers against authoritative education/registry sources.
2. Validate the canonical CBE learning-area catalogue and grade applicability against authoritative curriculum documents before seeding production reference data.
3. Obtain legal/privacy review of child data, lawful basis, retention, access rights, cross-Council sharing and incident obligations.
4. Validate SchoolAdministrator recovery identity-proofing procedures with participating institutions.
5. Confirm contractual result-release, correction and appeal rules with participating Councils.
6. Configure and verify production data retention schedules before any real learner data is onboarded.

These gates do not block synthetic-data development, unit tests, physical schema prototyping or non-production vertical slices. They do block real learner-data onboarding and production launch.

## 10. Recommended next review sequence

1. Resolve canonical School and registration history.
2. Resolve Person, UserAccount, TeacherIdentity and LearnerIdentity issuer/uniqueness policies.
3. Resolve candidate uniqueness across sessions/papers/repeats.
4. Decide LearningArea ownership and curriculum versioning.
5. Finalize mark correction and post-release correction authority.
6. Finalize the remaining role/action and field-level visibility matrix.
7. Approve retention, privacy, export and consolidated-report rules.
8. Produce a physical ERD, composite key/FK proposal, index plan, migration sequence and rollback plan.
9. Only then generate Prisma models and migrations.

No real learner or candidate data should be used in development or test fixtures. Use synthetic identities and marks only.


## 11. Foundation implementation alignment — 24 November 2026

The first Prisma foundation slice now implements the following refinements:

- PlatformOperator is a separate provisioned record linked one-to-one to UserAccount; platform authority is not a user-editable global role field.
- RefreshToken stores only a keyed token hash, family ID, expiry, revocation timestamp and replacement reference. Raw refresh tokens are not persisted.
- CouncilSchoolRegistration stores submittedSchoolName separately from the canonical School name so reviewers can inspect what the registrant claimed without mutating canonical identity.
- SchoolIdentifier claims are initially unverified. A PlatformAdministrator must verify the claim with its issuer before the registration can be approved.
- AuditEvent captures account authentication and registration lifecycle decisions.

The foundation migration is generated and CI-applied to ephemeral PostgreSQL 18; these structures have not yet been applied to a persistent development, staging or production database.
