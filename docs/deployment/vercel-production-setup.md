# Sentinel production deployment setup

Vercel hosts the Next.js web application from apps/web. The NestJS/Fastify API is a separate long-running Node.js service, and PostgreSQL is the system of record. A READY Vercel deployment alone does not mean the API or database is connected.

## 1. Vercel project settings

Use the existing Git-linked project for poptramark-eng/sentinel:

- Production branch: main
- Framework preset: Next.js
- Root Directory: apps/web
- Include source files outside the Root Directory: enabled
- Node.js version: 24.x (or another supported version at or above 22.12)
- Build and install commands: automatic from the monorepo configuration

For public production access, attach the intended custom domain in Settings → Domains. Review Settings → Deployment Protection: the current project has Vercel Authentication protection enabled for non-custom domains. Disable or adjust protection only if the site should be publicly accessible.

## 2. Provision the external services

Create:
- A managed PostgreSQL database (Neon or another PostgreSQL provider).
- An Upstash Redis database for distributed authentication rate limits.
- A Node.js API service for apps/api (for example, Render or the existing managed VM).
- A Resend account with a verified sending domain.

Keep database and provider credentials in the respective provider secret stores. Do not commit .env files or paste secrets into source control.

## 3. API runtime environment

Configure these variables on the API host:

| Variable | Required value |
| --- | --- |
| NODE_ENV | production |
| DATABASE_URL | Production PostgreSQL connection string; use the provider's pooled/runtime URL if required by that provider |
| WEB_ORIGIN | Exact public frontend origin, e.g. https://sentinel.example.com |
| WEB_APP_URL | Same canonical frontend origin; used in verification links |
| ACCESS_TOKEN_SECRET | Independent random secret of at least 32 bytes |
| REFRESH_TOKEN_PEPPER | A different random secret of at least 32 bytes |
| UPSTASH_REDIS_REST_URL | Upstash REST URL |
| UPSTASH_REDIS_REST_TOKEN | Upstash REST token |
| RESEND_API_KEY | Sending-only Resend API key |
| EMAIL_FROM | Sender using the verified Resend domain |
| DEV_EMAIL_PREVIEW | false |
| APP_ENV | production (keeps rate-limit keys isolated by environment) |
| TRUST_PROXY | Leave false unless the API host is behind a known proxy; then use only its documented IP/CIDR allowlist |

The API listens on the host-provided PORT when available, then API_PORT, then 4000. Expose /api/health as the service health-check path.

Generate independent secrets locally with openssl rand -base64 48. Never share or commit the generated values.

## 4. Connect Vercel to the API

The browser authentication cookies use SameSite=Lax. To avoid cross-site cookie restrictions when the frontend and API are on different hosting providers, the web app proxies /api/* requests through the Next.js deployment.

In Vercel → Project → Settings → Environment Variables, add:

| Variable | Value |
| --- | --- |
| NEXT_PUBLIC_API_BASE_URL | /api |
| API_PROXY_ORIGIN | API origin only, e.g. https://sentinel-api.example.com (no trailing slash and no /api) |

Add both to Production and Preview only when the corresponding API environment is configured. Set the API's WEB_ORIGIN and WEB_APP_URL to the public frontend origin. Redeploy after changing build-time variables.

The rewrite sends browser requests to the same-origin /api path, preserving the existing cookie-based session model. Do not set NEXT_PUBLIC_API_BASE_URL to localhost in production.

## 5. Apply database migrations and bootstrap the platform operator

After confirming the production database URL and taking a backup:

1. Run pnpm install --frozen-lockfile.
2. Set DATABASE_URL in the deployment shell or a secure one-off migration job.
3. Run pnpm db:generate.
4. Run pnpm db:migrate:deploy from the repository root.
5. Build the API and run the platform-administrator bootstrap script once, using BOOTSTRAP_ADMIN_GIVEN_NAME, BOOTSTRAP_ADMIN_FAMILY_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD.

Do not run prisma migrate dev against production. Do not run the bootstrap script repeatedly without checking whether the operator already exists.

## 6. Verify end-to-end

- Open the public frontend and confirm /api/health is reachable through the same-origin proxy.
- Register an account, receive the verification email, and verify the account.
- Sign in and confirm cookies are set as Secure/HttpOnly where appropriate.
- Confirm rate limiting works with Upstash configured.
- Bootstrap and sign in as the Platform Administrator; approve a test school registration.
- Test school administrator provisioning, teacher membership, class/learner workflows, assessment scheduling, mark submission, results publication, and the notification centre.
- Confirm Resend delivery and inspect audit records.
- Use synthetic learner data until the privacy/legal release gates documented in docs/research/kenya-child-data-privacy-review.md are satisfied.

## Current project status

The Git-linked Vercel deployment is the frontend only. The API host, production database, Upstash credentials, Resend credentials, and production migrations must be configured before real account or assessment workflows can operate. A successful frontend build is not proof of end-to-end readiness.