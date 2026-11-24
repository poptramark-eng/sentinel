# Physical Data Model — Foundation Slice

**Status:** Physical design baseline for the first implementation slice.
**Scope:** Platform identity, Council tenant, geography, canonical School, Council registration episodes, school membership, school classes, Class Teacher assignments and audit.
**Not included yet:** Assessment, candidate, marks, curriculum, result, payment or external-provider tables. Those are separate bounded contexts and will be added after the foundation is exercised. Learner records remain blocked by the child-data privacy release gate.
**Database:** PostgreSQL. ORM: Prisma 7.
**Schema implementation:** packages/database/prisma/schema.prisma.
**Migrations:** `202611240001_foundation` establishes identity, tenant, geography, registration, membership and audit. `202611240003_school_classes` adds school-scoped classes and Class Teacher assignments with composite Council/registration foreign keys, a partial unique index for one active Class Teacher per class, and academic-year/stream/date checks. CI applies migrations to an ephemeral PostgreSQL 18 service and verifies constraints. Neither migration has been applied to a persistent development, staging or production database.

## 1. First vertical slice

The first real workflow is:

1. A registrant submits a school registration to a selected Council.
2. The system resolves or creates a canonical School record without name-based auto-merging.
3. The registrant's Person and UserAccount are linked; a pending SchoolMembership with SchoolAdministrator role is created.
4. The CouncilSchoolRegistration enters PENDING_REVIEW.
5. A PlatformAdministrator reviews the request and records an approval/rejection decision with an audit event.
6. On approval, the SchoolMembership becomes ACTIVE. Only then may the SchoolAdministrator perform school operations.
7. Rejected or withdrawn registration history is retained; a reapplication creates a new registration episode.

The initial implementation uses synthetic test data only. School classes and Class Teacher assignments are now implemented as a separate migration/vertical slice. No learner enrollment or personal learner data is stored.

## 2. Logical ERD

