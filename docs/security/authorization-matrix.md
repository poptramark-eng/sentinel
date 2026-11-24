# Authorization Matrix — Working Baseline

**Status:** Partial matrix. Explicitly accepted permissions are distinguished from unresolved permissions.  
**Enforcement point:** NestJS API policy layer + domain services + database constraints. UI navigation is never a security boundary.

Legend:
- **Allowed:** directly supported by an explicit project rule.
- **Scoped:** allowed only within the named Council, registration, assessment, assignment or authority.
- **Denied:** explicitly prohibited by the current baseline.
- **TBD:** requirements do not yet define the exact permission; do not infer it from a role label.

## 1. Actor and scope definitions

| Actor | Identity/scope | Notes |
|---|---|---|
| PlatformAdministrator | Platform | Provisioned by developer; approves school registration and oversees platform. |
| CouncilAdministrator | One Council membership | Multiple active administrators may exist in a Council. |
| CouncilGovernanceApprover | One Council membership | Sensitive Council governance decisions only; distinct from CouncilApprover. |
| CouncilApprover | One Council membership | Approves/rejects organizer RELEASE_RESULTS authority requests only. |
| OrganizationAdministrator | Organization staff identity + parent OrganizerAuthority | Delegates named staff within current parent authority. |
| OrganizerStaff | Named individual delegation | Individually authenticated; no onward delegation. |
| SchoolAdministrator | Approved CouncilSchoolRegistration membership | Manages that school's operations. |
| Teacher | SchoolMembership + StaffAssignment | Subject/class duties are assignment-scoped, not global roles. |
| Learner | LearnerIdentity only | No login account in current scope. |

## 2. Platform and school registration

| Action | PlatformAdministrator | CouncilAdministrator | SchoolAdministrator | Teacher | Notes |
|---|---|---|---|---|---|
| Provision PlatformAdministrator | Allowed via restricted developer process | Denied | Denied | Denied | No public or tenant workflow creates platform admins. |
| Register a school | Platform oversight only | TBD | Initial registrant may submit | Denied | Registrant becomes initial School Administrator, pending approval. |
| Approve/reject initial school registration | Allowed | Denied | Denied | Denied | Approval is a platform action. |
| Manage school before approval | No routine school operations | Denied | Denied | Denied | Pending membership cannot provision staff or manage school. |
| Manage approved school profile | Audited support only, if separately authorized | Scoped to own council registry only | Scoped to own approved school | Denied | Canonical School fields vs council-specific registration fields need field-level ownership. |
| Suspend/reactivate CouncilSchoolRegistration | Platform recovery/oversight TBD | Scoped to own Council; reason required | Denied | Denied | Does not deactivate canonical School or other council registrations. |
| Permanently delete school registration | Denied as ordinary operation | Denied as ordinary operation | Denied | Denied | Use status/archive; lawful disposal is separately governed. |

## 3. Council governance and membership

| Action | PlatformAdministrator | CouncilAdministrator | CouncilGovernanceApprover | CouncilApprover | Notes |
|---|---|---|---|---|---|
| Invite an existing platform user to a Council | Provisioning/oversight TBD | Scoped to own Council | Denied unless separately assigned CouncilAdministrator | Denied | Invitation creates membership, not duplicate identity. |
| Invite a new user to a Council | Platform support TBD | Scoped to own Council | Denied unless separately assigned CouncilAdministrator | Denied | New user verifies invitation and creates global account. |
| Assign permitted Council roles | Platform bootstrap/recovery only where defined | Scoped to own Council, within self-assignment restrictions | Denied | Denied | Exact allowed role list and permission catalogue remain TBD. |
| Appoint/replace/suspend/remove CouncilAdministrator | Recovery only under defined platform process | May initiate for another administrator | Independently approves if eligible and unconflicted | Denied | Requester/affected person cannot approve. |
| Appoint/renew temporary CouncilGovernanceApprover | Allowed after independent representative verification | Denied | Cannot appoint/renew another temporary approver | Denied | Temporary role has expiry and narrow permissions. |
| Approve organizer RELEASE_RESULTS authority | Denied | Cannot self-approve | Denied unless separately also CouncilApprover | Allowed if active, distinct and unconflicted | CouncilApprover is a separate authority. |
| View Council audit events | Restricted platform audit | Scoped to own Council, exact permissions TBD | Governance-related scope TBD | Approval-related scope TBD | Audit access itself is permissioned. |

### Implemented Council curriculum permissions

- An active `COUNCIL_ADMINISTRATOR` membership may list published curriculum versions and read the current curriculum only for the Council in the route scope.
- A Council Administrator may select a published version for that Council. The prior selection is retained as `SUPERSEDED` history; a new selection creates Council-specific grade-area configuration rows.
- New Council grade-area rows start disabled and not assessment-eligible. A Council Administrator must explicitly enable an area and separately mark it assessment-eligible.
- Assessment eligibility is denied unless the Council area is enabled and its source mapping has `REVIEWED` status with optionality resolved to `CORE` or `OPTIONAL`.
- Each Council selection and grade-area configuration change is audited. The Council Administrator guard checks the active, effective-dated membership; a platform role or UI link alone does not grant access.

## 4. Organizer authority and delegation

