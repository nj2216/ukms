import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL must be configured");

  const url = new URL(rawUrl);
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql:// scheme");
  }

  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    connectionLimit: 10,
    ...(process.env.DATABASE_SSL === "true" ? { ssl: true } : {}),
  });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as typeof globalThis & {
  ukmsPrisma?: PrismaClient;
};

function getPrismaClient() {
  globalForPrisma.ukmsPrisma ??= createPrismaClient();
  return globalForPrisma.ukmsPrisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});
