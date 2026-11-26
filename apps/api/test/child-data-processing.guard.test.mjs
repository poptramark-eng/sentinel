import { test } from "node:test";
import assert from "node:assert/strict";
import { ChildDataProcessingGuard } from "../dist/privacy/child-data-processing.guard.js";

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

test("production learner and assessment data processing is disabled by default", async () => {
  await withEnvironment({ NODE_ENV: "production", CHILD_DATA_PROCESSING_ENABLED: undefined }, async () => {
    assert.throws(
      () => new ChildDataProcessingGuard().canActivate({}),
      (error) => error.getStatus() === 503 && /privacy release gates/.test(error.message),
    );
  });
});

test("production child-data processing requires explicit release approval configuration", async () => {
  await withEnvironment({ NODE_ENV: "production", CHILD_DATA_PROCESSING_ENABLED: "true" }, async () => {
    assert.equal(new ChildDataProcessingGuard().canActivate({}), true);
  });
});

test("non-production environments remain available for synthetic-data development", async () => {
  await withEnvironment({ NODE_ENV: "development", CHILD_DATA_PROCESSING_ENABLED: undefined }, async () => {
    assert.equal(new ChildDataProcessingGuard().canActivate({}), true);
  });
});

test("an unknown runtime environment also fails closed", async () => {
  await withEnvironment({ NODE_ENV: undefined, CHILD_DATA_PROCESSING_ENABLED: undefined }, async () => {
    assert.throws(
      () => new ChildDataProcessingGuard().canActivate({}),
      (error) => error.getStatus() === 503,
    );
  });
});
