import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const id = () => randomUUID();
const ids = {
  councilA: id(), councilB: id(), person: id(), personB: id(), school: id(),
  accountA: id(), accountB: id(), identifierA: id(), identifierB: id(), verificationA: id(),
  regionA: id(), regionB: id(), countyA: id(), countyB: id(),
  subcountyA: id(), subcountyB: id(), zoneA: id(), zoneB: id(),
  clusterA: id(), clusterB: id(),
  registrationA: id(), registrationDuplicate: id(), registrationHistory: id(),
};

async function expectConstraintFailure(constraint, operation) {
  await client.query("SAVEPOINT expected_constraint_failure");
  try {
    await operation();
    assert.fail(`Expected database constraint ${constraint} to reject the operation.`);
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") throw error;
    assert.equal(error?.constraint, constraint, `Unexpected database failure: ${error?.message}`);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_constraint_failure");
    await client.query("RELEASE SAVEPOINT expected_constraint_failure");
  }
}

try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "Council" ("id", "name", "slug", "updatedAt") VALUES
      ($1, 'Constraint Test Council A', $3, NOW()),
      ($2, 'Constraint Test Council B', $4, NOW())`,
    [ids.councilA, ids.councilB, `test-${ids.councilA}`, `test-${ids.councilB}`],
  );
  await client.query(
    `INSERT INTO "Person" ("id", "givenName", "familyName", "updatedAt") VALUES ($1, 'Test', 'Registrant', NOW())`,
    [ids.person],
  );
  await client.query(
    `INSERT INTO "Person" ("id", "givenName", "familyName", "updatedAt") VALUES ($1, 'Second', 'Registrant', NOW())`,
    [ids.personB],
  );
  await client.query(
    `INSERT INTO "School" ("id", "name", "updatedAt") VALUES ($1, 'Synthetic Constraint School', NOW())`,
    [ids.school],
  );
  await client.query(
    `INSERT INTO "Region" ("id", "councilId", "name") VALUES ($1, $2, 'Region A'), ($3, $4, 'Region B')`,
    [ids.regionA, ids.councilA, ids.regionB, ids.councilB],
  );
  await client.query(
    `INSERT INTO "County" ("id", "councilId", "regionId", "name") VALUES ($1, $2, $3, 'County A')`,
    [ids.countyA, ids.councilA, ids.regionA],
  );
  await expectConstraintFailure("County_regionId_councilId_fkey", () =>
    client.query(
      `INSERT INTO "County" ("id", "councilId", "regionId", "name") VALUES ($1, $2, $3, 'Cross Tenant County')`,
      [ids.countyB, ids.councilB, ids.regionA],
    ),
  );
  await client.query(
    `INSERT INTO "Subcounty" ("id", "councilId", "countyId", "name") VALUES ($1, $2, $3, 'Subcounty A')`,
    [ids.subcountyA, ids.councilA, ids.countyA],
  );
  await client.query(
    `INSERT INTO "Zone" ("id", "councilId", "subcountyId", "name") VALUES ($1, $2, $3, 'Zone A')`,
    [ids.zoneA, ids.councilA, ids.subcountyA],
  );
  await client.query(
    `INSERT INTO "County" ("id", "councilId", "regionId", "name") VALUES ($1, $2, $3, 'County B')`,
    [ids.countyB, ids.councilB, ids.regionB],
  );
  await client.query(
    `INSERT INTO "Subcounty" ("id", "councilId", "countyId", "name") VALUES ($1, $2, $3, 'Subcounty B')`,
    [ids.subcountyB, ids.councilB, ids.countyB],
  );
  await client.query(
    `INSERT INTO "Zone" ("id", "councilId", "subcountyId", "name") VALUES ($1, $2, $3, 'Zone B')`,
    [ids.zoneB, ids.councilB, ids.subcountyB],
  );
  await client.query(
    `INSERT INTO "Cluster" ("id", "councilId", "zoneId", "name") VALUES ($1, $2, $3, 'Cluster A'), ($4, $5, $6, 'Cluster B')`,
    [ids.clusterA, ids.councilA, ids.zoneA, ids.clusterB, ids.councilB, ids.zoneB],
  );

  await client.query(
    `INSERT INTO "CouncilSchoolRegistration"
      ("id", "councilId", "schoolId", "clusterId", "submittedSchoolName", "initialRegistrantPersonId", "status", "updatedAt")
      VALUES ($1, $2, $3, $4, 'Synthetic Constraint School', $5, 'PENDING_REVIEW', NOW())`,
    [ids.registrationA, ids.councilA, ids.school, ids.clusterA, ids.person],
  );
  await expectConstraintFailure("CouncilSchoolRegistration_one_active", () =>
    client.query(
      `INSERT INTO "CouncilSchoolRegistration"
        ("id", "councilId", "schoolId", "clusterId", "submittedSchoolName", "initialRegistrantPersonId", "status", "updatedAt")
        VALUES ($1, $2, $3, $4, 'Duplicate Active Episode', $5, 'PENDING_REVIEW', NOW())`,
      [ids.registrationDuplicate, ids.councilA, ids.school, ids.clusterA, ids.person],
    ),
  );
  await client.query(
    `INSERT INTO "CouncilSchoolRegistration"
      ("id", "councilId", "schoolId", "clusterId", "submittedSchoolName", "initialRegistrantPersonId", "status", "updatedAt")
      VALUES ($1, $2, $3, $4, 'Historical Rejected Episode', $5, 'REJECTED', NOW())`,
    [ids.registrationHistory, ids.councilA, ids.school, ids.clusterA, ids.person],
  );
  await expectConstraintFailure("CouncilSchoolRegistration_clusterId_councilId_fkey", () =>
    client.query(
      `INSERT INTO "CouncilSchoolRegistration"
        ("id", "councilId", "schoolId", "clusterId", "submittedSchoolName", "initialRegistrantPersonId", "status", "updatedAt")
        VALUES ($1, $2, $3, $4, 'Cross Tenant Registration', $5, 'PENDING_REVIEW', NOW())`,
      [id(), ids.councilB, ids.school, ids.clusterA, ids.person],
    ),
  );
  await expectConstraintFailure("SchoolMembership_registrationId_councilId_fkey", () =>
    client.query(
      `INSERT INTO "SchoolMembership" ("id", "registrationId", "councilId", "personId", "role", "status", "updatedAt")
       VALUES ($1, $2, $3, $4, 'SCHOOL_ADMINISTRATOR', 'PENDING', NOW())`,
      [id(), ids.registrationA, ids.councilB, ids.person],
    ),
  );

  await client.query(
    `INSERT INTO "UserAccount" ("id", "personId", "status", "updatedAt") VALUES
      ($1, $2, 'PENDING_VERIFICATION', NOW()),
      ($3, $4, 'PENDING_VERIFICATION', NOW())`,
    [ids.accountA, ids.person, ids.accountB, ids.personB],
  );
  await client.query(
    `INSERT INTO "LoginIdentifier" ("id", "accountId", "type", "normalizedValue") VALUES
      ($1, $2, 'EMAIL', 'constraint-a@example.test'),
      ($3, $4, 'EMAIL', 'constraint-b@example.test')`,
    [ids.identifierA, ids.accountA, ids.identifierB, ids.accountB],
  );
  await client.query(
    `INSERT INTO "EmailVerificationToken"
      ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
      VALUES ($1, $2, $3, 'synthetic-token-hash-a', NOW() + INTERVAL '1 day')`,
    [ids.verificationA, ids.accountA, ids.identifierA],
  );
  await expectConstraintFailure("EmailVerificationToken_one_unconsumed_per_identifier", () =>
    client.query(
      `INSERT INTO "EmailVerificationToken"
        ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
        VALUES ($1, $2, $3, 'synthetic-second-active-token', NOW() + INTERVAL '1 day')`,
      [id(), ids.accountA, ids.identifierA],
    ),
  );
  await expectConstraintFailure("EmailVerificationToken_loginIdentifierId_accountId_fkey", () =>
    client.query(
      `INSERT INTO "EmailVerificationToken"
        ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
        VALUES ($1, $2, $3, 'synthetic-token-hash-cross-account', NOW() + INTERVAL '1 day')`,
      [id(), ids.accountA, ids.identifierB],
    ),
  );
  await expectConstraintFailure("EmailVerificationToken_tokenHash_key", () =>
    client.query(
      `INSERT INTO "EmailVerificationToken"
        ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
        VALUES ($1, $2, $3, 'synthetic-token-hash-a', NOW() + INTERVAL '1 day')`,
      [id(), ids.accountB, ids.identifierB],
    ),
  );
  await expectConstraintFailure("EmailVerificationToken_one_unconsumed_per_identifier_key", () =>
    client.query(
      `INSERT INTO "EmailVerificationToken"
        ("id", "accountId", "loginIdentifierId", "tokenHash", "expiresAt")
        VALUES ($1, $2, $3, 'synthetic-second-unconsumed-token', NOW() + INTERVAL '1 day')`,
      [id(), ids.accountA, ids.identifierA],
    ),
  );

  await client.query("ROLLBACK");
  console.log("Foundation PostgreSQL constraints passed: tenant boundaries, active registration uniqueness, historical episodes and email-verification token ownership.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
