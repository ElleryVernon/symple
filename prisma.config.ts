import { defineConfig } from "prisma/config";

// Prisma 7 은 .env 를 자동 로드하지 않으므로 직접 로드 (Node 20.12+/22).
// 프로덕션처럼 환경변수가 이미 주입된 경우엔 .env 가 없어도 무시.
try {
  process.loadEnvFile();
} catch {
  /* .env 없음 — 주입된 환경변수 사용 */
}

// Prisma 7: 연결 URL 은 더 이상 schema.prisma 에 두지 않고 여기서 지정한다.
// (런타임 클라이언트는 lib/prisma.ts 에서 driver adapter 로 연결)
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // 마이그레이션 / db push 는 직결(session-mode, 5432) URL 을 사용한다.
  // 런타임 풀러(pgbouncer transaction-mode, 6543)는 prepared statement /
  // advisory lock 을 지원하지 않아 스키마 작업에 부적합 → DIRECT_URL 우선.
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
