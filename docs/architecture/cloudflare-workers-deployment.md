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

## Current PR validation and child-data release gate

- A dedicated .github/workflows/cloudflare-worker-build.yml now runs the actual build:vinext Worker bundle on relevant pull requests using Node.js 22.18.0 and the repository's pinned pnpm 10.0.0. This complements the compatibility check; compatibility alone is not treated as a successful Worker build.
- The build workflow was corrected to use the manifest-pinned pnpm 10.0.0 and Node.js 22.18.0. The final application change set passed the Cloudflare Worker bundle build on PR #16's final head; the vinext compatibility check passed with 12 supported, zero partial and zero issues. PR #16 is merged to `main` as `2996aac`. PR #17 adds only database security migrations and documentation; its final CI passed and it is merged as `f863b02`.
- Set CHILD_DATA_PROCESSING_ENABLED=false in both Production and Preview Worker environments. The Supabase database independently defaults app.child_data_processing_enabled to false. Do not set either gate to true before the privacy/legal release checks are evidenced and approved.
- The first administrator still needs to be provisioned manually in Supabase Auth. The application does not send teacher invitations or other messages.
- The assessment lifecycle now includes class submission, review, approval, publication, versioned immutable snapshots, a published reports register, Excel-compatible CSV export and browser Print/Save as PDF. These routes remain unavailable while the child-data gate is off.
- Cloudflare Workers Builds still requires a dedicated account token with Account Workers Builds: Edit and Account Workers Scripts: Edit. Do not reuse the unrelated token that only has Email Routing and Artifacts scopes. No token should be pasted into ChatGPT, GitHub or Notion.

## 28 November 2026 — current deployment handoff

- The application code and assessment/report milestone are merged to `main`; the post-merge CI for `f863b02` is being checked. PR #16's final application tree passed the dedicated Cloudflare Worker build and compatibility checks.
- The Cloudflare account still has no `cbe` Worker. The only listed script is the unrelated `llm-chat-app-template`.
- The only listed Workers Builds token is `chanfana-openapi-template build token`, which has Email Routing and Artifacts permissions only. It is not valid for this deployment and must not be reused.
- The Workers Builds setup requires a dedicated account token with **Account → Workers Builds: Edit** and **Account → Workers Scripts: Edit**. The Cloudflare connector cannot create/read account API tokens in this session; the dashboard token-management page was inaccessible.
- After an account owner creates the dedicated token, select it in the Workers Builds setup. Configure the repository root, Node.js 22.18.0, build command `pnpm --filter @cbe/web run build:vinext`, deploy command `pnpm --filter @cbe/web run deploy:vinext`, preview command `pnpm --filter @cbe/web run start:vinext`, and public Supabase variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Keep `CHILD_DATA_PROCESSING_ENABLED=false` for Preview and Production until privacy/legal release checks are evidenced and approved. Do not ask for or store the Supabase service-role key.
- Vercel Free is still over its 100-deployments-per-day limit. No deployment was made to either provider.
- Once deployed, smoke-test login, initial school bootstrap, school setup, teacher assignment, learner enrolment, assessment creation, marks, submission/review/approval/publication, report viewing and CSV export. A complete E2E test still requires a separate non-production Supabase environment with synthetic fixtures.

## 28 November 2026 — existing Worker and deployment automation

- The existing production Worker is named sentinel and is served at https://sentinel.poptramark.workers.dev. The Cloudflare configuration must use worker name sentinel (not the earlier placeholder cbe); apps/web/cloudflare.config.ts has been corrected accordingly.
- The current production version at this handoff is 68397f1b-b076-4d0b-9fc4-a3e5662edac1, annotated with commit ca8509b. It does not yet include the secure account-provisioning changes merged in PR #19.
- The repository's Cloudflare Worker workflow now runs on pull requests and pushes to main. It always builds the Worker bundle. On main pushes it deploys only when the repository Actions secret CLOUDFLARE_API_TOKEN is configured; otherwise it safely skips deployment.
- To enable automated deployment, create a Cloudflare API token with Account Workers Scripts: Edit and Account Settings: Read for this account, then add it as the GitHub repository Actions secret named CLOUDFLARE_API_TOKEN. Never paste the token into chat, source code, workflow YAML, or Notion. The account ID is configured as a non-secret workflow value.
- No deployment has been claimed from this PR. The next main push after the secret is configured will build and deploy the sentinel Worker through the existing deploy:vinext script. Keep the Supabase service-role/secret key out of Cloudflare public variables.
