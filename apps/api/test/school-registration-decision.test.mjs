import { test } from "node:test";
import assert from "node:assert/strict";
import { SchoolRegistrationService } from "../dist/school-registrations/school-registration.service.js";

const actor = {
  accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const registrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const schoolId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const councilId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function createDecisionFixture(sendNotification) {
  let committed = false;
  const queries = [];
  const tx = {
    userAccount: {
      findUnique: async () => ({
        id: actor.accountId,
        personId: actor.personId,
        platformOperator: { status: "ACTIVE", role: "PLATFORM_ADMINISTRATOR" },
      }),
    },
    councilSchoolRegistration: {
      findUnique: async ({ select }) => {
        if (select.councilId) {
          return {
            id: registrationId,
            councilId,
            schoolId,
            initialRegistrantPersonId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            status: "PENDING_REVIEW",
            version: 0,
          };
        }
        return {
          id: registrationId,
          status: "APPROVED",
          reviewedAt: new Date("2026-11-24T10:00:00.000Z"),
          decisionReason: "Official evidence reviewed and verified.",
          version: 1,
        };
      },
      updateMany: async () => ({ count: 1 }),
    },
    schoolIdentifier: { count: async () => 0 },
    school: { update: async () => ({ id: schoolId }) },
    schoolMembership: { updateMany: async () => ({ count: 1 }) },
    auditEvent: { create: async () => ({}) },
  };
  const client = {
    $transaction: async (callback) => {
      const result = await callback(tx);
      committed = true;
      return result;
    },
    councilSchoolRegistration: {
      findUnique: async (input) => {
        queries.push(input);
        return {
          submittedSchoolName: "Example School",
          decisionReason: "Official evidence reviewed and verified.",
          council: { name: "Western Council" },
          initialRegistrant: {
            givenName: "Amina",
            account: {
              loginIdentifiers: [{ normalizedValue: "amina@example.org" }],
            },
          },
        };
      },
    },
  };
  const emailService = {
    sendSchoolRegistrationDecisionEmail: async (...args) => {
      assert.equal(committed, true, "email must be sent only after the database transaction commits");
      await sendNotification(...args);
    },
  };
  return { service: new SchoolRegistrationService({ client }, emailService), queries };
}

test("approval commits before notifying the verified initial registrant", async () => {
  let notification;
  const { service, queries } = createDecisionFixture(async (...args) => { notification = args; });
  const result = await service.decide(actor, registrationId, "APPROVED", {
    expectedVersion: 0,
    reason: "Official evidence reviewed and verified.",
  });

  assert.equal(result.status, "APPROVED");
  assert.deepEqual(notification, [
    "amina@example.org",
    "Amina",
    "Example School",
    "Western Council",
    "APPROVED",
    "Official evidence reviewed and verified.",
  ]);
  assert.equal(queries[0].select.initialRegistrant.select.account.select.loginIdentifiers.where.verifiedAt.not, null);
});

test("notification delivery failure does not roll back an approved registration", async () => {
  const { service } = createDecisionFixture(async () => { throw new Error("mail provider unavailable"); });
  const result = await service.decide(actor, registrationId, "APPROVED", {
    expectedVersion: 0,
    reason: "Official evidence reviewed and verified.",
  });
  assert.equal(result.status, "APPROVED");
});
