import { test } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { CouncilAdministratorGuard } from "../dist/auth/council-administrator.guard.js";
import { CouncilGovernanceApproverGuard } from "../dist/auth/council-governance-approver.guard.js";
import { CouncilRubricReaderGuard } from "../dist/auth/council-rubric-reader.guard.js";
import { PlatformOperatorGuard } from "../dist/auth/platform-operator.guard.js";

const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const personId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const councilId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function context(params = { councilId }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ auth: { accountId, personId, authVersion: 1 }, params }),
    }),
  };
}

function prisma({ membership = null, operator = null } = {}) {
  const queries = {};
  const client = {
    userAccount: {
      findUnique: async (query) => {
        queries.account = query;
        return { personId };
      },
    },
    councilMembership: {
      findFirst: async (query) => {
        queries.membership = query;
        return membership;
      },
    },
    platformOperator: {
      findUnique: async (query) => {
        queries.operator = query;
        return operator;
      },
    },
  };
  return { client, queries };
}

test("Council Administrator access is bound to the requested Council and active person membership", async () => {
  const { client, queries } = prisma({ membership: { id: "membership-1" } });
  const guard = new CouncilAdministratorGuard({ client });
  assert.equal(await guard.canActivate(context()), true);
  assert.equal(queries.account.where.id, accountId);
  assert.equal(queries.membership.where.councilId, councilId);
  assert.equal(queries.membership.where.personId, personId);
  assert.equal(queries.membership.where.role, "COUNCIL_ADMINISTRATOR");
  assert.equal(queries.membership.where.status, "ACTIVE");
  assert.ok(queries.membership.where.AND.some((condition) => condition.OR?.some((item) => item.startsAt?.lte instanceof Date)));
  assert.ok(queries.membership.where.AND.some((condition) => condition.OR?.some((item) => item.endsAt?.gt instanceof Date)));
});

test("Council Administrator access denies a membership lookup that does not match the requested Council", async () => {
  const { client, queries } = prisma({ membership: null });
  const guard = new CouncilAdministratorGuard({ client });
  await assert.rejects(
    guard.canActivate(context({ councilId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" })),
    (error) => error instanceof ForbiddenException,
  );
  assert.equal(queries.membership.where.councilId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
});

test("Council Administrator access denies missing identity or Council scope", async () => {
  const { client } = prisma({ membership: { id: "membership-1" } });
  const guard = new CouncilAdministratorGuard({ client });
  await assert.rejects(guard.canActivate(context({})), (error) => error instanceof ForbiddenException);
  await assert.rejects(
    guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ params: { councilId } }) }) }),
    (error) => error instanceof ForbiddenException,
  );
});

test("Council Governance Approver access requires the approver role in the requested Council", async () => {
  const { client, queries } = prisma({ membership: { id: "membership-2" } });
  const guard = new CouncilGovernanceApproverGuard({ client });
  assert.equal(await guard.canActivate(context()), true);
  assert.equal(queries.membership.where.councilId, councilId);
  assert.equal(queries.membership.where.personId, personId);
  assert.equal(queries.membership.where.role, "COUNCIL_GOVERNANCE_APPROVER");
  assert.equal(queries.membership.where.status, "ACTIVE");
});

test("Council Governance Approver access denies a missing or expired membership", async () => {
  const { client } = prisma({ membership: null });
  const guard = new CouncilGovernanceApproverGuard({ client });
  await assert.rejects(guard.canActivate(context()), (error) => error instanceof ForbiddenException);
});

test("Council rubric access is limited to active Council Administrators and Governance Approvers", async () => {
  const { client, queries } = prisma({ membership: { id: "membership-3" } });
  const guard = new CouncilRubricReaderGuard({ client });
  assert.equal(await guard.canActivate(context()), true);
  assert.equal(queries.membership.where.councilId, councilId);
  assert.equal(queries.membership.where.personId, personId);
  assert.deepEqual(queries.membership.where.role.in, ["COUNCIL_ADMINISTRATOR", "COUNCIL_GOVERNANCE_APPROVER"]);
  assert.equal(queries.membership.where.status, "ACTIVE");
});

test("Council rubric access denies other Council roles and inactive memberships", async () => {
  const { client } = prisma({ membership: null });
  const guard = new CouncilRubricReaderGuard({ client });
  await assert.rejects(guard.canActivate(context()), (error) => error instanceof ForbiddenException);
});

test("Platform access requires an active Platform Administrator operator record", async () => {
  const { client, queries } = prisma({ operator: { status: "ACTIVE", role: "PLATFORM_ADMINISTRATOR" } });
  const guard = new PlatformOperatorGuard({ client });
  assert.equal(await guard.canActivate(context({})), true);
  assert.equal(queries.operator.where.accountId, accountId);
});

test("Platform access denies inactive and non-administrator operators", async () => {
  for (const operator of [
    null,
    { status: "INACTIVE", role: "PLATFORM_ADMINISTRATOR" },
    { status: "ACTIVE", role: "SUPPORT_OPERATOR" },
  ]) {
    const { client } = prisma({ operator });
    const guard = new PlatformOperatorGuard({ client });
    await assert.rejects(guard.canActivate(context({})), (error) => error instanceof ForbiddenException);
  }
});
