# Prisma migrations

Migrations are generated from the reviewed Prisma schema and must be committed with their SQL.

To generate the first migration from the repository root:

```bash
pnpm db:migration:generate
```

The generator creates the foundation migration and appends the partial unique index that Prisma schema syntax cannot represent. Review the complete SQL before applying it.

Apply only to a disposable or non-production PostgreSQL database first:

```bash
pnpm --filter @cbe/database exec prisma migrate deploy
```

Do not apply the migration to production until the schema, generated SQL, backup/restore procedure and rollback/recovery plan have been reviewed. Prisma migrations are forward-only in normal operation; recovery should use a tested restore or corrective migration, not manual deletion of migration history.
