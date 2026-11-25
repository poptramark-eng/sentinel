# Sentinel production deployment setup

Vercel hosts the Next.js web application from apps/web. The NestJS/Fastify API is a separate long-running Node.js service, and PostgreSQL is the system of record. A READY Vercel deployment alone does not mean the API or database is connected.

## 1. Vercel project settings

Frontend project:

- Repository: poptramark-eng/sentinel
- Production branch: main
- Framework preset: Next.js
- Root Directory: apps/web
- Include source files outside the Root Directory: enabled
- Node.js version: 24.x

API project:

- Same repository and production branch
- Framework preset: NestJS
- Root Directory: apps/api
- Include source files outside the Root Directory: enabled
- Node.js version: 24.x
- Function region: sin1 (Singapore)
- Build command: generate Prisma Client, build @cbe/database, build @cbe/api, then run pnpm db:migrate:deploy

For public production access, attach the intended custom domain in Settings → Domains. Review Settings → Deployment Protection: the current project has Vercel Authentication protection enabled for non-custom domains. Disable or adjust protection only if the site should be publicly accessible.

## 2. Provision the external services

Provision:
- A managed PostgreSQL database (Neon is the current production provider).
- Optional but preferred: an Upstash Redis database for distributed authentication rate limits. If both Upstash REST credentials are absent, Sentinel uses the PostgreSQL-backed `AuthRateLimitEvent` store in Neon. If only one credential is set or configured Upstash is unavailable, authentication protection fails closed with HTTP 503.
- A Resend account with a verified sending domain.

The API is deployed as a Vercel Function; a separate Railway or Render API host is not required.

Keep database and provider credentials in the respective provider secret stores. Do not commit .env files or paste secrets into source control.

## 3. API runtime environment

Configure these variables on the API host:

| Variable | Required value |
| --- | --- |
| NODE_ENV | production |
| DATABASE_URL | Neon pooled/runtime PostgreSQL connection string for application traffic |\n| MIGRATION_DATABASE_URL | Neon direct PostgreSQL connection string for Prisma migrations |
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

The API exposes /api/health as its health-check path. Vercel automatically adapts the NestJS entrypoint to a Function.

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

1. Confirm DATABASE_URL (pooled) and MIGRATION_DATABASE_URL (direct) are configured in the API project's Production environment.
2. The API project's production build runs pnpm db:generate, builds the database and API packages, then runs pnpm db:migrate:deploy.
3. Run the platform-administrator bootstrap script once after deployment, using BOOTSTRAP_ADMIN_GIVEN_NAME, BOOTSTRAP_ADMIN_FAMILY_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD. Use a one-off secure environment and remove bootstrap credentials immediately afterward.

Do not run prisma migrate dev against production. Do not run the bootstrap script repeatedly without checking whether the operator already exists.

## 6. Verify end-to-end

- Open the public frontend and confirm /api/health is reachable through the same-origin proxy.
- Register an account, receive the verification email, and verify the account.
- Sign in and confirm cookies are set as Secure/HttpOnly where appropriate.
- Confirm rate limiting works with the Neon PostgreSQL fallback when both Upstash variables are absent, or with Upstash when both are configured. Verify that partial credentials and backend failures fail closed with HTTP 503.
- Bootstrap and sign in as the Platform Administrator; approve a test school registration.
- Test school administrator provisioning, teacher membership, class/learner workflows, assessment scheduling, mark submission, results publication, and the notification centre.
- Confirm Resend delivery and inspect audit records.
- Use synthetic learner data until the privacy/legal release gates documented in docs/research/kenya-child-data-privacy-review.md are satisfied.

## Current project status

Sentinel's frontend and NestJS API are deployed as separate Vercel projects. Neon PostgreSQL, the PostgreSQL rate-limit table, Resend, and the production migrations are configured. The initial Platform Administrator still needs to be bootstrapped before council oversight and school approval workflows can be used.