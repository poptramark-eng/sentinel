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

test("geography import preview deduplicates repeated case-insensitive paths", async () => {
  const service = new PlatformCouncilService({ client: {} });
  service.getGeography = async () => ({ council: { status: "ACTIVE" }, regions: [] });
  const preview = await service.previewGeographyImport(councilId, {
    rows: [
      { region: "North", county: "Example", subcounty: "Town", zone: "Central", cluster: "Cluster A" },
      { region: " north ", county: "EXAMPLE", subcounty: "Town", zone: "Central", cluster: "cluster a" },
    ],
  });

  assert.equal(preview.valid, true);
  assert.equal(preview.rowsReceived, 2);
  assert.equal(preview.uniqueClusters, 1);
  assert.deepEqual(preview.toCreate, { regions: 1, counties: 1, subcounties: 1, zones: 1, clusters: 1 });
  assert.deepEqual(preview.errors, []);
});

test("geography import preview blocks paths through inactive nodes", async () => {
  const service = new PlatformCouncilService({ client: {} });
  service.getGeography = async () => ({
    council: { status: "ACTIVE" },
    regions: [{
      id: regionId,
      name: "North",
      status: "INACTIVE",
      counties: [],
    }],
  });
  const preview = await service.previewGeographyImport(councilId, {
    rows: [{ region: "North", county: "Example", subcounty: "Town", zone: "Central", cluster: "Cluster A" }],
  });
  assert.equal(preview.valid, false);
  assert.equal(preview.errors[0].field, "region");
  assert.match(preview.errors[0].message, /inactive/i);
});

test("geography import creates missing nodes in one serializable transaction and audits the batch", async () => {
  const audit = [];
  const isolation = [];
  let sequence = 0;
  const makeModel = () => ({
    findFirst: async () => null,
    create: async ({ data }) => ({ id: `node-${++sequence}`, status: "ACTIVE", ...data }),
  });
  const tx = {
    council: { findUnique: async () => ({ id: councilId, status: "ACTIVE" }) },
    region: makeModel(),
    county: makeModel(),
    subcounty: makeModel(),
    zone: makeModel(),
    cluster: makeModel(),
    auditEvent: { create: async ({ data }) => { audit.push(data); return data; } },
  };
  const client = {
    $transaction: async (callback, options) => {
      isolation.push(options?.isolationLevel);
      return callback(tx);
    },
  };
  const service = new PlatformCouncilService({ client });
  service.previewGeographyImport = async () => ({ valid: true, errors: [], errorsTruncated: false });
  const result = await service.importGeography(actor, councilId, {
    rows: [{ region: "North", county: "Example", subcounty: "Town", zone: "Central", cluster: "Cluster A" }],
  });

  assert.equal(result.status, "IMPORTED");
  assert.deepEqual(result.created, { regions: 1, counties: 1, subcounties: 1, zones: 1, clusters: 1 });
  assert.deepEqual(isolation, ["Serializable"]);
  assert.equal(audit[0].action, "PLATFORM_GEOGRAPHY_IMPORTED");
  assert.equal(audit[0].metadata.rowsReceived, 1);
});

test("invalid geography import preview prevents all writes", async () => {
  let transactionStarted = false;
  const service = new PlatformCouncilService({
    client: { $transaction: async () => { transactionStarted = true; } },
  });
  service.previewGeographyImport = async () => ({
    valid: false,
    errors: [{ row: 2, field: "region", message: "inactive" }],
    errorsTruncated: false,
  });

  await assert.rejects(
    service.importGeography(actor, councilId, { rows: [{ region: "North", county: "Example", subcounty: "Town", zone: "Central", cluster: "Cluster A" }] }),
    (error) => error.getStatus() === 400,
  );
  assert.equal(transactionStarted, false);
});

test("geography CSV preview counts distinct paths and planned nodes without writing", async () => {
  let writes = 0;
  const client = {
    council: { findUnique: async () => ({ id: councilId, name: "Example Council", slug: "example", status: "ACTIVE" }) },
    region: { findMany: async () => [], create: async () => { writes += 1; } },
  };
  const service = new PlatformCouncilService({ client });
  const result = await service.previewGeographyImport(councilId, {
    rows: [
      { region: "North", county: "County A", subcounty: "A1", zone: "A1-1", cluster: "Blue" },
      { region: " North ", county: "County A", subcounty: "A1", zone: "A1-1", cluster: "Green" },
      { region: "North", county: "County A", subcounty: "A1", zone: "A1-1", cluster: "Blue" },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.rowsReceived, 3);
  assert.equal(result.uniqueClusters, 2);
  assert.deepEqual(result.toCreate, { regions: 1, counties: 1, subcounties: 1, zones: 1, clusters: 2 });
  assert.equal(writes, 0);
});

test("geography CSV preview rejects inactive existing hierarchy nodes", async () => {
  const client = {
    council: { findUnique: async () => ({ id: councilId, name: "Example Council", slug: "example", status: "ACTIVE" }) },
    region: { findMany: async () => [{ id: regionId, name: "North", status: "INACTIVE", counties: [] }] },
  };
  const result = await new PlatformCouncilService({ client }).previewGeographyImport(councilId, {
    rows: [{ region: "North", county: "County A", subcounty: "A1", zone: "A1-1", cluster: "Blue" }],
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors[0].field, "region");
  assert.match(result.errors[0].message, /inactive/);
});

test("geography CSV import creates the hierarchy atomically and records an audit event", async () => {
  let nextId = 0;
  const nextNode = () => ({ id: `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`, status: "ACTIVE" });
  const created = { regions: 0, counties: 0, subcounties: 0, zones: 0, clusters: 0 };
  const audit = [];
  const tx = {
    council: { findUnique: async () => ({ id: councilId, status: "ACTIVE" }) },
    region: { findFirst: async () => null, create: async () => { created.regions += 1; return nextNode(); } },
    county: { findFirst: async () => null, create: async () => { created.counties += 1; return nextNode(); } },
    subcounty: { findFirst: async () => null, create: async () => { created.subcounties += 1; return nextNode(); } },
    zone: { findFirst: async () => null, create: async () => { created.zones += 1; return nextNode(); } },
    cluster: { findFirst: async () => null, create: async () => { created.clusters += 1; return nextNode(); } },
    auditEvent: { create: async ({ data }) => { audit.push(data); return data; } },
  };
  const client = {
    council: { findUnique: async () => ({ id: councilId, name: "Example Council", slug: "example", status: "ACTIVE" }) },
    region: { findMany: async () => [] },
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      assert.equal(options.maxWait, 10_000);
      assert.equal(options.timeout, 60_000);
      return callback(tx);
    },
  };
  const result = await new PlatformCouncilService({ client }).importGeography(actor, councilId, {
    rows: [
      { region: "North", county: "County A", subcounty: "A1", zone: "A1-1", cluster: "Blue" },
      { region: "North", county: "County A", subcounty: "A1", zone: "A1-1", cluster: "Green" },
    ],
  });

  assert.equal(result.status, "IMPORTED");
  assert.deepEqual(result.created, { regions: 1, counties: 1, subcounties: 1, zones: 1, clusters: 2 });
  assert.deepEqual(created, result.created);
  assert.equal(audit[0].action, "PLATFORM_GEOGRAPHY_IMPORTED");
  assert.equal(audit[0].actorAccountId, actor.accountId);
});