~~~mermaid
erDiagram
  PERSON ||--o| USER_ACCOUNT : has
  USER_ACCOUNT ||--o{ LOGIN_IDENTIFIER : authenticates_with
  PERSON ||--o{ COUNCIL_MEMBERSHIP : participates
  COUNCIL ||--o{ COUNCIL_MEMBERSHIP : contains
  PERSON ||--o{ SCHOOL_MEMBERSHIP : serves
  SCHOOL ||--o{ SCHOOL_IDENTIFIER : identified_by
  SCHOOL ||--o{ COUNCIL_SCHOOL_REGISTRATION : registers_with
  COUNCIL ||--o{ COUNCIL_SCHOOL_REGISTRATION : receives
  PERSON ||--o{ COUNCIL_SCHOOL_REGISTRATION : initially_registers
  USER_ACCOUNT o|--o{ COUNCIL_SCHOOL_REGISTRATION : reviews
  COUNCIL ||--o{ REGION : defines
  REGION ||--o{ COUNTY : contains
  COUNTY ||--o{ SUBCOUNTY : contains
  SUBCOUNTY ||--o{ ZONE : contains
  ZONE ||--o{ CLUSTER : contains
  CLUSTER ||--o{ COUNCIL_SCHOOL_REGISTRATION : locates
  COUNCIL_SCHOOL_REGISTRATION ||--o{ SCHOOL_MEMBERSHIP : grants
  USER_ACCOUNT o|--o{ AUDIT_EVENT : performs
  COUNCIL o|--o{ AUDIT_EVENT : scopes

  PERSON {
    uuid id PK
    string given_name
    string family_name
    string display_name
    datetime created_at
  }
  USER_ACCOUNT {
    uuid id PK
    uuid person_id FK
    enum status
    int auth_version
  }
  LOGIN_IDENTIFIER {
    uuid id PK
    uuid account_id FK
    enum type
    string normalized_value UK
    datetime verified_at
  }
  COUNCIL {
    uuid id PK
    string name
    string slug UK
    enum status
  }
  SCHOOL {
    uuid id PK
    string name
    enum status
  }
  COUNCIL_SCHOOL_REGISTRATION {
    uuid id PK
    uuid council_id FK
    uuid school_id FK
    uuid cluster_id FK
    uuid initial_registrant_person_id FK
    enum status
    datetime submitted_at
  }
  SCHOOL_MEMBERSHIP {
    uuid id PK
    uuid registration_id FK
    uuid person_id FK
    enum role
    enum status
  }
~~~

The full geography and audit relationships are represented in Prisma. The diagram omits some composite-key columns for readability.

## 3. Tenant and referential integrity

- Council is the tenant root.
- Canonical School is global; its CouncilSchoolRegistration is tenant-owned.
- Every geography node carries Council ID. Child-to-parent relations use composite (parent ID, Council ID) references so a County cannot point to another Council's Region.
- CouncilSchoolRegistration references a Cluster using (cluster ID, Council ID), preventing a registration from being assigned to a foreign Council's geography.
- SchoolMembership references its registration using (registration ID, Council ID); Person is global.
- Platform review actor is a UserAccount, never a client-supplied identity.
- School identifiers are issuer-scoped. The same external identifier value from different issuers does not collide.
- Login identifiers are globally unique after normalization.
- One UserAccount per Person; memberships are many-to-many and scoped.
- Historical registration episodes are retained. Only one active registration episode per Council/School pair is permitted by a PostgreSQL partial unique index in the migration.
- The Prisma schema uses explicit IDs and tenant columns; application services must still derive Council scope from authenticated membership.

## 4. PostgreSQL constraints and indexes

In addition to Prisma-generated primary keys, unique constraints and foreign keys, the initial SQL migration must add:

~~~sql
CREATE UNIQUE INDEX council_school_registration_one_active
ON "CouncilSchoolRegistration" ("councilId", "schoolId")
WHERE "status" IN ('PENDING_REVIEW', 'APPROVED', 'SUSPENDED');
~~~

The active-state definition must be revisited if the workflow adds another operational state. REJECTED, WITHDRAWN and EXPIRED episodes do not block a new application.

Additional indexes:
- CouncilSchoolRegistration(councilId, status, submittedAt DESC)
- CouncilSchoolRegistration(schoolId, councilId, createdAt DESC)
- SchoolMembership(registrationId, status, role)
- CouncilMembership(councilId, status, role)
- AuditEvent(councilId, createdAt DESC)
- AuditEvent(resourceType, resourceId, createdAt DESC)
- LoginIdentifier(type, normalizedValue) unique

PostgreSQL composite foreign keys are represented in Prisma with @@unique([id, councilId]) on parent records and matching multi-column relations.

## 5. Transaction boundaries

### Registration submission

One transaction must:
- verify the authenticated account and Person;
- resolve a School by a verified issuer identifier if supplied, otherwise create a new provisional canonical School;
- create the CouncilSchoolRegistration in PENDING_REVIEW;
- create a pending SchoolMembership with SCHOOL_ADMINISTRATOR role;
- record an audit event and notification outbox record (notification outbox is a later slice).

If a matching School is ambiguous, stop and route to manual identity review; do not merge.

### Registration decision

One transaction must:
- load registration constrained to the PlatformAdministrator action and current status;
- validate transition from PENDING_REVIEW to APPROVED or REJECTED;
- record reviewer, decision time and reason;
- activate or deny the initial SchoolMembership;
- append audit event;
- enforce optimistic concurrency using the row version or an equivalent conditional update.

### School administration

Every operation must resolve an ACTIVE SchoolMembership against an APPROVED CouncilSchoolRegistration. The caller's Person comes from the authenticated account. A client-supplied registration, school or Council ID is only a requested resource identifier, never authorization context.

## 6. Deletion and retention

- No cascade delete from Council to School, registration, membership or audit.
- Membership and registration lifecycle is represented by status and timestamps.
- AuditEvent is append-only through application policy and restricted database privileges.
- Actual retention durations are intentionally not configured until legal/privacy review.
- Development data is synthetic and disposable.

## 7. Implementation sequence

1. Validate Prisma schema and generate client.
2. Add domain service and API contracts for registration submission/review.
3. Add unit tests for state transitions and tenant invariants.
4. Add PostgreSQL integration tests, including composite-FK and partial-index cases.
5. Generate and inspect SQL migration; CI applies it to an ephemeral PostgreSQL 18 service on every push/PR.
6. Exercise the registration API and authorization lifecycle against PostgreSQL integration fixtures before exposing the workflow publicly.
7. Extend distributed rate limiting to future invitation/export routes and complete password recovery and operational recovery before production onboarding.
8. Deploy only to a non-production environment with synthetic test data until legal/privacy and registry gates are satisfied.

## 8. Explicitly deferred

- Password reset, MFA/passkeys and account recovery policy details.
- Council role invitation/assignment workflows beyond the initial SchoolAdministrator.
- School Administrator replacement/recovery UI.
- Assessment, candidate, mark and result models.
- RLS, until Prisma transaction-local tenant context is proven.
- External notifications and integrations.
- Production retention jobs and real learner data.


## 9. School class and Class Teacher slice (`202611240003_school_classes`)

`SchoolClass` belongs to exactly one `CouncilSchoolRegistration` and Council. Its natural uniqueness key is `(registrationId, academicYear, grade, streamCode)`. Grades are explicit `GRADE_1` through `GRADE_9` values. `streamCode` is normalized to uppercase and defaults to `MAIN`. A new academic year creates a new class identity; historical classes are retained and may later be archived.

`StaffAssignment` is separate from `SchoolMembership`. The first implemented assignment type is `CLASS_TEACHER`, scoped to one class and one active TEACHER membership in the same school registration. A partial unique index allows at most one active Class Teacher per class. Reassignment ends the existing row and creates a new row, preserving history. Composite foreign keys ensure class and membership share the same registration and Council.

The application service also verifies the target teacher account is active, the teacher membership is active/effective, and the caller is an active School Administrator for an approved school. Class creation and assignment changes are serializable and audited. The Class Teacher assignment grants coordination only: no learner roster, marks, subject, assessment or results access. Subject Teacher assignments require the versioned curriculum and Council learning-area configuration and are not yet implemented.

The migration includes these additional database constraints:

~~~sql
CREATE UNIQUE INDEX "StaffAssignment_one_active_class_teacher"
ON "StaffAssignment" ("schoolClassId")
WHERE "type" = 'CLASS_TEACHER' AND "status" = 'ACTIVE' AND "endsAt" IS NULL;

CHECK ("academicYear" BETWEEN 2000 AND 2100);
CHECK ("streamCode" = upper(btrim("streamCode")) AND length("streamCode") BETWEEN 1 AND 20);
CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");
~~~

The PostgreSQL integration constraint script exercises class uniqueness, stream normalization, one active Class Teacher per class and tenant-bound assignment membership. Real learner data remains blocked until `docs/research/kenya-child-data-privacy-review.md` release gates are satisfied.
