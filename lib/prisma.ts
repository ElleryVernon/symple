import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// 개발 모드 HMR 에서 PrismaClient 가 매번 새로 생성돼 커넥션이 고갈되는 것을 막는 싱글톤.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma() {
  // Prisma 7: 런타임 연결은 driver adapter(node-postgres) 로 한다.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
