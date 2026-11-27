# Supabase Auth and assessment workspace

## Scope of this increment

The Next.js application now uses Supabase SSR clients for browser and server requests. Supabase Auth is the session and token authority. The school workspace, first-school bootstrap and assessment register/creation/mark-entry screens use the caller's Supabase session and the existing RLS-protected Data API.

No email notification, SMS, WhatsApp, parent messaging or learner account workflow is included.

## First administrator provisioning

Public self-registration is deliberately not enabled by the application. Create the first trusted administrator account in Supabase Dashboard → Authentication → Users using the administrator's chosen credentials and confirm the account in the dashboard. This is account provisioning, not an email-notification feature. The first authenticated user may complete the one-time school bootstrap while the schools table is empty; the database RPC assigns that user the `school_admin` role. The RPC serializes concurrent first-run attempts and rejects subsequent bootstrap attempts.

Do not expose a service-role key in Next.js or the browser. Configure only the project URL and publishable key as public environment variables.

## Implemented workflows

- Password sign-in with Supabase Auth.
- SSR session cookie refresh through Next.js `src/proxy.ts` and `@supabase/ssr`.
- Server-rendered workspace guarded with `auth.getClaims()`.
- One-time school bootstrap using `public.bootstrap_school`.
- Assessment register and assessment creation using `public.create_assessment_with_areas`.
- Per-learner/per-learning-area mark entry and correction using `public.save_assessment_score`.
- All application data access uses the signed-in user's Data API context so RLS applies.

## Known limits / release gates

- The Supabase project has no user account provisioned by this change; do not invent or commit credentials.
- Configure Vercel environment variables for Preview and Production before deployment.
- Supabase Auth email confirmation settings must be configured for the chosen manual account-provisioning process; no app-level email workflow is implemented.
- The assessment schema currently has no separate submission, moderation, approval or immutable result-publication tables. Those workflow stages must be designed and implemented before describing results as approved/published.
- The current security advisor still flags nine SECURITY DEFINER functions callable by authenticated users. Their authorization checks and intended RPC exposure need a focused review. Do not blindly revoke helper functions used inside RLS policies.
- The existing five application migrations were applied to the hosted project but are not all represented as SQL migration files in the repository. Reconstruct and commit a canonical migration baseline before future database changes.
- Keep real learner data out of the project until privacy, retention and production acceptance gates are completed.
