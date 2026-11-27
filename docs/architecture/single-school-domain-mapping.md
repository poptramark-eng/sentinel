# Single-school domain mapping: legacy Sentinel to Supabase

**Status:** Design inventory based on the checked-in Prisma schema; target mappings are proposals for review through implementation tests.  
**Date:** 28 November 2026  
**Target:** Supabase PostgreSQL + Auth + RLS + Storage + Edge Functions

## 1. Scope boundary

The first release represents one configured school. No council, organizer, external assessment invitation, school participation, multi-council tenancy or inter-school analytics is required. Keep school ownership explicit in the database even though each deployment is dedicated to one school. This supports safe scoping and a deliberate future expansion without making the first release multi-tenant.

## 2. Identity and access mapping

| Current Prisma entity | Single-school Supabase target | Treatment |
| --- | --- | --- |
| `Person` | `user_profiles` for staff identity/profile | Keep useful name/profile fields; separate identity from school role. |
| `UserAccount` | Supabase `auth.users` + app `user_profiles` | Supabase Auth owns credentials, sessions and tokens. App profile is keyed to auth user UUID. |
| `LoginIdentifier` | Supabase Auth identity/email/phone | Remove app-owned login identifier authority; do not duplicate credentials. |
| `EmailVerificationToken`, `PasswordResetToken`, `RefreshToken` | Supabase Auth workflows | Retire after recovery, verification, refresh, revocation and logout tests pass. |
| `TeacherInvitationToken` | Supabase Auth invite + app `staff_invitations` | Preserve inviter, role, expiry, acceptance, revocation and audit semantics. |
| `SchoolMembership` | `school_memberships` | Retain trusted staff-to-school membership and active/suspended state. |
| `CouncilMembership`, `PlatformOperator` | None in first release | Remove from active product model; do not delete legacy history until migration is reviewed. |

Learners are records, not Supabase Auth users. Never create learner credentials as a side effect of importing or enrolling a learner.

## 3. School structure mapping

| Current Prisma entity | Single-school Supabase target | Treatment |
| --- | --- | --- |
| `School` | `school` | One configured school record per installation, with controlled first-run setup. |
| `SchoolIdentifier` | `school_identifiers` or selected fields on `school` | Keep only identifiers required by the first release and approved source. |
| `CouncilSchoolRegistration` | None | Council approval/registration lifecycle is out of scope. |
| `Region`, `County`, `Subcounty`, `Zone`, `Cluster` | Approved school location reference data | Remove Council ownership. Store only geography needed by the school profile; source official values rather than inventing them. |
| `SchoolClass` | `classes` / `class_streams` | Retain grade, academic year, stream and active/archive lifecycle. |
| `StaffAssignment` | `staff_assignments` | Retain class-teacher and subject-teacher assignments with effective dates and revocation history. |

Roles in the first release: School Administrator, Class Teacher and Subject Teacher. Permissions are enforced by RLS and privileged database/Edge Function boundaries, not by navigation visibility alone.

## 4. Learner lifecycle mapping

| Current Prisma entity | Single-school Supabase target | Treatment |
| --- | --- | --- |
| `Learner` | `learners` | Keep canonical learner identity, system-wide school identifier and protected identity fields. |
| `SchoolLearnerEnrollment` | `learner_enrollments` | Keep class placement, academic year, status, transfer/withdrawal and history. |
| Learner corrections (current service/audit behavior) | `learner_change_requests` or append-only change events | Sensitive identity changes require reason, independent review and an auditable prior/new value. Final table design must be reconciled with the reference repo and requirements register. |

Do not store real learner data during development. Do not expose learner identity outside the school. Define data minimisation, retention and export controls before real-data onboarding.

## 5. Curriculum mapping

| Current Prisma entity | Single-school Supabase target | Treatment |
| --- | --- | --- |
| `Curriculum`, `CurriculumVersion` | `curricula`, `curriculum_versions` | Preserve version, publication status, source/provenance and review history. |
| `LearningArea` | `learning_areas` | Canonical catalogue with provenance. |
| `GradeLearningArea` | `curriculum_grade_learning_areas` | Retain grade mapping and optionality only when sourced. |
| `CouncilCurriculum`, `CouncilGradeLearningArea` | `school_curriculum_adoptions`, `school_grade_learning_areas` | Replace Council ownership with school adoption. |
| `GradingRubric`, `GradingRubricVersion`, `RubricBand` | `grading_schemes`, `grading_scheme_versions`, `grading_bands` | Preserve source and versioning; never invent CBC level boundaries. |

