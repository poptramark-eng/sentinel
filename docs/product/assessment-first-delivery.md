# Assessment-first delivery scope

**Status:** Accepted product direction — 28 November 2026  
**Delivery repository:** `poptramark-eng/sentinel`  
**Backend project:** Supabase `sentinel` (`jnbosxwvruczovnownlg`)

## Product focus

Build a CBE assessment management application. The product is not a general school ERP. The primary user journey is:

1. Configure the school, academic year, terms, classes and learning areas.
2. Maintain learner records and class enrolments needed for assessment participation.
3. Create formative and summative assessments.
4. Assign teachers to classes and learning areas.
5. Capture, validate and correct marks.
6. Submit and review marks with an auditable history.
7. Approve and publish results.
8. View learner, class and school performance and export reports.

School setup, classes, learner records and teacher assignments are included only as the minimum supporting foundation for reliable assessment workflows.

## Scope deliberately deferred

- Email notifications and email delivery workflows.
- SMS, WhatsApp and all other messaging/notification integrations.
- Parent/guardian portal and learner login accounts.
- Fees, finance, attendance, timetable, admissions and unrelated ERP features.
- Councils, external assessment invitations, inter-school participation and cross-school analytics in the initial delivery.

No email provider, SMS provider, notification queue or messaging feature should be implemented in this milestone. Authentication may continue to use an email address as an account identifier; that does not authorize building email communications.

## Single-school delivery rationale

**Decision:** Ship the first usable deployment for one configured school because development time is constrained.

This is a delivery sequencing decision, not a permanent product ceiling. Keep school ownership explicit in the data model and authorization checks. Avoid hard-coded assumptions that prevent a later multi-school edition, but do not build multi-school administration, tenancy onboarding or cross-school workflows now.

## Assessment integrity requirements

- Marks are numeric out of 100 for the initial workflow unless an approved assessment-specific scheme says otherwise.
- Do not invent CBC performance-level boundaries or grading thresholds.
- Preserve raw marks independently from calculated summaries and analytics.
- Mark corrections must record the actor, timestamp, previous value, new value and reason.
- Submitted and published data must not be silently overwritten.
- Published results are immutable; a correction creates a new, traceable version.
- Teachers must only access assigned classes and learning areas.
- School-level approval and publication are distinct from teacher mark entry and submission.
- Use synthetic learner data during development. Real child data remains blocked until the repository's privacy/legal release gates are evidenced and approved.

## Delivery order

1. **Supabase foundation:** schema, grants, RLS, role model and audit controls.
2. **Identity:** Supabase Auth and secure Next.js session integration; no parallel application password/JWT system.
3. **School setup:** one-time school bootstrap, academic year, terms, classes and learning areas.
4. **Learner and teacher setup:** staff roles, assignments, learner records and class enrolments.
5. **Assessment workflow:** creation, mark entry, correction, submission and review.
6. **Results:** approval, immutable publication, learner/class/school summaries and exports.
7. **Deployment:** Cloudflare compatibility validation, preview and production smoke tests.

## Current implementation status (28 November 2026)

- Supabase project is active and healthy in `eu-west-1`.
- Five application schema/workflow migrations are recorded, covering school core, learner enrolment, academic-year setup, assessment setup and mark entry.
- A sixth security migration revokes direct API execution of the auth-user trigger function.
- Fifteen public application tables were observed with RLS enabled and no application rows at verification time.
- Supabase security advisor still reports nine authenticated-callable SECURITY DEFINER functions. These are currently used as guarded RPCs or RLS helpers and require a dedicated least-privilege review; they are not being treated as automatically safe merely because they check authentication.
- The web application has not yet been migrated to Supabase Auth/Data API. The existing Next.js/NestJS/Prisma code remains legacy and must not be represented as already integrated with Supabase.
- No production learner data, administrator account, production cutover or Cloudflare deployment was created by this milestone.
