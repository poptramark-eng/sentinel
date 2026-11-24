import { test } from "node:test";
import assert from "node:assert/strict";
import { NotificationService } from "../dist/notifications/notification.service.js";

const notification = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  councilId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  assessmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  recipientAccountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  recipientEmail: "admin@example.test",
  recipientName: "Amina",
  template: "ASSESSMENT_SCHEDULED",
  subject: "Assessment scheduled",
  textBody: "Assessment details",
  htmlBody: "<p>Assessment details</p>",
  attemptCount: 0,
};

function makeService() {
  const calls = { updates: [], audits: [], claims: [] };
  const tx = {
    notificationDelivery: { update: async (args) => calls.updates.push(args) },
    auditEvent: { create: async (args) => calls.audits.push(args) },
  };
  const client = {
    notificationDelivery: {
      findMany: async () => [notification],
      updateMany: async (args) => { calls.claims.push(args); return { count: 1 }; },
    },
    $transaction: async (callback) => callback(tx),
  };
  return { service: new NotificationService({ client }), calls };
}

async function withResend(callback) {
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Sentinel <no-reply@example.test>";
  const originalFetch = globalThis.fetch;
  try { await callback(); }
  finally {
    globalThis.fetch = originalFetch;
    if (previous.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.RESEND_API_KEY;
    if (previous.EMAIL_FROM === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previous.EMAIL_FROM;
  }
}

test("scheduled assessment email content escapes untrusted HTML fields", () => {
  const content = NotificationService.scheduledAssessmentContent({
    recipientName: "<Amina>", assessmentName: "<script>alert(1)</script>",
    assessmentCode: "T1", grade: "GRADE_4", academicYear: 2026,
    opensAt: new Date("2026-12-01T08:00:00.000Z"),
    closesAt: new Date("2026-12-05T15:00:00.000Z"),
  });
  assert.match(content.subject, /Assessment scheduled/);
  assert.doesNotMatch(content.htmlBody, /<script>/);
  assert.match(content.htmlBody, /&lt;script&gt;/);
  assert.match(content.textBody, /2026/);
});

test("Resend acceptance marks a queued assessment notification sent and audits it", async () => {
  await withResend(async () => {
    const { service, calls } = makeService();
    globalThis.fetch = async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
    await service.processPendingForAssessment(notification.assessmentId);
    assert.equal(calls.claims.length, 1);
    assert.equal(calls.updates[0].data.status, "SENT");
    assert.equal(calls.updates[0].data.providerMessageId, "re_123");
    assert.equal(calls.audits[0].data.action, "NOTIFICATION_SENT");
  });
});

test("provider rejection marks delivery failed and records the failure", async () => {
  await withResend(async () => {
    const { service, calls } = makeService();
    globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });
    await service.processPendingForAssessment(notification.assessmentId);
    assert.equal(calls.updates[0].data.status, "FAILED");
    assert.equal(calls.audits[0].data.action, "NOTIFICATION_FAILED");
  });
});