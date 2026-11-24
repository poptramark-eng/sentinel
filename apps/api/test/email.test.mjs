import { test } from "node:test";
import assert from "node:assert/strict";
import { EmailService } from "../dist/auth/email.service.js";

async function withEnvironment(values, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("development email preview returns a local verification link without sending", async () => {
  await withEnvironment({
    NODE_ENV: "development",
    DEV_EMAIL_PREVIEW: "true",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    WEB_APP_URL: "http://localhost:3000",
  }, async () => {
    const result = await new EmailService().sendVerificationEmail(
      "amina@example.test",
      "Amina",
      "a".repeat(43),
    );
    assert.ok(result.previewUrl.includes("/verify-email?token="));
  });
});

test("production email delivery fails closed without Resend configuration", async () => {
  await withEnvironment({
    NODE_ENV: "production",
    DEV_EMAIL_PREVIEW: undefined,
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    WEB_APP_URL: undefined,
  }, async () => {
    await assert.rejects(
      new EmailService().sendVerificationEmail("amina@example.test", "Amina", "a".repeat(43)),
      (error) => error.getStatus() === 503,
    );
  });
});

test("Resend receives a server-generated verification message and escaped name", async () => {
  await withEnvironment({
    NODE_ENV: "production",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Sentinel <verify@example.org>",
    WEB_APP_URL: "https://sentinel.example.org",
  }, async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return new Response("{}", { status: 200 });
    };
    try {
      await new EmailService().sendVerificationEmail(
        "amina@example.org",
        "<Amina>",
        "b".repeat(43),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.init.headers.Authorization, "Bearer re_test_key");
    assert.equal(request.body.from, "Sentinel <verify@example.org>");
    assert.deepEqual(request.body.to, ["amina@example.org"]);
    assert.match(request.body.html, /&lt;Amina&gt;/);
    assert.ok(request.body.html.includes("https://sentinel.example.org/verify-email?token="));
  });
});

test("Resend receives an escaped school-registration decision notification", async () => {
  await withEnvironment({
    NODE_ENV: "production",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Sentinel <verify@example.org>",
    WEB_APP_URL: "https://sentinel.example.org",
  }, async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return new Response("{}", { status: 200 });
    };
    try {
      await new EmailService().sendSchoolRegistrationDecisionEmail(
        "amina@example.org",
        "Amina",
        "<Example School>",
        "Western Council",
        "REJECTED",
        "Please provide the school's official registration evidence.",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(request.body.subject, "An update on your Sentinel school registration");
    assert.deepEqual(request.body.to, ["amina@example.org"]);
    assert.match(request.body.html, /&lt;Example School&gt;/);
    assert.match(request.body.html, /official registration evidence/);
    assert.ok(request.body.html.includes("https://sentinel.example.org/school-registration"));
  });
});


test("Resend receives an escaped teacher school-membership notification", async () => {
  await withEnvironment({
    NODE_ENV: "production",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Sentinel <verify@example.org>",
    WEB_APP_URL: "https://sentinel.example.org",
  }, async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return new Response("{}", { status: 200 });
    };
    try {
      await new EmailService().sendSchoolMembershipAddedEmail({
        to: "teacher@example.org",
        teacherName: "<Amina>",
        schoolName: "Example <Primary>",
        councilName: "Western Council",
        action: "LINKED",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(request.body.subject, "You've been added as a Teacher in Sentinel");
    assert.deepEqual(request.body.to, ["teacher@example.org"]);
    assert.match(request.body.html, /&lt;Amina&gt;/);
    assert.match(request.body.html, /Example &lt;Primary&gt;/);
    assert.ok(request.body.html.includes("https://sentinel.example.org/workspace"));
  });
});
