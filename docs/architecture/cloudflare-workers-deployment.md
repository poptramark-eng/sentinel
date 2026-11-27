# Cloudflare Workers deployment — cbe

**Status:** Adapter initialized and build-verified; Worker not yet created or deployed.  
**Date:** 28 November 2026

## Runtime approach

Keep the application source on Next.js 16.4.6. Use Cloudflare's `vinext` compatibility/deployment adapter to run the existing App Router application on Workers; this does not replace the product's framework or business logic.

- Cloudflare `vinext check` completed with 96% compatibility and zero reported blockers. The only partial check was `reactStrictMode`; App Router already defaults to strict mode, so the redundant explicit option was removed.
- The generated Cloudflare Vite/Worker build completed successfully in GitHub Actions using Node.js 22.18.0.
- The generated Worker entrypoint is `vinext/server/fetch-handler`; the worker name is `cbe`.
- No `nodejs_compat` flag was added.
- The app does not import `next/image`; image optimization is disabled.

## Build configuration

The generated app scripts are:

- Development: `pnpm --filter @cbe/web run dev:vinext`
- Build: `pnpm --filter @cbe/web run build:vinext`
- Preview: `pnpm --filter @cbe/web run start:vinext`
- Deploy: `pnpm --filter @cbe/web run deploy:vinext`

For Cloudflare Workers Builds, use the repository root as the build root and Node.js 22.18.0 or newer. Configure:

- Build command: `pnpm --filter @cbe/web run build:vinext`
- Deploy command: `pnpm --filter @cbe/web run deploy:vinext`
- Preview command (if requested): `pnpm --filter @cbe/web run start:vinext`

The build configuration must include the public variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

These are public client configuration values. Never configure or expose the Supabase service-role/secret key in the browser or Worker build.

## Data privacy and cache policy

All authenticated workspace routes are force-dynamic and use caller-scoped Supabase SSR clients with RLS. The application reads current data on each request. `revalidatePath` calls were removed from these dynamic server actions because they were redundant and would require a persistent response cache for invalidation.

The Worker is configured with both CDN and data caches disabled. This avoids caching learner records, marks or results and avoids additional Response Store/R2/DO resources. Do not enable shared caching for authenticated school data.

## Deployment status and remaining work

- The Cloudflare account's GitHub connection can see `poptramark-eng/sentinel`; the Workers Builds wizard was opened and the repository selected, but no Worker project was saved.
- The existing Vercel Free project exceeded its daily deployment limit. The new Supabase Auth app commit is merged but the current Vercel deployment remains on the earlier landing-page commit.
- Cloudflare environment variables and the Workers Builds project still need to be configured; no production Worker has been deployed or smoke-tested.
- Use the account's existing `workers.dev` subdomain for the first preview. Do not add a custom domain, DNS zone, paid plan or unrelated Worker changes.
- After deployment, smoke-test the public landing page, Supabase sign-in, first-school bootstrap, assessment creation and mark save. Confirm RLS still isolates all school data.
