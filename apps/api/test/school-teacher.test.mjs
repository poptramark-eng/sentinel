import { test } from "node:test";
import assert from "node:assert/strict";
import { SchoolTeacherService } from "../dist/school-teachers/school-teacher.service.js";

const actor = {
  accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const registrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const councilId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const teacherPersonId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function adminScope() {
  return {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    registrationId,
    councilId,
    registration: {
      school: { id: "11111111-1111-4111-8111-111111111111", name: "Example School" },
      council: { id: councilId, name: "Western Council" },
    },
  };
}

function createFixture({ identifier, existingMembership = null, adminMembership = true } = {}) {
  let committed = false;
  let createdMembership;
  let auditEvent;
  let identifierQuery;
  const scope = adminMembership ? {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    registrationId,
    councilId,
    registration: {
      school: { id: "11111111-1111-4111-8111-111111111111", name: "Example School" },
      council: { id: councilId, name: "Western Council" },
    },
  } : null;
  const tx = {
    schoolMembership: {
      findFirst: async ({ where }) => {
        if (where.personId === actor.personId) return scope;
        return null;
      },
      findUnique: async () => existingMembership,
      create: async ({ data }) => {
        createdMembership = data;
        return { id: "22222222-2222-4222-8222-222222222222" };
      },
      update: async ({ data }) => {
        createdMembership = data;
        return { id: "22222222-2222-4222-8222-222222222222" };
      },
    },
    loginIdentifier: {
      findFirst: async (input) => { identifierQuery = input; return identifier ?? null; },
    },
    auditEvent: { create: async ({ data }) => { auditEvent = data; return data; } },
  };
  const client = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      const result = await callback(tx);
      committed = true;
      return result;
    },
  };
  const notification = [];
  const email = {
    sendSchoolMembershipAddedEmail: async (input) => {
      assert.equal(committed, true, "notification must be sent after membership transaction commits");
      notification.push(input);
    },
  };
  return {
    service: new SchoolTeacherService({ client }, email),
    get createdMembership() { return createdMembership; },
    get auditEvent() { return auditEvent; },
    get identifierQuery() { return identifierQuery; },
    notification,
  };
}

const verifiedIdentifier = {
  normalizedValue: "teacher@example.org",
  account: {
    id: "33333333-3333-4333-8333-333333333333",
    person: {
      id: teacherPersonId,
      givenName: "Amina",
      familyName: "Teacher",
      displayName: null,
    },
  },
};

test("School Administrator links one existing global teacher by verified email", async () => {
  const fixture = createFixture({ identifier: verifiedIdentifier });
  const result = await fixture.service.link(actor, registrationId, " Teacher@Example.org ");

  assert.equal(fixture.createdMembership.personId, teacherPersonId);
  assert.equal(fixture.createdMembership.registrationId, registrationId);
  assert.equal(fixture.createdMembership.councilId, councilId);
  assert.equal(fixture.createdMembership.role, "TEACHER");
  assert.equal(fixture.createdMembership.status, "ACTIVE");
  assert.equal(fixture.auditEvent.action, "SCHOOL_TEACHER_LINKED");
  assert.equal(fixture.identifierQuery.where.normalizedValue, "teacher@example.org");
  assert.equal(fixture.identifierQuery.where.verifiedAt.not, null);
  assert.equal(fixture.identifierQuery.where.account.is.platformOperator.is, null);
  assert.equal(result.email, "t***@example.org");
  assert.equal(result.status, "ACTIVE");
  assert.deepEqual(fixture.notification[0], {
    to: "teacher@example.org",
    teacherName: "Amina Teacher",
    schoolName: "Example School",
    councilName: "Western Council",
    action: "LINKED",
  });
});

test("an existing active teacher membership cannot be duplicated", async () => {
  const fixture = createFixture({
    identifier: verifiedIdentifier,
    existingMembership: { id: "44444444-4444-4444-8444-444444444444", status: "ACTIVE", endsAt: null },
  });

  await assert.rejects(
    fixture.service.link(actor, registrationId, "teacher@example.org"),
    (error) => error.getStatus() === 409,
  );
  assert.equal(fixture.createdMembership, undefined);
  assert.equal(fixture.notification.length, 0);
});

test("a school administrator cannot link an unverified or unknown email", async () => {
  const fixture = createFixture({ identifier: null });
  await assert.rejects(
    fixture.service.link(actor, registrationId, "unknown@example.org"),
    (error) => error.getStatus() === 404,
  );
});

test("teacher linking requires an active approved School Administrator membership", async () => {
  const fixture = createFixture({ identifier: verifiedIdentifier, adminMembership: false });
  await assert.rejects(
    fixture.service.link(actor, registrationId, "teacher@example.org"),
    (error) => error.getStatus() === 403,
  );
});

test("teacher roster is limited to the approved school and masks verified email addresses", async () => {
  let rosterQuery;
  const client = {
    schoolMembership: {
      findFirst: async () => adminScope(),
      findMany: async (query) => {
        rosterQuery = query;
        return [{
          id: "teacher-membership",
          status: "ACTIVE",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          person: {
            id: teacherPersonId,
            givenName: "Taylor",
            familyName: "Teacher",
            displayName: null,
            account: {
              status: "ACTIVE",
              loginIdentifiers: [{ normalizedValue: "taylor@example.test" }],
            },
          },
        }];
      },
    },
  };
  const service = new SchoolTeacherService({ client }, { sendSchoolMembershipAddedEmail: async () => {} });
  const result = await service.list(actor, registrationId);

  assert.equal(rosterQuery.where.registrationId, registrationId);
  assert.equal(rosterQuery.where.councilId, councilId);
  assert.equal(rosterQuery.where.role, "TEACHER");
  assert.equal(result.teachers[0].email, "t***@example.test");
  assert.equal(result.teachers[0].name, "Taylor Teacher");
});
