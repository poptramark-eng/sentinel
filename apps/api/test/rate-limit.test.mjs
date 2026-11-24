import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthRateLimitGuard } from "../dist/auth/rate-limit.guard.js";
import { RateLimitService } from "../dist/auth/rate-limit.service.js";
import { AuthController } from "../dist/auth/auth.controller.js";

process.env.WEB_ORIGIN = "http://localhost:3000";

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

test("development permits local auth when Upstash credentials are absent", async () => {
  await withEnvironment({
    NODE_ENV: "development",
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
  }, async () => {
    const service = new RateLimitService();
    assert.deepEqual(await service.checkLogin("127.0.0.1", "person@example.test"), { allowed: true });
    assert.deepEqual(await service.checkRefresh("127.0.0.1"), { allowed: true });
  });
});

test("production fails closed when Upstash rate-limit credentials are absent", async () => {
  await withEnvironment({
    NODE_ENV: "production",
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
  }, async () => {
    const service = new RateLimitService();
    await assert.rejects(service.checkLogin("127.0.0.1", "person@example.test"), (error) => error.getStatus() === 503);
    await assert.rejects(service.checkRefresh("127.0.0.1"), (error) => error.getStatus() === 503);
  });
});

test("rate-limit guard returns 429 and Retry-After when a policy is exceeded", async () => {
  const headers = [];
  const reflector = { get: () => "LOGIN" };
  const service = {
    checkLogin: async (ip, email) => {
      assert.equal(ip, "192.0.2.10");
      assert.equal(email, "person@example.test");
      return { allowed: false, resetAt: Date.now() + 20_000 };
    },
  };
  const guard = new AuthRateLimitGuard(reflector, service);
  const context = {
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ ip: "192.0.2.10", body: { email: "person@example.test" }, headers: { origin: "http://localhost:3000" } }),
      getResponse: () => ({ header: (name, value) => headers.push([name, value]) }),
    }),
  };

  await assert.rejects(guard.canActivate(context), (error) => error.getStatus() === 429);
  assert.equal(headers[0][0], "Retry-After");
  assert.ok(Number(headers[0][1]) >= 1);
});


test("login and refresh endpoints declare explicit rate-limit policies", () => {
  assert.equal(
    Reflect.getMetadata("sentinel:auth-rate-limit-policy", AuthController.prototype.login),
    "LOGIN",
  );
  assert.equal(
    Reflect.getMetadata("sentinel:auth-rate-limit-policy", AuthController.prototype.refresh),
    "REFRESH",
  );
});


test("untrusted origin is rejected before rate-limit evaluation", async () => {
  let checks = 0;
  const guard = new AuthRateLimitGuard({ get: () => "LOGIN" }, { checkLogin: async () => { checks += 1; return { allowed: true }; } });
  const context = { getHandler: () => ({}), switchToHttp: () => ({ getRequest: () => ({ ip: "192.0.2.10", body: { email: "sample@example.test" }, headers: { origin: "https://external.example" } }), getResponse: () => ({ header: () => undefined }) }) };
  await assert.rejects(guard.canActivate(context), (error) => error.getStatus() === 401);
  assert.equal(checks, 0);
});
