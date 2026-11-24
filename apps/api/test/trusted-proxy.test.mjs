import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTrustedProxies } from "../dist/auth/trusted-proxy.js";

test("proxy trust defaults to disabled", () => {
  assert.equal(resolveTrustedProxies(undefined), false);
  assert.equal(resolveTrustedProxies("false"), false);
});

test("proxy trust accepts explicit IP and CIDR allowlists", () => {
  assert.deepEqual(resolveTrustedProxies("10.0.0.10"), ["10.0.0.10"]);
  assert.deepEqual(resolveTrustedProxies("10.0.0.10, 10.0.1.0/24"), ["10.0.0.10", "10.0.1.0/24"]);
});

test("proxy trust rejects wildcard trust", () => {
  assert.throws(() => resolveTrustedProxies("true"), /wildcard trust is not allowed/);
  assert.throws(() => resolveTrustedProxies("*"), /wildcard trust is not allowed/);
});
