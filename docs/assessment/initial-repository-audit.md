# Initial Repository Audit

**Date:** 2026-11-24  
**Repository:** [poptramark-eng/sentinel](https://github.com/poptramark-eng/sentinel)  
**Branch:** `main`

## Repository state at discovery

- Repository existed and was accessible with administrator/push permissions.
- GitHub reported size 0, no files, no commits and no branch refs at the start of discovery.
- The default branch was configured as `main`.
- No application code, dependencies, migrations, tests, environment configuration or deployment workflows existed to inspect.

## Implemented features at discovery

None. The repository was empty.

## Architecture and data assessment

The CBE Notion workspace provides a working domain baseline for a multi-council examination platform. Its domain exploration is not an approved physical schema. The first design must resolve council/tenant ownership, cross-council school participation, global teacher identity and school memberships, learner identity and assessment-specific candidates, assessment participation, mark correction history, submission states, approval and release.

## Authentication and authorization

No authentication or authorization code existed. Requirements call for application-owned authentication, JWTs in secure HTTP-only cookies, refresh-token lifecycle management, server-side authorization, tenant/resource scope checks, audit logging and abuse protection. Learner identifiers must never function as login secrets.

## UI/UX and design system

No UI existed. Workflows must be designed for platform/council administrators, school administrators and educators. Mark entry needs keyboard-efficient spreadsheet-like interaction, drafts, validation, recovery and clear submission states. Responsive behavior and WCAG 2.2 AA considerations are acceptance criteria.

## Integrations and infrastructure

No integrations, deployment configuration, hosting services, CI/CD, database connection, monitoring or backups existed. Provider boundaries are planned for Resend, a researched Kenyan SMS provider, Paystack, Safaricom Daraja and independently verified USDC payments. Upstash is for ephemeral cache, throttling and suitable asynchronous workflows; PostgreSQL remains authoritative.

## Security and privacy risks

No authentication, authorization, tenant isolation, audit trail, data lifecycle controls, secrets policy, backup, recovery or monitoring existed. Educational records may include children's personal data. Use synthetic data until privacy, hosting and operational arrangements have been reviewed.

## Prioritized roadmap

1. Establish monorepo, architecture records and secure configuration baseline.
2. Baseline tenancy, identity, school participation and assessment lifecycle.
3. Implement database foundation and authorization model.
4. Implement custom authentication and onboarding.
5. Build curriculum and assessment setup.
6. Build candidate registration, marks entry, correction and submission.
7. Implement result governance and release.
8. Build reports, analytics and exports.
9. Integrate notifications and payment rails where required.
10. Complete security, accessibility, performance and operational verification.

This audit describes the repository before initialization. A foundation commit is not evidence that the application is tested or production-ready.