School curriculum adoption must be configurable. No curriculum outcome, strand, sub-strand or rubric threshold is added unless sourced and approved.

## 6. Internal assessment and results mapping

| Current Prisma entity | Single-school Supabase target | Treatment |
| --- | --- | --- |
| `Assessment` | `assessments` | School-created formative/summative assessments only. Remove Council/Organizer ownership. |
| `AssessmentLearningArea` | `assessment_learning_areas` | Retain configured learning areas and score rules. |
| `AssessmentCandidate` | `assessment_learners` | Link enrolled learners to an internal assessment. |
| `AssessmentMark` | `assessment_marks` | Retain score validation, entry actor, status and lock rules. |
| `AssessmentMarkRevision` | `assessment_mark_revisions` | Append-only corrections with prior value, new value, actor, timestamp and reason. |
| `AssessmentSchoolSubmission`, `AssessmentSchoolSubmissionVersion` | `assessment_submissions`, `assessment_submission_versions` | Adapt to class/assessment completeness and school-level finalization; no external school submission. |
| `AssessmentResultPublication` | `result_publications` | Immutable published versions and controlled republishing. |
| `AssessmentResult`, `AssessmentResultLearningArea` | `assessment_results`, `assessment_result_learning_areas` | Store derived results with provenance; raw marks remain separate. |
| `AssessmentRubricBand` | `assessment_grading_bands` | Preserve scheme version used for each assessment. |

Scores remain numeric out of 100 unless an approved assessment-specific scheme says otherwise. Do not invent CBC performance-level thresholds. Publication must be blocked until required participating classes/streams have completed the configured workflow; do not expose partial results unless a later explicit decision permits it.

## 7. Audit, notifications and infrastructure mapping

| Current Prisma entity | Single-school Supabase target | Treatment |
| --- | --- | --- |
| `AuditEvent` | `audit_events` | Preserve append-only audit semantics and actor attribution to Supabase Auth user IDs. |
| `NotificationDelivery` | `notification_deliveries` | Keep delivery state and retry observability; send through Edge Functions/provider integrations. |
| `AuthRateLimitEvent` | Supabase Auth protections + Edge Function/app abuse controls | Reassess per operation; do not blindly port custom auth rate-limit storage. |
| Exports/files | Supabase Storage + `export_jobs` metadata | Private buckets, expiring access and school-scoped Storage policies. |

## 8. RLS and data-access design requirements

- Every table in an exposed schema must have RLS enabled and explicit policies.
- The school boundary must be derived from trusted profile/membership/configuration records, never a client-supplied school ID alone.
- School Administrator can manage the school's configuration and records according to the approved permission matrix.
- Class Teacher access is limited to assigned classes and permitted learner/assessment operations.
- Subject Teacher access is limited to assigned classes and learning areas; cannot change class or learning-area scope by editing IDs.
- Learners have no authenticated access in the first release.
- Test SELECT, INSERT, UPDATE and DELETE policies independently. UPDATE requires a matching SELECT policy and both USING and WITH CHECK conditions.
- Test cross-record ID substitution, cross-school isolation, unauthorized exports, Storage object access and Edge Function invocation.
- Do not use `user_metadata` for roles. Authenticated status alone is not authorization.
- Never expose service-role/secret keys to browser clients.

## 9. Unresolved design items before schema creation

- Exact learner identifier issuer/format and duplicate-resolution policy.
- Exact sensitive learner fields and which corrections require independent review.
- School profile location fields and authoritative geography source.
- First-run administrator bootstrap and staff invitation lifecycle.
- Complete role/action matrix for the three staff roles.
- Assessment state machine, required class/stream completeness and review/reopen behavior.
- Approved curriculum source, learning-area mappings and grading scheme versions.
- Child-data retention, privacy/legal release gates and backup/restore requirements.

## 10. Implementation rule

This is a mapping proposal, not an approved physical schema. Do not apply DDL or port old migrations mechanically. Resolve the listed items against the existing Notion SRS, requirements register, authorization matrix, reference repo and user-approved decisions. Then create the Supabase schema and RLS tests as a new, reviewed migration sequence.
