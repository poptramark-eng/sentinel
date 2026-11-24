# Domain Boundaries — Initial Baseline

**Status:** Working design baseline; validate against the SRS and requirements register before physical schema migrations.

## Tenant and organization model

The current product baseline is multi-council. A council is the proposed tenant boundary for council-owned data, configuration, users and assessments. An examination-organiser relationship must be explicit rather than copying schools or candidates. A school has one canonical identity and may participate in assessments organised by multiple authorised councils without duplicating its school record.

## Actors and identity

- **Platform Administrator:** provisioned by the developer; approves onboarding and performs platform oversight. Any support access must be approved, scoped, time-limited and audited.
- **Council / Examination Organiser:** manages only councils and assessments for which it has authority. The distinction between council and organiser membership remains a requirements question.
- **School Administrator:** the registrant becomes initial administrator. School and account remain pending/inactive until approval. Before approval, management and user provisioning are blocked. After approval, the administrator manages school operations and can initiate replacement of the administrator role-holder.
- **Teacher:** one global identity may have memberships and assignments at multiple schools.
- **Learner:** globally unique identity; no self-registration or learner login in current scope. Learner identifier is not an authentication secret.
- **Class-teacher / subject-teacher duties:** model as school-specific assignments or capabilities unless requirements justify separate global roles.

## Assessment participation

Participation is distinct from school identity. A school joins an assessment through a participation record with an explicit lifecycle. Candidates are assessment-specific records linked to a canonical learner identity; candidate details and eligibility may vary by assessment.

## Marks and result governance

- Marks are final numerical totals per learning area in the current baseline.
- Strands, substrands, outcomes and evidence capture are outside the current marks model.
- Mark changes require revision history, actor, reason and timestamps.
- Marks entry, school submission, review, approval and release are distinct states.
- Internal assessments require platform-administrator approval before school-admin release.
- External/inter-school assessments are validated and released by the authorised organiser.
- Schools see only authorised records; organisers see only assessments they organise.

## Geography

The agreed hierarchy is `Region → County → Subcounty → Zone → Cluster → School`. Ownership of geography must be resolved; overlapping council geographies require an explicit canonical or council-owned model.

## Security invariants

1. Tenant scope comes from verified server-side authorization context, never an arbitrary request field.
2. Every query, mutation, relation traversal, import, export, report and background job applies tenant and resource scope.
3. Composite constraints should prevent invalid cross-tenant references where practical.
4. Authorization tests must attempt cross-tenant access by substituting IDs and filters.
5. Privileged changes, marks corrections, approvals, releases and exports are auditable.
6. Use synthetic learner data until privacy, hosting and operational safeguards are reviewed.
