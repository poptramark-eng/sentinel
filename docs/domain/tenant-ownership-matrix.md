# Tenant Ownership and Access Matrix

**Status:** Working security design; validate against the complete approved authorization matrix before implementation.

| Domain data | Owner / scope | School access | Council access | Organizer access | Platform access |
|---|---|---|---|---|---|
| Council profile and settings | One Council | None | Authorized council roles | None unless explicitly delegated | Provisioning and audited support only |
| Council geography | One Council | Read only through own registration where needed | Own council geography | Only assessment-scoped information needed | Audited support only |
| Canonical School identity | Platform canonical registry | Own canonical profile | Schools registered to council | Participating school details for authorized assessments | Controlled registry support |
| CouncilSchoolRegistration | One Council + one School | Own registration context | Own council registry | Through authorized assessment participation only | Approval and audited support |
| Person / UserAccount | Global identity | Own account and permitted directory data | Council members only | Named delegated staff only | Platform identity administration |
| TeacherIdentity | Global identity | Own verified profile | Linked teachers only | No general directory access | Restricted identity support |
| SchoolMembership / StaffAssignment | Registration + Person | Own school and assignments | Own registered school, as authorized | Only where assessment task requires it | Audited support |
| Curriculum / Rubric | Council/version | Applicable school configuration | Own council configuration | Assessment snapshot only | Support/operations |
| Assessment | One immutable owning Council | Own participation | Own council assessments | Only under current OrganizerAuthority | Audited support |
| AssessmentParticipation | Assessment + same-council registration | Own participation | Own council assessment | Authorized assessment scope | Audited support |
| Candidate / Mark | Assessment + participation | Own participating school's candidates/marks | Own council assessment scope | Only authorized assessment results needed for validation/release | No routine access; audited support only |
| Submission / Validation | Assessment participation | Own submission and issues | Own council oversight as authorized | Assigned assessment validation | Audited support |
| Approval / Release | Assessment governance | School release only after required approval | Council or platform approval only within defined workflow | Organizer release only under explicit authority | Platform approval for internal path; audit |
| Result snapshots | One release/version | Own school results after release | Own council results | Authorized assessment results | Audited support |
| Audit events | Tenant/resource scope | Own actions where permitted | Own council events | Own delegated actions | Restricted, audited platform access |
| Notification delivery | Recipient + originating tenant | Own messages | Own council messages | Own delegated messages | Operational metadata only |
| Export jobs | Requester + authorized scope | Own school data | Own council data | Authorized assessment data | Operational status, not unrestricted contents |
| Financial ledger / payment | Platform billing account or explicitly scoped tenant | Own payment/account details only | Own council billing records if enabled | None by default | Restricted finance operations |

## Non-negotiable enforcement rules

- Tenant scope is resolved from authenticated memberships and current authority records, never trusted from a request body, query parameter or route ID.
- Every list, detail, create, update, delete/archive, bulk import, export, report, file download and background job applies the same scope policy.
- Cross-council foreign keys are rejected. Where possible, use composite unique keys and composite foreign keys to make tenant equality a database invariant.
- An organizer does not receive council-wide visibility merely because it organizes one assessment.
- A school's registration in Council A grants no access to Council B.
- Canonical school/person identity data is minimized; council-facing views expose only required fields.
- Platform support access is not a standing superuser bypass. Any support-access feature requires a separately approved, time-limited, reasoned and audited process.
- Consolidated reports require explicit authorization from every affected Council, with purpose, fields, recipients and validity period; identifiable learner data is excluded by default.
- Authorization must be re-evaluated at download time and by asynchronous workers.
- Add negative tests for cross-council ID substitution, nested relations, filters, batch APIs, report endpoints, file URLs and stale organizer grants.
