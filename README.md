# CBE Interschool Examination Management Platform

A multi-council platform for configuring and administering assessments, managing participating schools and candidates, collecting and validating marks, governing result approval and release, and producing trusted analytics and reports.

## Project status

The monorepo foundation, first-party Argon2id authentication, school-registration review, Council curriculum configuration, school classes and learner enrollment, Class Teacher and curriculum-scoped Subject Teacher assignments, assessment configuration/scheduling, marks entry/submission/moderation, and immutable result preview/publication vertical slices are implemented. The platform is not production-ready: password recovery, School Administrator final-submission workflow, completion of the authorization matrix, bulk data workflows, comprehensive analytics/report exports, post-publication correction workflows and production operations remain incomplete. Account registration/email verification and foundation migrations are CI-tested; production email and Upstash credentials still need owner configuration. Use synthetic learner and assessment data only. See `docs/research/kenya-child-data-privacy-review.md`; real learner-data onboarding is blocked until the documented privacy/legal release gates are evidenced.

## Architecture

- Web: Next.js App Router + TypeScript
- API: NestJS with Fastify
- Data: PostgreSQL + Prisma
- Cache and rate limiting: Upstash Redis
- Background delivery/workflows: Upstash QStash and Workflow, introduced only where needed
- Email: Resend
- Payments: Paystack, Safaricom Daraja (M-PESA), and independently verified USDC wallet payments

PostgreSQL is the system of record. Redis is not a permanent ledger or source of truth. The API owns authentication, authorization, business rules and database access. The web app is a presentation client.

## Requirements and design status

- The Council is the tenant boundary for council-owned data.
- Canonical school identity is separate from council-specific school registration and assessment participation.
- Teacher identity is global; school membership and assignments are school-specific.
- Learners do not have login accounts.
- Internal and external assessment result-governance paths are distinct.
- Core identity, tenant, geography and school-registration foundation models are implemented in Prisma. The foundation and email-verification migrations are generated and applied in ephemeral PostgreSQL CI; no persistent database has been migrated.
- Core identity and authorization decisions are recorded in docs/decisions/decision-register.md; legal/privacy and external identifier validation gates remain open.
- The initial foundation migration is generated and CI applies it to an ephemeral PostgreSQL 18 database, then checks cross-Council foreign keys and active-registration uniqueness.
- Registration, verification, login, resend and refresh use distributed Upstash rate limits; production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` and fails closed if they are missing or unavailable.
- Email verification uses the Resend API; production requires a sending-only `RESEND_API_KEY`, verified `EMAIL_FROM` domain and `WEB_APP_URL`. Local preview links require `DEV_EMAIL_PREVIEW=true` outside production.

Read:
- `docs/architecture/` — ADRs and architecture boundaries
- `docs/domain/` — domain model, tenant ownership and workflow state machines
- `docs/security/` — authentication, authorization and security baseline
- `docs/integrations/provider-research.md` — Daraja, Paystack, SMS and privacy research
- `docs/product/` — product scope and UX principles

## Local development

Requirements:
- Node.js 22.12 or later
- pnpm 10.0.0
- PostgreSQL for database-backed API features

Install dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` and configure a local PostgreSQL `DATABASE_URL`, `WEB_ORIGIN`, `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_PEPPER`. Generate independent secrets with `openssl rand -base64 48`. Never commit the real `.env` file or provider credentials.

Run both applications:

```bash
pnpm dev
```

Or run each separately:

```bash
pnpm dev:web
pnpm dev:api
```

- Web: http://localhost:3000
- API health: http://localhost:4000/api/health
- Sign-in: http://localhost:3000/login
- Account registration: http://localhost:3000/register
- Email verification: http://localhost:3000/verify-email
- School registration status: http://localhost:3000/school-registration
- New school registration: http://localhost:3000/school-registration/new
- Platform Council/geography setup and CSV import: http://localhost:3000/platform/councils
- Platform school-registration review: http://localhost:3000/platform/school-registrations
- School teacher roster: open a school membership in the workspace and choose **Manage teachers**
- School classes and staff assignments: open an approved school membership and choose **Manage classes**, then **Subject Teachers** for class-level learning-area assignments
- Educator UX prototype: http://localhost:3000/prototype/marks-entry

The marks-entry prototype uses synthetic data and local page state only. It does not call the API or persist marks.

Platform Council setup supports manual hierarchy entry and a validated, preview-first CSV import (2,000 rows / 1 MB, atomic commit). No real Kenyan geography dataset has been loaded; validate the authoritative source before production import.

School Administrators can link an existing verified Sentinel account to an approved school. Linking reuses the global Person and creates only a school-specific membership. Teacher invitation/provisioning is not implemented yet. School classes, Class Teacher coordination and curriculum-scoped Subject Teacher assignments are implemented. Subject Teacher assignments are tied to the effective published Council curriculum and grant only learning-area-specific marks access.

The API provides school-scoped teacher roster/linking endpoints under `/api/school/registrations/:registrationId/teachers` and class management under `/api/school/registrations/:registrationId/classes`. Linking reuses a global Person with an active account and verified email; it never creates a duplicate identity. Class Teacher assignment grants class-coordination and assigned-roster access; it does not grant marks entry. Subject Teacher assignment is scoped to one enabled curriculum learning area and grants marks access only for that area.

The KICD regular curriculum source review and a 120-row Grades 1–9 directory extraction are available under `docs/research/` and `data/curriculum/`. These are review artifacts only: optionality and assessment eligibility remain unapproved, and no production curriculum seed is published.

The API provides first-party `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, and `GET /api/auth/me` endpoints, plus authenticated school-registration submission/status and PlatformAdministrator review endpoints. The web app includes account registration, explicit email verification, sign-in, a registrant-facing school registration form, an authenticated workspace, Platform Administrator Council/geography setup and a registration review workspace. Public account registration creates no role or tenant membership; the school-registration request remains a separate approval workflow. Password reset is not yet implemented.

After configuring a local PostgreSQL database, apply the reviewed migrations with `pnpm db:migrate:deploy`. Then bootstrap the first PlatformAdministrator by building the workspace, setting `BOOTSTRAP_ADMIN_GIVEN_NAME`, `BOOTSTRAP_ADMIN_FAMILY_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` in the local environment, then run:

```bash
pnpm build
pnpm --filter @cbe/api bootstrap:platform-admin
```

The bootstrap command refuses to run if an active PlatformAdministrator already exists. Do not use it as a public endpoint or commit bootstrap credentials.

## Quality checks

```bash
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm build
```

CI runs the same validation/build checks with frozen-lockfile installation.

## Safety

- Do not load real learner data in development.
- Do not create production credentials or activate paid providers without explicit approval.
- Do not run Prisma migrations against production. The foundation migration is generated and CI-tested against ephemeral PostgreSQL; it still needs a deliberate non-production deployment and restore/recovery rehearsal before production use.
- Never commit secrets, tokens, private keys or personal learner information.
