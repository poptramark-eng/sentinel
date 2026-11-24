# UX Experience Architecture — CBE Platform

**Status:** Design hypothesis and interaction specification; not validated through real-user research.  
**Design objective:** Make examination workflows clear, low-error, recoverable and auditable. UI/UX is a core product requirement, not a finishing layer.

## 1. Users and working assumptions

These are hypotheses to validate with representative users; no user interviews or usability sessions are claimed.

| User | Primary job | Likely constraints to design for |
|---|---|---|
| Platform Administrator | Approve school registrations and oversee platform integrity | High consequence decisions, low frequency, needs strong audit context |
| Council Administrator | Maintain council registry, geography, memberships and organizer authority | Large registries, scoped permissions, governance workload |
| CouncilGovernanceApprover | Review sensitive council-governance requests | Must see requester, affected person, conflict checks and evidence |
| CouncilApprover | Approve/reject organizer RELEASE_RESULTS authority | Narrow, high-risk decision workflow |
| Organization Administrator / delegated staff | Organize and validate assigned assessments | Cross-school coordination without unrestricted council access |
| School Administrator | Manage school, staff, assignments and assessment readiness | Many operational tasks and incomplete-work visibility |
| Teacher | Enter/correct marks for assigned learning areas and classes | High-volume entry, limited time, keyboard efficiency, possible connectivity constraints |
| Learner | No login workflow in current scope | Educational data privacy; no direct authentication experience |

## 2. Experience principles

1. **Task-first:** lead with work that needs action, not decorative KPI cards.
2. **Progressive disclosure:** show advanced configuration only when relevant.
3. **Scope visibility:** make current Council, school, assessment and grade context explicit.
4. **Error prevention:** validate values at entry, highlight affected rows and explain the correction.
5. **Recoverability:** preserve drafts and provide clear version/history for corrections.
6. **Workflow clarity:** distinguish draft, saved, submitted, under review, approved and released.
7. **Least surprise:** use consistent navigation, terminology, actions and status colors.
8. **Responsive by purpose:** desktop is optimized for bulk data entry; mobile supports status checks, approvals and targeted corrections.
9. **Accessible interaction:** semantic controls, keyboard operation, visible focus, sufficient contrast, readable type and WCAG 2.2 AA principles.
10. **Privacy by default:** expose only fields needed for the user's current task.

## 3. Proposed information architecture

### Platform Administrator
- Overview: pending registrations, platform alerts and operational health.
- School approvals: registration details, verification evidence, approve/reject with reason.
- Platform audit: privileged actions and security events.
- Platform operators: restricted provisioning and account lifecycle.
- Support access: not in MVP until an explicit scoped, time-limited and audited policy is approved.

### Council Administrator
- Council overview.
- School registry and council-specific registrations.
- Geography: Region → County → Subcounty → Zone → Cluster.
- Council memberships and role assignments.
- Organizer authorities and delegated staff.
- Assessments owned by the Council.
- Council reports and audit.

### CouncilGovernanceApprover
- Governance inbox.
- Request details and affected person.
- Conflict/recusal declaration.
- Evidence, decision rationale and audit history.
- No implicit assessment or organizer management navigation.

### CouncilApprover
- Organizer authority approval inbox.
- Request scope and requested permissions.
- Requester and parent authority details.
- Approve/reject with reason.
- No result-release execution capability.

### Organization Administrator / delegated organizer staff
- Assigned assessments only.
- Participating schools and submission status.
- Validation issues and resolution tracking.
- Authorized result release actions only when explicitly delegated.
- Delegated staff access and authority expiry indicators for Organization Administrators.

### School Administrator
- School overview: incomplete setup and upcoming deadlines.
- School profile and council registrations.
- Teachers and school memberships.
- Staff assignments by grade/class/learning area.
- Curriculum and school configuration where authorized.
- Assessments and participation.
- Candidate register and import.
- Mark-entry progress by learning area.
- Submission history and correction requests.
- Released results and school reports.

