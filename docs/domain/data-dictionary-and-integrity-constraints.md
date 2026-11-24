# Data Dictionary and Integrity Constraints — Draft 0.1

**Status:** Logical data dictionary baseline; selected design decisions are now adopted in `docs/decisions/decision-register.md` (ADR-001 through ADR-012).
**Source baseline:** Sentinel domain model, tenant ownership matrix, workflow state machines, authorization policy contract, and current CBE requirements.
**Migration gate:** The first physical migration is limited to the foundation slice documented in `docs/architecture/physical-data-model-foundation.md`. Assessment/candidate/marks/results models remain separate implementation slices. External legal and registry validation gates still apply.

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
| SchoolMembership | CouncilSchoolRegistration + Person | Membership ID; registration; Person; school role; status; dates | A membership belongs to one registration. Role and membership lifecycle are constrained by approved policy. | Personal/access control; retention TBD |
| StaffAssignment | SchoolMembership | Assignment ID; assignment type; optional grade/class/stream/learning-area; effective dates; status | Assignment cannot outlive or exceed membership. Subject/class capabilities are assignment-scoped, not global roles. | Personal/employment; retention TBD |

## 4. Curriculum and assessment dictionary

| Concept | Ownership | Core attributes / references | Candidate integrity constraints | Sensitivity / retention |
|---|---|---|---|---|
| Curriculum | Proposed Council-owned/versioned | Curriculum ID; Council; version; effective dates; status | Ownership may change only if a shared canonical curriculum is explicitly approved. | Configuration; retain versions used by assessments |
| Grade | Shared reference or Council-configured | Grade ID/code; display name; order | Grades 1–9 are in current scope. Exact global-vs-tenant reference strategy TBD. | Low sensitivity; retain |
| LearningArea | Ownership TBD | LearningArea ID; canonical code/name or Council-specific metadata; status | Decide canonical catalogue versus Council-owned catalogue before uniqueness constraints. | Low sensitivity; retain versions |
| GradeLearningArea | Curriculum + Grade + LearningArea | Applicability; order; effective version | A learning area appears at most once per curriculum/grade version. |
| GradingRubric | Council/curriculum version | Rubric ID; version; grade/curriculum; effective dates | Never hard-code unapproved grade boundaries. Assessment must snapshot exact rubric version. | Configuration; retain versions used |
| RubricLevel | GradingRubric | Code/label; numeric boundaries; order | Boundaries must not overlap or leave gaps unless explicitly permitted by rubric policy. Boundary policy requires Council approval. | Configuration; retain versions used |
| Assessment | One owning Council | Assessment ID; Council; Organization; title/reference; type; year/period; status; creator | Council ownership immutable in normal operations. Organizer must have current authority from same Council. | Confidential assessment metadata; retain |
| AssessmentGrade | Assessment | Grade reference | Grade must be configured and valid for the assessment. | Operational; retain |
| AssessmentLearningArea | Assessment + grade | LearningArea; maximum mark; precision; order; rubric version | Must apply to the grade and assessment. Unique assessment/grade/learning-area tuple. Maximum and precision are explicit configuration, not assumed. | Assessment confidential; retain |
| AssessmentWindow | Assessment | Window type; opens/closes; timezone; state | Window types and transition policy must be explicit. Close/open boundaries must be validated. | Operational; retain |
| AssessmentParticipation | Assessment + CouncilSchoolRegistration | Participation ID; assessment; registration; status; lifecycle | Assessment Council must equal registration Council. Candidate participation cannot be created from a different Council's registration. | School assessment confidential; retain |

## 5. Learner, candidate and marks dictionary

| Concept | Ownership | Core attributes / references | Candidate integrity constraints | Sensitivity / retention |
|---|---|---|---|---|
| LearnerIdentity | Global identity registry, issuer policy TBD | Learner ID; issuer; minimal identity attributes; status | Learner ID is globally unique only under a defined issuer/namespace policy. No login account or authentication secret. | Highly sensitive child data; retention TBD |
| AssessmentCandidate | AssessmentParticipation + LearnerIdentity | Candidate ID; participation; learner; grade; candidate number; assessment-time snapshots | Candidate grade must be covered by assessment. One candidate per learner per assessment is provisional only; multi-paper/session/repeat rules are unresolved. | Highly sensitive child/assessment data; retention TBD |
| Mark | AssessmentCandidate + AssessmentLearningArea | Mark ID; candidate; learning area; numeric value; entered by; timestamp; version/state | Candidate and learning area must belong to same assessment context; value within configured max and precision. | Highly sensitive educational data; retention TBD |
| MarkRevision | Mark | Prior/new value; actor; reason; timestamp; approval context | Append-only history; corrections never silently overwrite history. Post-submission and post-release correction rules TBD. | Highly sensitive audit; retention TBD |
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
6. School membership: SchoolMembership references a Person and one CouncilSchoolRegistration; StaffAssignment references that membership.
7. Candidate consistency: AssessmentCandidate's LearnerIdentity, Grade, AssessmentParticipation and Assessment must be mutually consistent.
8. Mark consistency: Mark's candidate and AssessmentLearningArea must resolve to the same Assessment and grade applicability.
9. Mark numeric rules: value is non-negative, no greater than configured maximum, and respects configured decimal precision.
10. Workflow history: submissions, reviews, approvals, mark revisions and releases are append-only histories with actor and timestamp.
11. Result immutability: ResultSnapshot belongs to exactly one ResultRelease; released snapshot payload is immutable.
12. Export isolation: ExportJob scope is no broader than the requester's current permission at both execution and retrieval.
13. Audit integrity: actor, tenant, and resource references must be mutually consistent; event records cannot be updated by ordinary application operations.
14. Identity safety: teacher matching requires verified issuer identifiers or controlled review; learner IDs are never authentication credentials.

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

## 9. External validation gates

1. Verify accepted school and teacher identifier issuers against authoritative education/registry sources.
2. Validate the canonical CBE learning-area catalogue and grade applicability against authoritative curriculum documents before seeding production reference data.
3. Obtain legal/privacy review of child data, lawful basis, retention, access rights, cross-Council sharing and incident obligations.
4. Validate SchoolAdministrator recovery identity-proofing procedures with participating institutions.
5. Confirm contractual result-release, correction and appeal rules with participating Councils.
6. Configure and verify production data retention schedules before any real learner data is onboarded.

These gates do not block synthetic-data development, unit tests, physical schema prototyping or non-production vertical slices. They do block real learner-data onboarding and production launch.

## 9. Recommended next review sequence

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


## 10. Foundation implementation alignment — 24 November 2026

The first Prisma foundation slice now implements the following refinements:

- PlatformOperator is a separate provisioned record linked one-to-one to UserAccount; platform authority is not a user-editable global role field.
- RefreshToken stores only a keyed token hash, family ID, expiry, revocation timestamp and replacement reference. Raw refresh tokens are not persisted.
- CouncilSchoolRegistration stores submittedSchoolName separately from the canonical School name so reviewers can inspect what the registrant claimed without mutating canonical identity.
- SchoolIdentifier claims are initially unverified. A PlatformAdministrator must verify the claim with its issuer before the registration can be approved.
- AuditEvent captures account authentication and registration lifecycle decisions.

The foundation migration is generated and CI-applied to ephemeral PostgreSQL 18; these structures have not yet been applied to a persistent development, staging or production database.
