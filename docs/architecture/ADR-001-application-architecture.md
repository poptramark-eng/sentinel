# ADR-001: Separate web and API applications in a TypeScript monorepo

- **Status:** Accepted for the initial implementation; review before production deployment.
- **Date:** 2026-11-24

## Context

Sentinel was empty. The CBE engineering workspace describes a previous Next.js App Router implementation in a different repository and says not to introduce a separate NestJS service there without an explicit decision. The newer autonomous-development brief identifies Next.js plus NestJS/Fastify as the preferred architecture and requires clear separation of frontend, backend, database and infrastructure responsibilities.

Because Sentinel has no existing implementation to preserve, the architecture can be established deliberately. The platform has complex authorization, assessment workflows, payment-provider callbacks, background processing and tenant isolation requirements.

## Decision

Use a pnpm TypeScript monorepo with Next.js App Router for the web client, NestJS with Fastify for the API, PostgreSQL for persistence and Prisma ORM 7 for data access. The API owns authentication, authorization, business rules and data access. The web application is a presentation client, not a second business-logic backend.

## Alternatives considered

1. **Next.js full-stack monolith:** fewer deployments and simpler local setup, but concentrates UI and domain APIs.
2. **Next.js + NestJS/Fastify:** separate deployable responsibilities and structured modules; adds operational complexity.
3. **NestJS-only server-rendered application:** not selected because the product benefits from a dedicated React frontend.

## Rationale

The split aligns with the latest project brief, supports independent API security and operational controls, and lets the frontend focus on task-oriented workflows. Operational complexity will be controlled by starting with a modular monolith API and minimal infrastructure.

## Consequences

- The API owns all authorization and tenant-scoped data access.
- The web app must never connect directly to PostgreSQL.
- PostgreSQL is the permanent source of truth; Redis is not a ledger.
- Avoid microservices and Kafka by default; add asynchronous infrastructure only for demonstrated workloads.
- Authentication is application-owned; do not add third-party identity providers.
- Revisit if team size, deployment burden or product requirements materially change.

## Version selection

The initial scaffold targets Next.js 16.4.6, NestJS 12.0.3 and Prisma ORM 7.10.1. Prisma 8 was a release candidate at discovery time; the stable Prisma 7 line is selected for the first schema/migration baseline.
