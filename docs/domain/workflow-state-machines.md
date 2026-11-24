# Assessment, School and Result Workflow State Machines

**Status:** Proposed workflow contract derived from the CBE workspace; exact enum names and edge-case policy remain open.

## 1. School registration and initial administrator

~~~mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> PendingApproval: submit registration
  PendingApproval --> Approved: Platform Administrator approves
  PendingApproval --> Rejected: Platform Administrator rejects
  Rejected --> Draft: correct and resubmit
  Approved --> Suspended: authorized Council Administrator / policy action
  Suspended --> Approved: authorized reactivation
~~~

Rules:
- The registrant becomes the initial School Administrator.
- Account, membership and school-management capabilities remain pending until initial platform approval.
- A pending/rejected registration cannot provision teachers or perform restricted school operations.
- A Council Administrator may suspend/reactivate only the CouncilSchoolRegistration in their own Council; this does not affect the canonical School or another Council's registration.
- Permanent deletion is not an ordinary operation.
- Only the School Administrator initiates replacement of the School Administrator role-holder; governance/approval details for the school-level transfer remain a separate policy contract.

## 2. Organizer authority lifecycle

~~~mermaid
stateDiagram-v2
  [*] --> Requested
  Requested --> AwaitingIndependentApproval: request submitted
  AwaitingIndependentApproval --> Active: distinct CouncilApprover approves RELEASE_RESULTS
  AwaitingIndependentApproval --> Rejected: CouncilApprover rejects
  Active --> Suspended: Council Administrator emergency action
  Active --> Revoked: Council Administrator revokes
  Active --> Expired: validity ends
  Suspended --> Active: Council Administrator reinstates
  Suspended --> Revoked: Council Administrator revokes
~~~

Rules:
- Authority is granted by a Council to an Organization and never crosses that Council boundary.
- Assessment-specific scope is default; council-wide scope is explicitly selected.
- A Council Administrator may grant/change/revoke organizer authority only for their Council.
- Granting or changing RELEASE_RESULTS requires approval by a distinct active CouncilApprover; requester cannot self-approve.
- CouncilApprover only approves/rejects RELEASE_RESULTS authority requests. It does not itself execute result release.
- Organization Administrator may delegate named staff; delegation is individually authenticated, non-transitive and cannot exceed parent authority.
- Parent authority suspension, expiry or revocation disables dependent staff access immediately.
- Council duration is subject to a platform maximum; automatic renewal uses the same council-defined duration, with 30-day advance notices.
- Emergency suspension/revocation is immediate, requires reason and immutable audit record.

## 3. Assessment lifecycle

~~~mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Configured: configure grades, learning areas, rubric and windows
  Configured --> Published: authorize and open participation
  Published --> InProgress: first participation/entry begins
  InProgress --> SubmissionReview: schools submit
  SubmissionReview --> ReadyForGovernance: required validations resolved
  ReadyForGovernance --> ResultsReleased: approved workflow releases results
  InProgress --> Closed: deadline / controlled closure
  SubmissionReview --> InProgress: authorized return for correction
  Closed --> Archived: retention policy permits archival
~~~

This is a high-level lifecycle only. Internal and external result governance are different workflows and must not be represented by one generic approved flag.

## 4. Internal assessment result governance

~~~mermaid
flowchart TD
  A[Subject teachers enter marks] --> B[Class teacher coordinates completeness]
  B --> C[Class teacher submits school marks]
  C --> D[Validation and review]
  D -->|Issues| E[Return to school for correction]
  E --> A
  D -->|Valid| F[Platform Administrator approval]
  F -->|Rejected / returned| E
  F -->|Approved| G[School Administrator releases results]
  G --> H[Immutable result release and snapshots]
~~~

- Marks entry is not submission.
- School submission is not platform approval.
- Platform approval is not release.
- School Administrator release is allowed only after the required platform approval.
- Record each submission version, review, correction, approval and release as separate auditable history.
- Post-release correction and replacement release rules remain unresolved and block final implementation.

## 5. External/inter-school assessment result governance

~~~mermaid
flowchart TD
  A[Participating schools enter marks] --> B[Class teacher coordinates and submits]
  B --> C[Organizer validates submissions]
  C -->|Issues| D[Return to school for resolution]
  D --> A
  C -->|Valid| E[Organizer authorized release officer releases]
  E --> F[Immutable result release and snapshots]
~~~

- Organizer must have active authority from the owning Council for the assessment and release action.
- Participating schools submit only their own data.
- Organizer staff must be explicitly delegated and individually authenticated.
- Organizer validation does not itself publish results; release is a separate guarded action.
- CouncilApprover approval of the organizer's RELEASE_RESULTS authority is not the same as approval of the assessment's results.
- Result release is immutable and versioned.

## 6. State-transition enforcement

Every transition must define:
- Current state and target state.
- Permitted actor and scope.
- Preconditions and validation rules.
- Whether the transition is reversible.
- Required reason/comment.
- Transaction boundary and concurrency control.
- Audit event and notification.
- Idempotency/retry behavior.
- Effects on dependent authority, submissions, marks and snapshots.

Do not implement transitions as unrestricted status-field updates. Use explicit application commands/services and database transactions.
