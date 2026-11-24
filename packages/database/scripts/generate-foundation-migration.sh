#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_DIR="$ROOT_DIR/prisma/migrations/202611240001_foundation"

if [[ -e "$MIGRATION_DIR" ]]; then
  echo "Migration directory already exists: $MIGRATION_DIR" >&2
  exit 1
fi

mkdir -p "$MIGRATION_DIR"

cd "$ROOT_DIR"
pnpm exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$MIGRATION_DIR/migration.sql"

cat >> "$MIGRATION_DIR/migration.sql" <<'SQL'

-- Only one active registration episode per Council and canonical School.
-- Historical REJECTED, WITHDRAWN and EXPIRED episodes remain available.
CREATE UNIQUE INDEX "CouncilSchoolRegistration_one_active"
ON "CouncilSchoolRegistration" ("councilId", "schoolId")
WHERE "status" IN ('PENDING_REVIEW', 'APPROVED', 'SUSPENDED');
SQL

echo "Generated foundation migration at $MIGRATION_DIR/migration.sql"
echo "Review the SQL before applying it to a non-production PostgreSQL database."
