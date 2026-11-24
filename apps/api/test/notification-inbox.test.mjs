import { test } from "node:test";
import assert from "node:assert/strict";
import { NotificationInboxService } from "../dist/notifications/notification-inbox.service.js";

const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const notificationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const item = {
  id: notificationId, subject: "Assessment scheduled",
  textBody: "Assessment details", status: "SENT",
  createdAt: new Date("2026-11-24T08:00:00.000Z"), readAt: null,
};

function makeService() {
  const calls = { findMany: [], count: [], updateMany: [], findFirst: [], findFirstOrThrow: [] };
  const client = {
    notificationDelivery: {
      findMany: async (args) => { calls.findMany.push(args); return [item]; },
      count: async (args) => { calls.count.push(args); return 1; },
      updateMany: async (args) => { calls.updateMany.push(args); return { count: 1 }; },
      findFirst: async (args) => { calls.findFirst.push(args); return item; },
      findFirstOrThrow: async (args) => { calls.findFirstOrThrow.push(args); return { ...item, readAt: new Date() }; },
    },
  };
  return { service: new NotificationInboxService({ client }), calls };
}

test("notification inbox is scoped to the authenticated account and bounds page size", async () => {
  const { service, calls } = makeService();
  const result = await service.listForAccount(accountId, 500);
  assert.equal(result.unreadCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(calls.findMany[0].where.recipientAccountId, accountId);
  assert.equal(calls.findMany[0].take, 50);
  assert.equal(calls.count[0].where.readAt, null);
});

test("mark-read updates only a notification belonging to the current account", async () => {
  const { service, calls } = makeService();
  await service.markRead(accountId, notificationId);
  assert.deepEqual(calls.updateMany[0].where, {
    id: notificationId, recipientAccountId: accountId, readAt: null,
  });
  assert.equal(calls.findFirstOrThrow[0].where.recipientAccountId, accountId);
});

test("mark-all-read only updates unread notifications for the current account", async () => {
  const { service, calls } = makeService();
  const result = await service.markAllRead(accountId);
  assert.equal(result.updatedCount, 1);
  assert.deepEqual(calls.updateMany[0].where, {
    recipientAccountId: accountId, readAt: null,
  });
});

test("mark-read does not disclose notifications belonging to another account", async () => {
  const { service } = makeService();
  const original = service["prisma"].client.notificationDelivery.updateMany;
  service["prisma"].client.notificationDelivery.updateMany = async () => ({ count: 0 });
  service["prisma"].client.notificationDelivery.findFirst = async () => null;
  await assert.rejects(service.markRead(accountId, notificationId), { status: 404 });
  service["prisma"].client.notificationDelivery.updateMany = original;
});