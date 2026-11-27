# Supabase-first backend transition

**Status:** Accepted direction; implementation design in progress  
**Date:** 28 November 2026  
**Repository:** `poptramark-eng/sentinel`  
**Branch:** `feat/single-school-first-release`  
**Reference product repository:** `gvffbhdvgf/cbe` — product/workflow reference only

## 1. Target architecture

- **Web application:** Next.js App Router, TypeScript and React.
- **Backend platform:** Supabase PostgreSQL, Supabase Auth, Row Level Security, Storage and narrowly scoped Edge Functions.
- **Data access:** Supabase Data API through request-scoped `supabase-js` clients. Authenticated requests carry the caller's JWT so PostgreSQL RLS applies.
- **Authorization:** explicit school roles and permissions stored in trusted database records. Authentication is not authorization.
- **Hosting and edge:** Cloudflare Workers for the Next.js application, subject to runtime/adapter compatibility tests.
- **Source control and CI:** GitHub.
- **Durable product context and decisions:** the existing CBE Notion workspace.

Supabase Realtime is optional and should be introduced only for a defined user workflow. Avoid adding extra infrastructure without a concrete requirement.

## 2. Legacy implementation to port from

The active repository currently contains a pnpm monorepo with:
- Next.js 16.4.6 web app and React 19.3.1.
- NestJS/Fastify 12.0.3 API.
- Prisma 7.10.1 with PostgreSQL adapter packages.
- A custom authentication subsystem with account registration, password hashing, email verification, password reset, refresh-token rotation, CSRF cookies and HMAC-signed application JWTs.
- A council-centric Prisma schema and a sequence of committed migrations.

The NestJS API and Prisma schema are not the target backend. They are valuable sources of existing domain rules, lifecycle behavior, validation, audit events and tests. Do not delete them before equivalent Supabase-backed behavior has been implemented and verified. Do not add new product features to the legacy API.

## 3. Supabase Auth and identity model

Accepted decision: Supabase Auth replaces the custom first-party JWT/password/session implementation.

- Supabase Auth owns credentials, sign-in, recovery, sessions and access-token issuance.
- Link each authenticated Supabase user to a school application profile using a stable UUID foreign key to `auth.users(id)`.
- Keep school role, active status and fine-grained permissions in trusted application tables; do not authorize from user-editable `user_metadata`.
- Keep learner records separate from login identities. Learners have no login accounts in the first release.
- Define administrator bootstrap/invitation flows using Supabase Auth and audited profile/membership creation.
- Preserve account lifecycle controls, audit attribution and invitation expiry semantics from the existing code where they remain applicable.
- Plan a safe transition for any existing accounts before changing a live environment. Never assume that the currently hosted production system has no user records.

For Next.js SSR, use the official `@supabase/ssr` client pattern. Validate server-side identity using the current documented claims-validation method (for example `auth.getClaims()` where supported by the project's signing configuration); do not trust a cookie merely because it exists. Use a request-specific server client and a browser client only where needed.

## 4. Database, RLS and grants

- Keep the single-school boundary explicit in the data model. A school identifier should be resolved from trusted membership/configuration, not accepted as arbitrary authority from the browser.
- Design school-owned tables with explicit ownership references and constraints.
- Enable RLS on every table in an exposed schema.
- Use explicit policies per operation and role. `TO authenticated` alone is not sufficient.
- UPDATE policies need both `USING` and `WITH CHECK`; UPDATE also requires a matching SELECT policy.
- Never use user-editable metadata as an authorization source.
- Keep privileged functions in non-exposed schemas where possible. Prefer invoker rights; any necessary definer-rights function requires explicit security review, narrow grants and tests.
- Views exposed to authenticated clients must use security-invoker semantics where supported and be checked for RLS behavior.
- Revoke unnecessary default privileges and grant only the Data API permissions required by the app.
- Do not expose the service-role/secret key to the browser. Never use privileged credentials to bypass authorization.

RLS tests must cover at least School Administrator, Class Teacher, Subject Teacher, unauthenticated user and cross-record ID substitution. Verify read, insert, update, delete, export and function invocation paths.

## 5. Edge Function boundaries

Use Edge Functions for narrowly scoped server-side workflows such as:
- administrator invitation/bootstrap orchestration;
- transactional email or other integrations requiring server-side secrets;
- imports/exports or processing that should not run in the browser;
- privileged multi-step workflows that need a well-defined transaction boundary.

Use PostgreSQL constraints and transactions for data integrity. Use SQL functions/RPC only when the operation benefits from database atomicity or controlled server-side execution. Do not put ordinary CRUD behind Edge Functions when RLS-protected Data API access is sufficient.

Every function must verify the caller, resolve their school permissions, validate inputs, write audit events and fail closed. Function JWT verification settings must not be disabled as a shortcut.

## 6. Cloudflare deployment

Cloudflare is the intended hosting/edge target for the Next.js application. The current repository does not yet establish a verified Cloudflare Next.js deployment. Before selecting an adapter:
- inspect the current Cloudflare Next.js support and runtime compatibility;
- test the selected vinext direction against the app's actual Next.js 16.4.6 features;
- use the documented OpenNext fallback only if the primary direction fails required compatibility tests;
- keep Supabase secrets in server-side environment bindings;
- configure preview and production environments separately;
- verify the deployed Worker version, routes, auth cookie behavior, server rendering, database requests and production smoke tests.

Do not claim deployment success from a committed workflow or a configured GitHub connection alone.

## 7. Migration sequence

1. **Baseline inventory:** map existing Prisma models, migrations, API routes, authorization guards, state machines, audit events, tests and live deployment/data state.
2. **Single-school domain model:** remove council/inter-school runtime assumptions from the first-release model while preserving the school's internal assessment and learner workflows.
3. **Supabase schema design:** create a data dictionary, ERD, constraints, migration/rollback plan and RLS matrix. Keep child data synthetic during development.
4. **Auth foundation:** configure Supabase Auth, profile mapping, role membership and admin bootstrap. Test sign-in, sign-out, recovery, invitation, session refresh and account disable/revocation.
5. **RLS-first vertical slice:** implement school profile, staff, classes and learners using request-scoped Supabase clients. Test every policy as each role.
6. **Assessment vertical slice:** implement internal assessments, mark entry, correction history, review, publication and immutable result versions.
7. **Reports and files:** add school-scoped reports, exports and Storage policies.
8. **Retire legacy API:** only after feature parity, data migration/transition, security and regression tests pass.
9. **Cloudflare delivery:** complete compatibility testing, preview pipeline, production deployment and smoke tests.

## 8. Current verified environment

- Supabase project `sentinel`, ref `jnbosxwvruczovnownlg`, region `eu-west-1`, PostgreSQL 17.12, status `ACTIVE_HEALTHY`.
- At the last inspection, the project had no public application tables and no recorded migrations; no Edge Functions were listed.
- Existing repository migrations have not been applied to this Supabase project.
- The repository currently has no Supabase JS/SSR dependencies in the web or API manifests and no deployed Cloudflare Worker for this application was verified in this work.
- No application code, dependencies, Prisma schema, hosted database or production deployment was changed as part of this architecture decision.

## 9. Explicit non-goals and safety gates

- No inter-school assessments, councils, organizers or cross-school analytics in the first release.
- No learner login accounts.
- No real learner data in development.
- No destructive reset, production data migration, production auth cutover or live deployment until reviewed and authorized.
- No paid upgrade without a separate cost explanation and approval.
- No secrets in GitHub or Notion.

## 10. Verification references

- Supabase Next.js SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase Auth / Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
