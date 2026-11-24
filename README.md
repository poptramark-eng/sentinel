# CBE Interschool Examination Management Platform

A multi-council platform for configuring and administering assessments, managing participating schools and candidates, collecting and validating marks, governing result approval and release, and producing trusted analytics and reports.

## Project status

The monorepo foundation, educator UX prototype, initial tenant/identity Prisma schema, and first-party login/refresh/logout/current-user API are in place. The platform is not production-ready: migrations, account onboarding/verification, rate limiting, full authorization, school-registration endpoints, and production operations remain incomplete. Use synthetic learner and assessment data only.

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
- Core identity, tenant, geography and school-registration foundation models are implemented in Prisma. The first migration is not yet generated or applied.
- Core identity and authorization decisions are recorded in docs/decisions/decision-register.md; legal/privacy and external identifier validation gates remain open.

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
- Platform school-registration review: http://localhost:3000/platform/school-registrations
- Educator UX prototype: http://localhost:3000/prototype/marks-entry

The marks-entry prototype uses synthetic data and local page state only. It does not call the API or persist marks.

The API now provides first-party `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, and `GET /api/auth/me` endpoints, plus authenticated school-registration submission/status and PlatformAdministrator review endpoints. The web app includes a sign-in page, basic authenticated workspace and a PlatformAdministrator registration review workspace. Login is currently limited to pre-provisioned accounts with verified email identifiers. There is no public account signup or password reset yet.

After the reviewed foundation migration has been generated and applied to a local database, bootstrap the first PlatformAdministrator by building the workspace, setting `BOOTSTRAP_ADMIN_GIVEN_NAME`, `BOOTSTRAP_ADMIN_FAMILY_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` in the local environment, then run:

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
- Do not run Prisma migrations against production. The foundation schema is validated, but the initial SQL migration still needs generation, review and a non-production PostgreSQL test.
- Never commit secrets, tokens, private keys or personal learner information.
