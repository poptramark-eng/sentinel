import { test } from "node:test";
import assert from "node:assert/strict";
import { PlatformCouncilService } from "../dist/platform-councils/platform-council.service.js";
import { SchoolRegistrationService } from "../dist/school-registrations/school-registration.service.js";

const actor = { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const councilId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const regionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("Platform Administrator council creation is audited", async () => {
  const audit = [];
  const council = { id: councilId, name: "Example Council", slug: "example-council", status: "ACTIVE" };
  const client = {
    $transaction: async (callback) => callback({
      council: { create: async ({ data }) => ({ ...council, ...data }) },
      auditEvent: { create: async ({ data }) => { audit.push(data); return data; } },
    }),
  };
  const result = await new PlatformCouncilService({ client }).create(actor, {
    name: " Example Council ",
    slug: "EXAMPLE-COUNCIL",
  });

  assert.equal(result.name, "Example Council");
  assert.equal(result.slug, "example-council");
  assert.equal(audit[0].action, "PLATFORM_COUNCIL_CREATED");
  assert.equal(audit[0].actorAccountId, actor.accountId);
});

test("geography nodes require an active parent in the same Council", async () => {
  let created = false;
  const tx = {
    council: { findUnique: async () => ({ id: councilId, status: "ACTIVE" }) },
    region: { findFirst: async () => null },
    county: { create: async () => { created = true; return {}; } },
    auditEvent: { create: async ({ data }) => data },
  };
  const service = new PlatformCouncilService({ client: { $transaction: async (callback) => callback(tx) } });

  await assert.rejects(
    service.createGeographyNode(actor, councilId, {
      type: "COUNTY",
      parentId: regionId,
      name: "Foreign County",
    }),
    (error) => error.getStatus() === 404,
  );
  assert.equal(created, false);
});

test("non-region geography nodes cannot omit their parent", async () => {
  const tx = {
    council: { findUnique: async () => ({ id: councilId, status: "ACTIVE" }) },
  };
  const service = new PlatformCouncilService({ client: { $transaction: async (callback) => callback(tx) } });
  await assert.rejects(
    service.createGeographyNode(actor, councilId, { type: "COUNTY", name: "County" }),
    (error) => error.getStatus() === 400,
  );
});

test("school registration cluster options return the full geography path", async () => {
  let query;
  const client = {
    council: { findFirst: async () => ({ id: councilId }) },
    cluster: {
      findMany: async (input) => {
        query = input;
        return [{
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          name: "Central Cluster",
          code: "CENTRAL",
          zone: {
            name: "Central Zone",
            subcounty: {
              name: "Town Subcounty",
              county: {
                name: "Example County",
                region: { name: "Example Region" },
              },
            },
          },
        }];
      },
    },
  };
  const result = await new SchoolRegistrationService({ client }).listActiveClusters(councilId);

  assert.deepEqual(result[0], {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "Central Cluster",
    code: "CENTRAL",
    region: "Example Region",
    county: "Example County",
    subcounty: "Town Subcounty",
    zone: "Central Zone",
  });
  assert.equal(query.where.councilId, councilId);
  assert.equal(query.where.zone.is.subcounty.is.county.is.region.is.status, "ACTIVE");
});

test("school registration rejects a cluster with an inactive geography ancestor", async () => {
  let clusterQuery;
  const tx = {
    council: { findFirst: async () => ({ id: councilId }) },
    cluster: {
      findFirst: async (input) => { clusterQuery = input; return null; },
    },
  };
  const service = new SchoolRegistrationService({
    client: { $transaction: async (callback) => callback(tx) },
  });

  await assert.rejects(
    service.submit(
      { accountId: actor.accountId, personId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
      {
        councilId,
        clusterId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        school: { name: "Example School" },
      },
    ),
    (error) => error.getStatus() === 404,
  );

  assert.equal(clusterQuery.where.zone.is.status, "ACTIVE");
  assert.equal(clusterQuery.where.zone.is.subcounty.is.status, "ACTIVE");
  assert.equal(clusterQuery.where.zone.is.subcounty.is.county.is.status, "ACTIVE");
  assert.equal(clusterQuery.where.zone.is.subcounty.is.county.is.region.is.status, "ACTIVE");
});
