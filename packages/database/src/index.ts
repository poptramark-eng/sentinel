import dotenv from "dotenv";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

export { PrismaClient };

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize the database client.");
  }

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });

  return {
    client,
    async disconnect() {
      await client.$disconnect();
    },
  };
}