### Teacher
- My assignments.
- Assessments requiring my work.
- Assigned candidate lists.
- Learning-area mark entry.
- Mark correction history and correction requests.
- Completion and deadline status.

## 4. Critical user journeys

### A. Account creation, school registration and approval

1. Registrant creates a global account with name, email and password.
2. System sends a one-time email verification link; opening the page does not consume the link until the user explicitly confirms.
3. Email verification activates the account only. It does not create a CouncilMembership, SchoolMembership or role.
4. A Platform Administrator first configures the Council and its Region → County → Subcounty → Zone → Cluster directory. Only active Councils and clusters appear in registration choices.
5. The verified registrant selects a Council/cluster, submits school details and becomes the proposed initial School Administrator.
6. System creates a pending CouncilSchoolRegistration and pending initial SchoolAdministrator membership.
7. User receives a clear pending state and cannot provision staff or access school-management actions.
8. Platform Administrator reviews the registration and records approval or rejection with reason.
9. On approval, the initial School Administrator receives access to school management.
10. The school dashboard guides the administrator through profile completion and staff onboarding.

Acceptance:
- Email verification cannot be triggered by a link scanner or page prefetch; an explicit confirmation is required.
- Duplicate registration/resend responses do not reveal whether an email account exists.
- Email verification alone does not grant tenant or school-management access.
- Pending school access cannot be bypassed through direct API calls.
- The UI explains why management actions are unavailable and what happens next.
- Approval/rejection and activation are traceable.

### B. Teacher onboarding and assignment

1. School Administrator searches for an existing global teacher identity.
2. If verified match exists, associate it with the school's CouncilSchoolRegistration.
3. If no match exists, create a new teacher identity using the approved identity-verification process.
4. Assign school-specific role/membership and optional grade, class/stream and learning-area responsibilities.
5. Teacher sees only active assignments and the tasks derived from them.

Acceptance:
- No duplicate global teacher identity from ordinary multi-school onboarding.
- Name-only matches never silently merge records.
- A teacher's school A membership does not reveal school B records.

### C. Assessment setup and school readiness

1. Authorized organizer creates an assessment under one owning Council.
2. System checks current OrganizerAuthority for the requested actions.
3. Configure period, grades, learning areas per grade, grading version, maximum marks, precision and entry windows.
4. Invite/enable eligible CouncilSchoolRegistrations.
5. School Administrator sees the assessment, participation state, required candidate setup and deadlines.
6. Readiness view highlights missing candidates, missing assignments and closed windows before entry begins.

Acceptance:
- Organizer scope and Council ownership are visible.
- A school from another Council cannot be attached to the assessment.
- Configuration version is retained for historical result reproducibility.

### D. Subject teacher mark entry

1. Teacher opens an assigned assessment and learning area.
2. System shows the school, grade, class/stream, learning area, assessment, mark maximum and deadline.
3. Teacher searches or filters the candidate list.
4. Marks are entered with keyboard navigation and inline range/precision validation.
5. Missing and invalid values remain visibly distinct.
6. Draft state and save outcome are explicit; network failure never looks like a successful save.
7. Teacher reviews corrections and completes the assigned learning area.

Acceptance:
- Fast keyboard navigation without losing focus or row context.
- Clear incomplete/invalid counts and affected-row errors.
- No silent mark clamping or rounding.
- Concurrency conflicts and stale edits are explained and recoverable.
- Subject teacher cannot perform the class teacher's final school submission unless explicitly assigned that authority.

### E. Class teacher coordination and submission

1. Class teacher opens school assessment readiness.
2. Sees completion by grade/class, learning area and assigned teacher.
3. Reviews missing entries and unresolved validation findings.
4. Coordinates completion and confirms school submission.
5. System creates an immutable submission version and acknowledgement.
6. If returned for correction, the school sees the reason, affected records and deadline.

