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

interface PlatformActor {
  accountId: string;
}

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
