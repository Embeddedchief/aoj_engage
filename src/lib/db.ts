import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "../../scripts/db-url.mjs";

// Accept whatever name the hosting integration used (DATABASE_URL, POSTGRES_URL, PREFIX_DATABASE_URL…).
if (!process.env.DATABASE_URL) {
  const found = resolveDatabaseUrl();
  if (found) process.env.DATABASE_URL = found.url;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
