# Repository Agent Instructions

## Canonical delivery branch

- `main` is the canonical delivery and integration branch for Sentinel.
- Feature branches may be used as temporary workspaces, but completed and verified work must be merged into `main` before reporting the task complete.
- Do not leave completed work stranded in a feature branch or leave a completed pull request waiting for the user to merge.
- Avoid stacked pull requests. Integrate dependencies in order, resolve conflicts, and validate the resulting `main` tree.
- After integration, verify the `main` commit SHA and its CI result. Report the exact commit and any checks that remain outstanding.
- Never force-push or rewrite `main`. Do not discard unrelated user changes.

## Understand the existing project before editing

- Read the root `package.json`, relevant workspace package manifests, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` before proposing architecture or dependency changes.
- Inspect the actual implementation, Prisma schema/migrations, tests, and relevant domain/security documentation before changing behavior.
- Use the versions and APIs already installed. Do not add a dependency when the existing stack can meet the requirement; justify any new runtime dependency and update the lockfile.
- Preserve the monorepo boundaries: Next.js web client, NestJS/Fastify API, and shared Prisma/PostgreSQL database package. The API owns authorization and domain rules; client-side visibility is never a security boundary.

## Validation

Use the repository's pinned Node.js and pnpm versions and the frozen lockfile. Run the checks relevant to the change, and run the complete CI-equivalent sequence before integration when possible:

```bash
pnpm install --frozen-lockfile
pnpm db:validate
pnpm db:migrate:deploy
pnpm db:test:constraints
pnpm typecheck
pnpm lint
pnpm build
```

The root `pnpm build` script builds the database package, API and web app, then runs API tests. CI uses ephemeral PostgreSQL 18; never point validation migrations at production.

## Data and security safeguards

- Use synthetic learner and assessment data only in development and automated tests.
- Never commit secrets, access tokens, provider credentials, production data, or personal learner information.
- Do not run migrations against production, change production secrets, create production administrator accounts, or perform destructive production operations without explicit approval.
- Keep tenant isolation, least privilege, separation of duties, immutable audit history, and fail-closed behavior intact.
- Update documentation when implementation status or operational requirements change; do not describe a feature as complete without code and test evidence.
