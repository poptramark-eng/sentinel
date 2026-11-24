# ADR-002: Confirm the application split and domain ownership baseline

- **Status:** Accepted as the implementation direction; domain rules remain subject to the approval gates stated below.
- **Date:** 2026-11-24
- **Supersedes:** The earlier Next.js-only implementation direction in the 2026-11-23 Notion architecture baseline, for the new Sentinel repository.

## Context

The CBE engineering workspace dated 2026-11-23 described preserving an existing Next.js App Router + PostgreSQL + Prisma application and explicitly said not to introduce a separate NestJS service without an architecture decision. Sentinel was independently inspected on 2026-11-24 and was empty: it had no application code, dependencies, schema, migrations or existing runtime to preserve.

The 2026-11-24 Autonomous Development Master Instructions explicitly name Next.js as the frontend and NestJS + Fastify as the backend, with PostgreSQL, Prisma, Upstash, Resend and other provider integrations.

The product is multi-council. A council is the tenant boundary for council-owned data. Schools are canonical institutions that may have separate registrations in multiple councils. An independent organization may organize an assessment only through explicit council-granted authority.

## Decision

1. Use a pnpm TypeScript monorepo.
2. Use Next.js App Router for the web application and NestJS with Fastify for the API.
3. The NestJS API owns authentication, authorization, domain rules, integration callbacks and all database access.
4. The Next.js application is a presentation client. It must not connect directly to PostgreSQL or duplicate business rules in route handlers.
5. PostgreSQL is the authoritative persistent store; Prisma is the ORM.
6. Use Upstash Redis for ephemeral cache, throttling and short-lived coordination only. Use QStash/Workflow for justified asynchronous work. Do not introduce Kafka or microservices without demonstrated need.
7. Keep provider-specific Paystack, Daraja, USDC, Resend and SMS logic behind backend adapters.
8. The council is the primary tenant boundary. Model organizer authority and school participation explicitly; do not copy canonical schools to represent assessment participation.
9. No physical Prisma migration is included in this ADR. The logical data design remains a draft and contains unresolved business rules.

## Alternatives considered

- Preserve a single Next.js full-stack application: fewer deployments, but conflicts with the newer explicit NestJS/Fastify backend direction.
- Separate web and API applications in a modular monorepo: selected for clear responsibility boundaries and independent API security.
- Microservices/event streaming from the outset: rejected as unnecessary operational overhead for the initial product.

## Consequences and guardrails

- The API is the sole trusted policy enforcement point.
- All endpoints and background jobs derive tenant/resource scope from verified memberships and current authority records.
- UI visibility is not authorization.
- Keep the API a modular monolith until independent scaling or ownership justifies service extraction.
- Keep the web and API contracts explicit and versionable.
- The 2026-11-23 logical data design remains a draft. Its accepted domain decisions can guide design, but open questions must not be silently converted into database constraints.
- Do not run Prisma migrations until the tenant ownership matrix, full authorization matrix, school/person/learner identifier policies, candidate uniqueness, grading ownership and result-correction lifecycle have been reviewed and signed off by the authorized product stakeholders.

## Review triggers

Revisit if the team explicitly decides to consolidate the API into Next.js, if the deployment split creates unacceptable operational cost, or if validated scale/security requirements require a different architecture.
