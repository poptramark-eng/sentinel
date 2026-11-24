# CBE Interschool Examination Management Platform

A multi-council platform for configuring and administering assessments, managing participating schools and candidates, collecting and validating marks, governing result approval and release, and producing trusted analytics and reports.

## Project status

Repository foundation is being established. The project is not production-ready. Use synthetic learner and assessment data until privacy, hosting, and operational controls have been reviewed.

## Architecture

- Web: Next.js App Router + TypeScript
- API: NestJS with Fastify
- Data: PostgreSQL + Prisma
- Cache and rate limiting: Upstash Redis
- Background delivery/workflows: Upstash QStash and Workflow, introduced only where needed
- Email: Resend
- Payments: Paystack, Safaricom Daraja (M-PESA), and independently verified USDC wallet payments

PostgreSQL is the system of record. Redis is not a permanent ledger or source of truth.

## Development

See `docs/architecture/` and `docs/product/` for architecture decisions, product boundaries, and implementation plans. Never commit credentials or real learner data.