# CBE Interschool Examination Management Platform

A multi-council platform for configuring and administering assessments, managing participating schools and candidates, collecting and validating marks, governing result approval and release, and producing trusted analytics and reports.

## Project status

The repository foundation and first educator UX prototype are in place. The platform is not production-ready. Use synthetic learner and assessment data until privacy, hosting, and operational controls have been reviewed.

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
- The physical database schema and migrations are intentionally not implemented until the open identity, authorization, candidate uniqueness and result-correction decisions are reviewed.

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

Copy `.env.example` to `.env` and configure `DATABASE_URL` for a local PostgreSQL database. Never commit the real `.env` file or provider credentials.

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
- Educator UX prototype: http://localhost:3000/prototype/marks-entry

The marks-entry prototype uses synthetic data and local page state only. It does not call the API or persist marks.

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
- Do not run Prisma migrations until the logical data model and authorization design gates are satisfied.
- Never commit secrets, tokens, private keys or personal learner information.
