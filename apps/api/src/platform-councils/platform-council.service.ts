import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CreateCouncilDto } from "./dto/create-council.dto";
import {
  CreateGeographyNodeDto,
  GeographyNodeType,
} from "./dto/create-geography-node.dto";
import { GeographyImportDto } from "./dto/geography-import.dto";

interface PlatformActor {
  accountId: string;
}


function cleanGeographyName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function geographyKey(value: string): string {
  return cleanGeographyName(value).toLocaleLowerCase("en");
}

type ImportNode = { id: string; status: string };
type ImportCounts = { regions: number; counties: number; subcounties: number; zones: number; clusters: number };

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

@Injectable()
export class PlatformCouncilService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.client.council.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { regions: true, registrations: true } },
      },
    });
  }

  async create(actor: PlatformActor, input: CreateCouncilDto) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const council = await tx.council.create({
          data: { name: input.name.trim(), slug: input.slug.trim().toLowerCase() },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId: council.id,
            action: "PLATFORM_COUNCIL_CREATED",
            resourceType: "Council",
            resourceId: council.id,
            decision: "ALLOW",
            metadata: { slug: council.slug },
          },
        });
        return council;
      });
    } catch (error) {
      if (prismaCode(error) === "P2002") {
        throw new ConflictException("A Council with this slug already exists.");
      }
      throw error;
    }
  }

  async getGeography(councilId: string) {
    const council = await this.prisma.client.council.findUnique({
      where: { id: councilId },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!council) throw new NotFoundException("Council not found.");

    const regions = await this.prisma.client.region.findMany({
      where: { councilId },
      orderBy: { name: "asc" },
      include: {
        counties: {
          orderBy: { name: "asc" },
          include: {
            subcounties: {
              orderBy: { name: "asc" },
              include: {
                zones: {
                  orderBy: { name: "asc" },
                  include: { clusters: { orderBy: { name: "asc" } } },
                },
              },
            },
          },
        },
      },
    });
    return { council, regions };
  }

  async previewGeographyImport(councilId: string, input: GeographyImportDto) {
    const { council, regions } = await this.getGeography(councilId);
    if (council.status !== "ACTIVE") {
      throw new ConflictException("Geography cannot be imported into an inactive Council.");
    }

    const regionMap = new Map<string, ImportNode>();
    const countyMap = new Map<string, ImportNode>();
    const subcountyMap = new Map<string, ImportNode>();
    const zoneMap = new Map<string, ImportNode>();
    const clusterMap = new Map<string, ImportNode>();
    for (const region of regions) {
      regionMap.set(geographyKey(region.name), { id: region.id, status: region.status });
      for (const county of region.counties) {
        countyMap.set(`${region.id}|${geographyKey(county.name)}`, { id: county.id, status: county.status });
        for (const subcounty of county.subcounties) {
          subcountyMap.set(`${county.id}|${geographyKey(subcounty.name)}`, { id: subcounty.id, status: subcounty.status });
          for (const zone of subcounty.zones) {
            zoneMap.set(`${subcounty.id}|${geographyKey(zone.name)}`, { id: zone.id, status: zone.status });
            for (const cluster of zone.clusters) {
              clusterMap.set(`${zone.id}|${geographyKey(cluster.name)}`, { id: cluster.id, status: cluster.status });
            }
          }
        }
      }
    }

    const counts: ImportCounts = { regions: 0, counties: 0, subcounties: 0, zones: 0, clusters: 0 };
    const uniqueClusterPaths = new Set<string>();
    const errors: Array<{ row: number; field: string; message: string }> = [];
    const ensurePlanned = (
      map: Map<string, ImportNode>,
      key: string,
      name: string,
      type: keyof ImportCounts,
      rowNumber: number,
      field: string,
    ): ImportNode | null => {
      const existing = map.get(key);
      if (existing) {
        if (existing.status !== "ACTIVE") {
          errors.push({ row: rowNumber, field, message: `The ${field} '${name}' already exists but is inactive. Reactivate it through an approved governance workflow before importing.` });
          return null;
        }
        return existing;
      }
      const planned = { id: `new:${type}:${key}`, status: "ACTIVE" };
      map.set(key, planned);
      counts[type] += 1;
      return planned;
    };

    input.rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const values = {
        region: cleanGeographyName(row.region),
        county: cleanGeographyName(row.county),
        subcounty: cleanGeographyName(row.subcounty),
        zone: cleanGeographyName(row.zone),
        cluster: cleanGeographyName(row.cluster),
      };
      const empty = Object.entries(values).filter(([, value]) => value.length < 2);
      if (empty.length > 0) {
        for (const [field] of empty) errors.push({ row: rowNumber, field, message: `${field} is required.` });
        return;
      }

      const region = ensurePlanned(regionMap, geographyKey(values.region), values.region, "regions", rowNumber, "region");
      if (!region) return;
      const county = ensurePlanned(countyMap, `${region.id}|${geographyKey(values.county)}`, values.county, "counties", rowNumber, "county");
      if (!county) return;
      const subcounty = ensurePlanned(subcountyMap, `${county.id}|${geographyKey(values.subcounty)}`, values.subcounty, "subcounties", rowNumber, "subcounty");
      if (!subcounty) return;
      const zone = ensurePlanned(zoneMap, `${subcounty.id}|${geographyKey(values.zone)}`, values.zone, "zones", rowNumber, "zone");
      if (!zone) return;
      const cluster = ensurePlanned(clusterMap, `${zone.id}|${geographyKey(values.cluster)}`, values.cluster, "clusters", rowNumber, "cluster");
      if (!cluster) return;
      uniqueClusterPaths.add([
        geographyKey(values.region),
        geographyKey(values.county),
        geographyKey(values.subcounty),
        geographyKey(values.zone),
        geographyKey(values.cluster),
      ].join("|"));
    });

    return {
      valid: errors.length === 0,
      rowsReceived: input.rows.length,
      uniqueClusters: uniqueClusterPaths.size,
      toCreate: counts,
      errors: errors.slice(0, 100),
      errorsTruncated: errors.length > 100,
    };
  }

  async importGeography(actor: PlatformActor, councilId: string, input: GeographyImportDto) {
    const preview = await this.previewGeographyImport(councilId, input);
    if (!preview.valid) {
      throw new BadRequestException({
        code: "GEOGRAPHY_IMPORT_INVALID",
        message: "Correct the geography import errors before committing.",
        errors: preview.errors,
        errorsTruncated: preview.errorsTruncated,
      });
    }

    const counts: ImportCounts = { regions: 0, counties: 0, subcounties: 0, zones: 0, clusters: 0 };
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const council = await tx.council.findUnique({
          where: { id: councilId },
          select: { id: true, status: true },
        });
        if (!council) throw new NotFoundException("Council not found.");
        if (council.status !== "ACTIVE") throw new ConflictException("Geography cannot be imported into an inactive Council.");

        const regionCache = new Map<string, { id: string; status: string }>();
        const countyCache = new Map<string, { id: string; status: string }>();
        const subcountyCache = new Map<string, { id: string; status: string }>();
        const zoneCache = new Map<string, { id: string; status: string }>();
        const clusterCache = new Map<string, { id: string; status: string }>();

        const getOrCreateRegion = async (name: string) => {
          const key = geographyKey(name);
          const cached = regionCache.get(key);
          if (cached) return cached;
          const existing = await tx.region.findFirst({ where: { councilId, name: { equals: cleanGeographyName(name), mode: "insensitive" } }, select: { id: true, status: true } });
          if (existing && existing.status !== "ACTIVE") throw new ConflictException(`Region '${name}' is inactive.`);
          const node = existing ?? await tx.region.create({ data: { councilId, name: cleanGeographyName(name) }, select: { id: true, status: true } });
          if (!existing) counts.regions += 1;
          regionCache.set(key, node);
          return node;
        };
        const getOrCreateCounty = async (regionId: string, name: string) => {
          const key = `${regionId}|${geographyKey(name)}`;
          const cached = countyCache.get(key);
          if (cached) return cached;
          const existing = await tx.county.findFirst({ where: { councilId, regionId, name: { equals: cleanGeographyName(name), mode: "insensitive" } }, select: { id: true, status: true } });
          if (existing && existing.status !== "ACTIVE") throw new ConflictException(`County '${name}' is inactive.`);
          const node = existing ?? await tx.county.create({ data: { councilId, regionId, name: cleanGeographyName(name) }, select: { id: true, status: true } });
          if (!existing) counts.counties += 1;
          countyCache.set(key, node);
          return node;
        };
        const getOrCreateSubcounty = async (countyId: string, name: string) => {
          const key = `${countyId}|${geographyKey(name)}`;
          const cached = subcountyCache.get(key);
          if (cached) return cached;
          const existing = await tx.subcounty.findFirst({ where: { councilId, countyId, name: { equals: cleanGeographyName(name), mode: "insensitive" } }, select: { id: true, status: true } });
          if (existing && existing.status !== "ACTIVE") throw new ConflictException(`Subcounty '${name}' is inactive.`);
          const node = existing ?? await tx.subcounty.create({ data: { councilId, countyId, name: cleanGeographyName(name) }, select: { id: true, status: true } });
          if (!existing) counts.subcounties += 1;
          subcountyCache.set(key, node);
          return node;
        };
        const getOrCreateZone = async (subcountyId: string, name: string) => {
          const key = `${subcountyId}|${geographyKey(name)}`;
          const cached = zoneCache.get(key);
          if (cached) return cached;
          const existing = await tx.zone.findFirst({ where: { councilId, subcountyId, name: { equals: cleanGeographyName(name), mode: "insensitive" } }, select: { id: true, status: true } });
          if (existing && existing.status !== "ACTIVE") throw new ConflictException(`Zone '${name}' is inactive.`);
          const node = existing ?? await tx.zone.create({ data: { councilId, subcountyId, name: cleanGeographyName(name) }, select: { id: true, status: true } });
          if (!existing) counts.zones += 1;
          zoneCache.set(key, node);
          return node;
        };
        const getOrCreateCluster = async (zoneId: string, name: string) => {
          const key = `${zoneId}|${geographyKey(name)}`;
          const cached = clusterCache.get(key);
          if (cached) return cached;
          const existing = await tx.cluster.findFirst({ where: { councilId, zoneId, name: { equals: cleanGeographyName(name), mode: "insensitive" } }, select: { id: true, status: true } });
          if (existing && existing.status !== "ACTIVE") throw new ConflictException(`Cluster '${name}' is inactive.`);
          const node = existing ?? await tx.cluster.create({ data: { councilId, zoneId, name: cleanGeographyName(name) }, select: { id: true, status: true } });
          if (!existing) counts.clusters += 1;
          clusterCache.set(key, node);
          return node;
        };

        for (const row of input.rows) {
          const region = await getOrCreateRegion(row.region);
          const county = await getOrCreateCounty(region.id, row.county);
          const subcounty = await getOrCreateSubcounty(county.id, row.subcounty);
          const zone = await getOrCreateZone(subcounty.id, row.zone);
          await getOrCreateCluster(zone.id, row.cluster);
        }

        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId,
            action: "PLATFORM_GEOGRAPHY_IMPORTED",
            resourceType: "CouncilGeography",
            resourceId: councilId,
            decision: "ALLOW",
            metadata: { rowsReceived: input.rows.length, created: counts },
          },
        });
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
    } catch (error) {
      if (prismaCode(error) === "P2002" || prismaCode(error) === "P2034") {
        throw new ConflictException("The geography changed during import. Preview the file again and retry.");
      }
      throw error;
    }

    return { status: "IMPORTED", rowsReceived: input.rows.length, created: counts };
  }

  async createGeographyNode(
    actor: PlatformActor,
    councilId: string,
    input: CreateGeographyNodeDto,
  ) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const council = await tx.council.findUnique({
          where: { id: councilId },
          select: { id: true, status: true },
        });
        if (!council) throw new NotFoundException("Council not found.");
        if (council.status !== "ACTIVE") {
          throw new ConflictException("Geography cannot be changed for an inactive Council.");
        }

        if (input.type !== GeographyNodeType.REGION && !input.parentId) {
          throw new BadRequestException("A parent node is required for this geography level.");
        }
        const name = input.name.trim();
        const code = input.code?.trim() || null;
        let node: { id: string; name: string; code: string | null; status: string };
        let resourceType: string;

        switch (input.type) {
          case GeographyNodeType.REGION: {
            if (input.parentId) throw new BadRequestException("A Region cannot have a parent node.");
            node = await tx.region.create({
              data: { councilId, name, code },
              select: { id: true, name: true, code: true, status: true },
            });
            resourceType = "Region";
            break;
          }
          case GeographyNodeType.COUNTY: {
            const parent = await tx.region.findFirst({
              where: { id: input.parentId!, councilId, status: "ACTIVE" },
              select: { id: true },
            });
            if (!parent) throw new NotFoundException("Active parent Region not found in this Council.");
            node = await tx.county.create({
              data: { councilId, regionId: parent.id, name, code },
              select: { id: true, name: true, code: true, status: true },
            });
            resourceType = "County";
            break;
          }
          case GeographyNodeType.SUBCOUNTY: {
            const parent = await tx.county.findFirst({
              where: { id: input.parentId!, councilId, status: "ACTIVE" },
              select: { id: true },
            });
            if (!parent) throw new NotFoundException("Active parent County not found in this Council.");
            node = await tx.subcounty.create({
              data: { councilId, countyId: parent.id, name, code },
              select: { id: true, name: true, code: true, status: true },
            });
            resourceType = "Subcounty";
            break;
          }
          case GeographyNodeType.ZONE: {
            const parent = await tx.subcounty.findFirst({
              where: { id: input.parentId!, councilId, status: "ACTIVE" },
              select: { id: true },
            });
            if (!parent) throw new NotFoundException("Active parent Subcounty not found in this Council.");
            node = await tx.zone.create({
              data: { councilId, subcountyId: parent.id, name, code },
              select: { id: true, name: true, code: true, status: true },
            });
            resourceType = "Zone";
            break;
          }
          case GeographyNodeType.CLUSTER: {
            const parent = await tx.zone.findFirst({
              where: { id: input.parentId!, councilId, status: "ACTIVE" },
              select: { id: true },
            });
            if (!parent) throw new NotFoundException("Active parent Zone not found in this Council.");
            node = await tx.cluster.create({
              data: { councilId, zoneId: parent.id, name, code },
              select: { id: true, name: true, code: true, status: true },
            });
            resourceType = "Cluster";
            break;
          }
          default:
            throw new BadRequestException("Unsupported geography node type.");
        }

        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId,
            action: "PLATFORM_GEOGRAPHY_NODE_CREATED",
            resourceType,
            resourceId: node.id,
            decision: "ALLOW",
            metadata: { type: input.type, parentId: input.parentId ?? null },
          },
        });
        return { type: input.type, ...node };
      });
    } catch (error) {
      if (prismaCode(error) === "P2002") {
        throw new ConflictException("A geography item with this name already exists under the selected parent.");
      }
      throw error;
    }
  }
}