Acceptance:
- Mark entry, submission and approval are distinct.
- Submission is idempotent and versioned.
- The user sees a clear receipt and status after submission.

### F. Result governance

Internal:
1. School submits.
2. Platform Administrator reviews and approves or returns.
3. School Administrator releases only after approval.
4. System creates immutable release and result snapshots.

External/inter-school:
1. Participating schools submit.
2. Authorized organizer validates and returns issues where needed.
3. Organizer staff with explicit RELEASE_RESULTS authority releases.
4. System creates immutable release and snapshots.

Acceptance:
- UI labels the actual current authority and next actor.
- Approval of organizer authority is never confused with approval of assessment results.
- Released results are versioned and cannot be silently overwritten.

## 5. Marks-entry prototype review checklist

The current route /prototype/marks-entry is a synthetic-data interaction prototype. It demonstrates:
- assessment and grade context;
- candidate search;
- all/missing/invalid filters;
- numeric range/precision validation;
- progress counts;
- keyboard navigation;
- clear indication that local preview actions do not persist or submit.

It does not yet demonstrate:
- server persistence or autosave;
- offline queueing/retry;
- concurrent edit handling;
- CSV/Excel import;
- assignment-specific authorization;
- actual CBE rubric configuration;
- school submission or governance workflow.

These are future acceptance requirements, not implemented features.

## 6. Design system direction

- Light neutral surfaces, deep navy text and a restrained blue primary action color.
- Semantic success/warning/error states, never color alone.
- Consistent spacing, radii, typography scale, focus ring and form heights.
- Reusable components for navigation, buttons, inputs, status labels, tables, filters, dialogs, toasts, empty states and loading skeletons.
- Tables must support sticky headers where useful, responsive horizontal scrolling, keyboard focus and clear row-level validation.
- Print/report layouts must use explicit print styles and hide navigation/action chrome.
- Avoid introducing a UI component library until repeated needs justify it.

## 7. Validation plan

Before production use:
- Walk through the journeys with representative school administrators, subject teachers, class teachers, council administrators and organizers.
- Test at least one large synthetic class dataset and one poor-connectivity scenario.
- Observe task completion time, navigation errors, correction recovery and user confidence.
- Test desktop/laptop bulk entry, tablet review and mobile status/approval.
- Run keyboard-only and screen-reader checks on critical forms and tables.
- Record findings, distinguish observed behavior from assumptions and update the prototype accordingly.


## 8. Implemented school onboarding and platform geography journeys

### Verified registrant journey

1. Create a personal account and verify its email address.
2. Sign in and open **My registrations**.
3. Choose an active Council and then an active Cluster; the selector shows its Region/County/Subcounty/Zone path.
4. Enter the official school name and, optionally, a claimed school identifier and Council registration code.
5. Review the statement that a claim is not proof of identity, then submit.
6. Track the request status, review feedback and submission time. A pending request can be withdrawn with a reason; rejected/withdrawn history is retained.
7. After approval, the initial School Administrator membership becomes active and the school workspace appears.

Acceptance:
- Council and Cluster options are fetched from the server, not free-text tenant identifiers.
- No active Council/Cluster produces a clear unavailable state rather than a dead-end submit button.
- The UI distinguishes account verification from school approval.
- Pending registrations never imply school-management permission.
- Conflict and stale-version responses are shown as recoverable errors.

### Platform Administrator geography setup journey

1. Open Platform setup and create a Council with a unique slug.
2. Select the Council and add Region, County, Subcounty, Zone and Cluster nodes in parent-first order.
3. Review the nested tree and counts.
4. Registrants can then select only active clusters under that Council.

Acceptance:
- Platform-only controls are hidden from ordinary users and server-protected by PlatformOperatorGuard.
- The UI never allows a child node to be created without a valid parent.
- The API independently validates parent Council and active status.
- Successful changes are auditable.
- The interface does not imply that create-only setup includes edit/delete capabilities.
