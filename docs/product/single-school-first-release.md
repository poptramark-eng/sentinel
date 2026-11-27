# Single-school CBE system — first-release scope

**Status:** Accepted product direction, 28 November 2026  
**Implementation branch:** feat/single-school-first-release  
**Reference:** https://github.com/gvffbhdvgf/cbe/tree/sentinel/bootstrap/sentinel  
**Delivery repository:** https://github.com/poptramark-eng/sentinel

## Product definition

A secure, curriculum-informed learner and assessment management system for one configured Kenyan school. Each deployment is dedicated to one school. The first release supports school-internal assessment and learner progress; it is not an interschool examination council or a general multi-school SaaS product.

The school identity and initial administrator are configured during first-run setup. Do not invent a school name or seed real learner data.

## Included in the first release

1. **School setup:** school profile, type, contacts, academic years, terms, school settings and configured curriculum.
2. **Identity and access:** school administrator and teacher accounts, invitations, secure sign-in, account recovery, role/permission management and audit history.
3. **School structure:** Grades 1–9, classes, streams, learning areas and teacher assignments.
4. **Learner lifecycle:** learner identity, admission/enrolment, class placement, transfers/withdrawals, learner record corrections with reason, independent review for sensitive identity changes.
5. **Curriculum:** versioned curriculum catalogue and school adoption; learning areas by grade; preserve provenance and avoid inventing curriculum outcomes or grading thresholds.
6. **Internal assessment:** create formative/summative assessments, select grades/classes/streams/learning areas, schedule entry windows, record marks, validate, correct and lock marks.
7. **Review and release:** teacher submission, school-level review/approval, controlled result publication and immutable published versions with audited corrections.
8. **Reporting:** learner report cards, class/school summaries, learning-area analysis, performance distributions and PDF/Excel exports.
9. **Operations:** notifications, safe imports, backups, monitoring, privacy controls and synthetic-data test fixtures.

## Explicitly excluded from this release

- Councils, organisers, external assessment invitations or participation.
- Inter-school assessment, shared examination events, school-to-school comparison, council-wide ranking or analytics.
- Multi-council tenancy and public school registration/approval workflows.
- Learner or guardian login portals in the initial release.

Keep these as possible future product extensions, not active navigation or operational workflows. Do not destructively delete historical code or documentation until dependencies and migration consequences are reviewed.

## Roles

- **School Administrator:** owns school configuration, staff access, classes, learner records, curriculum adoption, assessments, publication and school-wide reports.
- **Class Teacher:** manages assigned class learner context, coordinates assessment entry and reviews class completeness.
- **Subject Teacher:** enters and corrects marks for assigned learning areas and classes.
- **Learners:** records only; no login accounts in this release.

Enforce permissions in the API/database. UI navigation is not an authorization boundary. A teacher must not gain access to another class or learning area by changing an identifier.

## Assessment and result rules

- Scores are numeric out of 100 unless an approved assessment-specific scheme explicitly says otherwise.
- Do not invent CBC performance-level boundaries or rubric thresholds.
- Preserve raw marks separately from computed summaries and performance interpretations.
- Every mark correction must preserve actor, timestamp, reason and prior value in restricted audit history.
- Published result versions are immutable; corrections create a new version with provenance.
- Do not expose learner data outside the school.
- Analytics must show denominators, missing-data treatment and the calculation method.

## Reference-repo evaluation

Review the reference branch's product discovery, domain workflows, role/permission matrix, learner data model, curriculum registers, class placement governance, learner correction workflow, security threat model, UX journeys and brand/design system. Reuse well-reasoned product patterns, not unreviewed implementation details. The reference app is a standalone Next.js app using Neon Auth; do not copy its backend or credentials into Sentinel.

## Architecture direction

The accepted direction is Next.js App Router + Supabase as the backend platform (PostgreSQL, Auth, RLS, Storage and narrowly scoped Edge Functions), with Cloudflare as the target app hosting/edge platform subject to compatibility tests, GitHub as source control/CI and this Notion workspace as durable project context. The current NestJS/Fastify API, Prisma layer and custom auth are legacy migration sources, not the target runtime. Before replacing existing code:
- inspect actual manifests, lockfile, schema, migrations and tests;
- map current domain behavior and data before migration;
- use the accepted Supabase Auth decision: Supabase owns identity/session/token issuance; NestJS verifies Supabase-issued access tokens;
- design and test Supabase RLS, grants, Storage policies and Edge Function boundaries;
- validate Next.js deployment compatibility on Cloudflare Workers; do not retain the NestJS API as a permanent backend unless a specific requirement justifies an exception;
- keep secrets out of Git and use environment-specific secret stores.

No production data migration, destructive schema reset, paid plan purchase or production traffic cutover is authorized by this scope note.

## Privacy and release gates

Use synthetic learner and assessment data in development. Real learner-data onboarding remains blocked until the existing child-data privacy/legal release gates and required operational controls are evidenced and approved. Apply data minimisation, least privilege, auditability, retention and secure export controls.

## Delivery sequence

1. Baseline audit: inspect current code, database schema/migrations, authorization and tests; inventory council/interschool dependencies.
2. Single-school domain: define school configuration boundary and remove council/interschool requirements from first-release workflows without data loss.
3. Supabase foundation: provision/verify schema, migrations, auth decision, RLS policies, storage and Edge Function boundaries.
4. Core school workflows: users, classes, learners, curriculum, assignments.
5. Internal assessment: authoring, marks entry, validation, review, publication and corrections.
6. Reporting and exports.
7. Cloudflare/GitHub deployment pipeline, previews, monitoring, backups and release gates.
8. Security, privacy, accessibility and end-to-end verification before production.

## Open items

- School name and initial school administrator are to be entered during first-run setup.
- Supabase Auth is accepted and recorded in Notion; it supersedes the prior first-party JWT direction. Existing custom auth code remains legacy source until the Supabase migration and tests are complete.
- Hosting split and API runtime must be validated against the actual app and Cloudflare capabilities.
- Curriculum data and grading rules must be sourced/approved; do not fabricate them.