| Action | CouncilAdministrator | CouncilApprover | OrganizationAdministrator | OrganizerStaff |
|---|---|---|---|---|
| Request OrganizerAuthority | May grant/change/revoke within own Council | No grant right | May request authority | Denied |
| Grant/change non-release organizer permissions | Scoped to own Council | Denied | Denied | Denied |
| Grant/change RELEASE_RESULTS permission | Initiates request; independent approval required | Approves/rejects request | Denied | Denied |
| Emergency suspend/revoke authority | Allowed within own Council; reason + immutable audit | Denied | Denied | Denied |
| Delegate named staff | Denied | Denied | Allowed within active parent authority | Denied |
| Delegate onward | Denied | Denied | Denied | Denied |
| Perform assessment actions | Only if separately authorized by a defined role | No implicit assessment access | Only current parent authority scope | Only explicit delegated scope |
| Release assessment results | No implicit release right | No; approves authority request only | Only if explicit current RELEASE_RESULTS permission | Only if explicitly delegated RELEASE_RESULTS |
| Access assessment outside authority | Denied | Denied | Denied | Denied |

Additional constraints:
- Assessment-specific authority is default; council-wide authority must be explicitly selected.
- Staff delegation is individually authenticated, non-transitive and cannot exceed parent permissions.
- Parent authority expiry, suspension or revocation immediately disables dependent staff access.
- Council duration is subject to a platform maximum; renewal is automatic for the same council-defined duration, with Council and Organization notified 30 days before renewal/expiry.
- Consolidated reports require explicit authorization from every affected Council, limited by purpose, fields, recipients and validity period.

## 5. School staffing and assessment operations

| Action | SchoolAdministrator | Subject Teacher assignment | Class Teacher assignment | Notes |
|---|---|---|---|---|
| Create/link teacher identity | Allowed for own approved school | Denied | Denied | Link existing global identity; do not duplicate teacher. |
| Create/manage SchoolMembership | Allowed for own school | Denied | Denied | Exact membership lifecycle/approval policy remains TBD. |
| Assign grade/class/learning area duties | Allowed for own school | Denied | Denied | StaffAssignment is school-specific and time-bounded. |
| View assigned candidates | Scoped to own school and permitted assessment | Scoped to assigned work | Scoped to assigned class/coordination | Field-level learner privacy policy remains to be finalized. |
| Enter/correct marks | School oversight and correction authority TBD | Scoped to assigned learning area and candidates | Only if separately assigned subject duties | Mark correction authority, deadlines and approval rules remain open. |
| Coordinate assessment completeness | Allowed for own school | View own work status | Scoped to assigned class/assessment | Class-teacher coordination is explicit. |
| Final school submission | School Administrator oversight; exact action permission TBD | Denied unless separately assigned | Allowed when designated for that assessment/class | Submission actor and delegation rules need final approval. |
| Release internal assessment results | Allowed only after required PlatformAdministrator approval | Denied | Denied | School Administrator release is explicit. |
| Release external/inter-school results | Denied unless separately authorized as organizer staff | Denied | Denied | Organizer releases under active authority. |
| View released school results | Scoped to own school | Scoped to assigned role; exact field policy TBD | Scoped to assigned class; exact field policy TBD | Result visibility before release is restricted. |

## 6. Assessment, candidate, marks and results access

| Resource/action | School scope | Council scope | Organizer scope | Platform scope |
|---|---|---|---|---|
| Assessment configuration | Participate and perform school-side tasks | Own Council's assessments, subject to role | Only assessments covered by active OrganizerAuthority | Oversight only; no routine management |
| AssessmentParticipation | Own registration/participation | Own Council | Authorized assessment only | Audited support only |
| Candidates and marks | Own participating school's records | Own Council's assessment scope | Authorized assessment scope for validation/release | No routine unrestricted access |
| Submission and validation issues | Own school's submission and findings | Own Council oversight where authorized | Assigned assessment validation scope | Internal approval path only where required |
| Internal result approval | No | No | No | PlatformAdministrator only |
| Internal result release | SchoolAdministrator after approval | No | No | No |
| External result validation | School resolves its own returned issues | Council oversight as separately authorized | Authorized organizer staff | No |
| External result release | No | No by default | Explicit RELEASE_RESULTS authority | No |
| Result snapshots | Own school's released results | Own Council reports as permitted | Authorized assessment results | Restricted audit/support only |

## 7. Explicitly unresolved permission decisions

These must be decided before database migrations and before protected feature implementation:

1. Full action catalogue for PlatformAdministrator and CouncilAdministrator, including exact read scopes for candidates, marks, results, audit and reports.
2. School Administrator replacement workflow: initiation is accepted; independent approval, verification, timing and recovery rules need definition.
3. Whether Council roles can view all school/candidate/mark records in their Council or only operational metadata and approved aggregates.
4. Whether School Administrators can enter/correct marks or only oversee and assign teachers.
5. Exact class-teacher final submission authority, scope and reassignment policy.
6. Teacher access to learner demographics, identifiers and historical results.
7. Exact organizer validation, candidate correction and result-release action set.
8. Support access, break-glass access and platform data access policy.
9. Payment/billing administration permissions and separation from educational data access.
10. Report/export field-level permissions, consolidated report controls and retention.

## 8. Authorization implementation rules

- Deny by default.
- Evaluate actual individual identity for separation-of-duties checks, not just role labels.
- Resolve scope server-side from active membership, registration, assignment, authority and workflow state.
- Do not rely on route hiding, UI state or client-supplied tenant IDs.
- Re-authorize background jobs, report generation, downloads and signed URLs.
- Record actor, scope, action, resource, reason, decision and timestamp for privileged operations.
- Add positive and negative tests for every permission family, especially cross-council ID substitution and stale/revoked authority.
