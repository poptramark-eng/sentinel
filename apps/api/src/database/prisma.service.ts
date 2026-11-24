import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createPrismaClient } from "@cbe/database";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly database = createPrismaClient();
  readonly client = this.database.client;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.database.disconnect();
  }
}
