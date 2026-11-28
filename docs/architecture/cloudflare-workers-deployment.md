# Cloudflare Workers deployment — Sentinel

**Status:** Production Worker deployed and serving the application. Cloudflare is the sole deployment target.  
**Last verified:** 28 November 2026

## Runtime

- Framework: Next.js App Router 16.4.6 with Cloudflare's `vinext` adapter.
- Worker name: `sentinel`.
- Production URL: https://sentinel.poptramark.workers.dev
- Worker entrypoint: `vinext/server/fetch-handler`.
- Compatibility date: `2026-11-27`; no `nodejs_compat` flag.
- Application data backend: Supabase (PostgreSQL, Auth and RLS).
- Source control and deployment automation: GitHub repository `poptramark-eng/sentinel`, branch `main`, GitHub Actions.

## Build and deployment commands

- Development: `pnpm --filter @cbe/web run dev:vinext`
- Build: `pnpm --filter @cbe/web run build:vinext`
- Preview: `pnpm --filter @cbe/web run start:vinext`
- Deploy: `pnpm --filter @cbe/web run deploy:vinext`

The repository workflow `.github/workflows/cloudflare-worker-build.yml`:
- Builds the Worker bundle on relevant pull requests and pushes to `main`.
- On pushes to `main`, deploys the `sentinel` Worker when the GitHub Actions secret `CLOUDFLARE_API_TOKEN` is configured.
- Uses the repository's pinned pnpm 10.0.0 and Node.js 22.18.0.
- Uses the Cloudflare account ID as a non-secret workflow value. Never place API tokens in source code, workflow YAML, chat or Notion.

## Runtime bindings

The Worker currently has these bindings:
- `ASSETS` — Worker static assets.
- `NEXT_PUBLIC_SUPABASE_URL` — public Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — public browser-safe key.
- `CHILD_DATA_PROCESSING_ENABLED=false` — deployment-level child-data release guard.

The Supabase database has an independent child-data control. Keep both controls fail-closed until the privacy, legal, safeguarding and operational release requirements are evidenced and approved. Never expose the Supabase service-role/secret key in browser code or public Worker bindings.

## Production deployment verification — 28 November 2026

Cloudflare API inspection confirmed:
- Worker script `sentinel` exists in the account.
- The latest deployment is `c613ea14-243e-46b4-b46b-5048e344bdb6`, created at 10:23:05 UTC on 28 November 2026.
- The active 100% version is `b165dd5e-d53f-42c3-93c9-5236a9bd6156`.
- Deployment annotation: `Polish published report table filters and empty states`.
- Worker version annotation identifies commit `98b0a13`.
- Runtime bindings were inspected; the child-data release flag is `false`.
- The account has no Workers Builds configuration attached to this script. Deployment currently uses the repository's GitHub Actions workflow and Cloudflare API token secret.

The production URL above is the canonical smoke-test target. Do not test or report deployment status using an old hosting provider or its former custom-domain alias.

## Data privacy and cache policy

Authenticated workspace routes are force-dynamic and use caller-scoped Supabase SSR clients with RLS. The Worker has CDN and data caches disabled to avoid caching learner records, marks or results. Do not enable shared caching for authenticated school data.

Use synthetic learner data until the privacy/legal release gates documented in `docs/research/kenya-child-data-privacy-review.md` are satisfied. Do not submit, approve or publish assessments unless explicitly requested by the user.

## Operational smoke tests

Use the Cloudflare production URL and a user-authenticated browser session to verify:
1. Public landing page and sign-in route.
2. Supabase sign-in and session persistence.
3. School workspace and school setup.
4. Class, teacher and learner workflows using synthetic records.
5. Assessment creation, mark entry, submission, review and publication gates.
6. Published report viewing and CSV export after a synthetic assessment has been legitimately published.
7. RLS isolation and the fail-closed child-data controls.

An unauthenticated redirect to sign-in verifies route protection only; it does not count as authenticated workflow verification.
